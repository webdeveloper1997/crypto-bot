from __future__ import annotations

import logging
import time
from datetime import UTC, date, datetime
from typing import Any

from crypto_bot_worker.config import Settings
from crypto_bot_worker.models import BotMode, BotSettingsRecord, DailyMetricRecord, ExecutedOrder, LlmAssessment, PositionRecord, SignalDecision
from crypto_bot_worker.services.binance import BinanceQuantityError, BinanceService
from crypto_bot_worker.services.brokers import BinanceBroker, PaperBroker
from crypto_bot_worker.services.gemini import GeminiResearchService
from crypto_bot_worker.services.repository import SupabaseRepository
from crypto_bot_worker.strategy.engine import StrategyEngine

LOGGER = logging.getLogger(__name__)


class CryptoBotWorker:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._repo = SupabaseRepository(settings)
        self._binance = BinanceService(settings)
        self._paper_broker = PaperBroker(settings)
        self._binance_broker = BinanceBroker(self._binance)
        self._research = GeminiResearchService(settings, self._repo)
        self._strategy = StrategyEngine()

    def run_forever(self, once: bool = False) -> None:
        while True:
            try:
                self.run_cycle()
            except Exception:  # noqa: BLE001
                LOGGER.exception("Worker cycle failed")

            if once:
                return

            time.sleep(self._settings.poll_interval_seconds)

    def run_cycle(self) -> None:
        for bot in self._repo.list_bot_settings():
            self._process_commands(bot)
            bot = self._repo.get_bot_settings(bot.user_id)
            self._process_bot(bot)

    def _process_commands(self, bot: BotSettingsRecord) -> None:
        pending_commands = self._repo.fetch_pending_commands(bot.user_id)
        if not pending_commands:
            return

        for command in pending_commands:
            try:
                if command.command_type == "switch_mode":
                    target_mode = command.payload.get("targetMode")
                    if target_mode not in {"paper", "testnet", "live"}:
                        raise ValueError("switch_mode requires payload.targetMode")
                    if target_mode == "live" and not self._settings.allow_live_trading:
                        raise ValueError("ALLOW_LIVE_TRADING=false blocks live orders on the worker.")
                    open_positions = self._repo.list_open_positions(bot.user_id, bot.actual_mode)
                    if open_positions and target_mode != bot.actual_mode:
                        raise ValueError("Flatten positions before switching execution mode.")
                    self._repo.update_bot_settings(
                        bot.user_id,
                        {"desired_mode": target_mode, "actual_mode": target_mode},
                    )

                elif command.command_type == "start_bot":
                    self._repo.update_bot_settings(bot.user_id, {"is_running": True})

                elif command.command_type == "stop_bot":
                    self._repo.update_bot_settings(bot.user_id, {"is_running": False})

                elif command.command_type == "flatten_all":
                    self._flatten_all(bot)

                elif command.command_type == "reconcile":
                    self._repo.insert_risk_event(
                        {
                            "user_id": bot.user_id,
                            "event_type": "manual_reconcile",
                            "severity": "info",
                            "mode": bot.actual_mode,
                            "message": "Reconcile command acknowledged. Full exchange reconciliation is pending future expansion.",
                        }
                    )

                self._repo.mark_command_status(command.id, "applied")
            except Exception as exc:  # noqa: BLE001
                self._repo.mark_command_status(command.id, "failed", str(exc))
                self._repo.insert_risk_event(
                    {
                        "user_id": bot.user_id,
                        "event_type": "command_failed",
                        "severity": "warning",
                        "mode": bot.actual_mode,
                        "message": str(exc),
                        "details": {"command_id": command.id, "command_type": command.command_type},
                    }
                )

    def _process_bot(self, bot: BotSettingsRecord) -> None:
        self._research.sync_keys(bot.user_id)
        if not bot.is_running:
            self._snapshot_equity(bot, {})
            return

        open_positions = {position.symbol: position for position in self._repo.list_open_positions(bot.user_id, bot.actual_mode)}
        latest_prices: dict[str, float] = {}

        if self._hit_risk_halt(bot):
            LOGGER.warning("Risk halt triggered for user %s", bot.user_id)
            return

        for symbol in bot.symbols:
            try:
                executed, latest_price = self._process_symbol(bot, symbol, open_positions)
                latest_prices[symbol] = latest_price
                if executed:
                    open_positions = {position.symbol: position for position in self._repo.list_open_positions(bot.user_id, bot.actual_mode)}
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Symbol cycle failed for %s", symbol)
                self._repo.insert_risk_event(
                    {
                        "user_id": bot.user_id,
                        "event_type": "symbol_cycle_failed",
                        "severity": "warning",
                        "mode": bot.actual_mode,
                        "symbol": symbol,
                        "message": self._safe_error_message(exc),
                        "details": self._exception_details(exc),
                    }
                )

        self._snapshot_equity(bot, latest_prices)

    def _process_symbol(
        self,
        bot: BotSettingsRecord,
        symbol: str,
        open_positions: dict[str, PositionRecord],
    ) -> tuple[ExecutedOrder | None, float]:
        candles = self._binance.get_klines(symbol=symbol, interval=bot.timeframe, limit=self._settings.candle_limit)
        self._repo.upsert_market_bars(bot.user_id, symbol, bot.timeframe, candles[-120:])
        market_price = self._binance.get_last_price(symbol)
        position = open_positions.get(symbol)

        managed_exit = self._build_managed_exit_signal(bot, symbol, market_price, position)
        if managed_exit is not None:
            signal_id = self._persist_signal(bot, managed_exit, None)
            return self._maybe_execute(bot, signal_id, managed_exit, position, market_price), market_price

        base_signal = self._strategy.build_signal(
            symbol=symbol,
            timeframe=bot.timeframe,
            candles=candles,
            has_open_position=position is not None,
            estimated_round_trip_cost_bps=self._estimated_round_trip_cost_bps(bot),
            min_profit_buffer_bps=self._settings.min_profit_buffer_bps,
            min_expected_move_bps=self._settings.min_expected_move_bps,
            min_volume_ratio=self._settings.min_volume_ratio,
            max_entry_atr_bps=self._settings.max_entry_atr_bps,
            min_reward_risk=self._settings.min_reward_risk,
        )
        llm_assessment = self._maybe_analyze(bot.user_id, base_signal, candles)
        signal = self._strategy.apply_llm_filter(base_signal, llm_assessment)
        llm_analysis_id = self._persist_llm_analysis(bot, symbol, llm_assessment)
        signal_id = self._persist_signal(bot, signal, llm_analysis_id)
        return self._maybe_execute(bot, signal_id, signal, position, market_price), market_price

    def _maybe_analyze(self, user_id: str, signal, candles) -> LlmAssessment:
        if signal.predicted_direction == "hold":
            return LlmAssessment(one_sentence_reason="No actionable signal; LLM skipped.")
        return self._research.analyze_signal(user_id, signal, candles)

    def _persist_llm_analysis(self, bot: BotSettingsRecord, symbol: str, assessment: LlmAssessment) -> str | None:
        if not assessment.raw_response:
            return None
        return self._repo.insert_llm_analysis(
            bot.user_id,
            symbol,
            bot.timeframe,
            {
                "sentiment": assessment.sentiment,
                "risk_flag": assessment.risk_flag,
                "confidence": assessment.confidence,
                "rationale": assessment.one_sentence_reason,
                "raw_response": assessment.raw_response,
            },
        )

    def _persist_signal(self, bot: BotSettingsRecord, signal: SignalDecision, llm_analysis_id: str | None) -> str:
        return self._repo.insert_signal(
            bot.user_id,
            llm_analysis_id,
            {
                "mode": bot.actual_mode,
                "symbol": signal.symbol,
                "timeframe": signal.timeframe,
                "generated_at": datetime.now(UTC).isoformat(),
                "predicted_direction": signal.predicted_direction,
                "confidence": signal.confidence,
                "expected_move_bps": signal.expected_move_bps,
                "score": signal.score,
                "regime": signal.regime,
                "rationale": signal.rationale,
                "entry_plan": signal.entry_plan,
                "stop_plan": signal.stop_plan,
                "take_profit_plan": signal.take_profit_plan,
                "strategy_version": signal.strategy_version,
            },
        )

    def _build_managed_exit_signal(
        self,
        bot: BotSettingsRecord,
        symbol: str,
        market_price: float,
        position: PositionRecord | None,
    ) -> SignalDecision | None:
        if position is None:
            return None

        entry_signal = self._repo.get_signal(position.signal_id or "")
        stop_bps = self._planned_distance_bps(entry_signal, "stop_plan", fallback=max(8.0, self._settings.min_expected_move_bps / self._settings.min_reward_risk))
        take_profit_bps = self._planned_distance_bps(entry_signal, "take_profit_plan", fallback=self._settings.min_expected_move_bps)
        opened_at = position.opened_at if position.opened_at.tzinfo else position.opened_at.replace(tzinfo=UTC)
        minutes_held = (datetime.now(UTC) - opened_at).total_seconds() / 60
        gross_return_bps = ((market_price - position.average_entry) / position.average_entry) * 10000 if position.average_entry else 0.0

        reason: str | None = None
        confidence = 0.9
        if gross_return_bps >= take_profit_bps:
            reason = "take_profit_hit"
            confidence = 0.96
        elif gross_return_bps <= -stop_bps:
            reason = "stop_loss_hit"
            confidence = 0.98
        elif minutes_held >= self._settings.max_hold_minutes:
            reason = "max_hold_reached"
            confidence = 0.86

        if reason is None:
            return None

        return SignalDecision(
            symbol=symbol,
            timeframe=bot.timeframe,
            predicted_direction="sell",
            confidence=confidence,
            expected_move_bps=round(abs(gross_return_bps), 2),
            score=round(confidence * abs(gross_return_bps), 2),
            regime="managed-exit",
            rationale=f"Managed exit triggered: {reason}.",
            entry_plan={
                "trigger": "managed_exit",
                "reason": reason,
                "gross_return_bps": round(gross_return_bps, 2),
                "minutes_held": round(minutes_held, 2),
                "average_entry": position.average_entry,
                "market_price": market_price,
            },
            stop_plan={"distance_bps": round(stop_bps, 2)},
            take_profit_plan={"distance_bps": round(take_profit_bps, 2)},
        )

    @staticmethod
    def _planned_distance_bps(signal: dict[str, Any] | None, key: str, fallback: float) -> float:
        if not signal:
            return float(fallback)
        plan = signal.get(key) or {}
        try:
            return float(plan.get("distance_bps") or fallback)
        except (TypeError, ValueError):
            return float(fallback)

    def _maybe_execute(
        self,
        bot: BotSettingsRecord,
        signal_id: str,
        signal,
        position: PositionRecord | None,
        market_price: float,
    ) -> ExecutedOrder | None:
        if signal.predicted_direction == "hold":
            return None

        if signal.predicted_direction == "buy":
            if position is not None:
                return None
            allowed, reason = self._can_open_position(bot, signal.symbol, market_price)
            if not allowed:
                self._repo.insert_risk_event(
                    {
                        "user_id": bot.user_id,
                        "event_type": "entry_blocked",
                        "severity": "warning",
                        "mode": bot.actual_mode,
                        "symbol": signal.symbol,
                        "message": reason,
                    }
                )
                return None

            quantity = self._trade_notional(bot) / market_price
            try:
                execution = self._execute_order(bot.actual_mode, signal.symbol, "buy", quantity, market_price)
            except Exception as exc:  # noqa: BLE001
                self._persist_execution_failure(bot, signal_id, signal.symbol, "buy", quantity, market_price, exc)
                return None
            self._persist_execution(bot, signal_id, execution)
            self._repo.open_position(
                {
                    "user_id": bot.user_id,
                    "signal_id": signal_id,
                    "symbol": signal.symbol,
                    "mode": bot.actual_mode,
                    "status": "open",
                    "quantity": execution.quantity,
                    "average_entry": execution.price,
                    "fee_total": execution.commission_amount,
                }
            )
            return execution

        if signal.predicted_direction == "sell" and position is not None:
            try:
                execution = self._execute_order(bot.actual_mode, signal.symbol, "sell", position.quantity, market_price)
            except Exception as exc:  # noqa: BLE001
                self._persist_execution_failure(bot, signal_id, signal.symbol, "sell", position.quantity, market_price, exc)
                return None
            self._persist_execution(bot, signal_id, execution)
            gross_pnl = (execution.price - position.average_entry) * position.quantity
            total_fees = position.fee_total + execution.commission_amount
            net_pnl = gross_pnl - total_fees
            realized_return_bps = (net_pnl / (position.average_entry * position.quantity)) * 10000 if position.quantity else 0

            self._repo.close_position(
                position.id,
                {
                    "status": "closed",
                    "closed_at": execution.executed_at.isoformat(),
                    "realized_pnl": net_pnl,
                    "unrealized_pnl": 0,
                    "fee_total": total_fees,
                },
            )
            if position.signal_id:
                self._repo.update_signal_outcome(
                    position.signal_id,
                    {
                        "realized_return_bps": realized_return_bps,
                        "mae_bps": min(0, realized_return_bps),
                        "mfe_bps": max(0, realized_return_bps),
                        "fee_quote": total_fees,
                        "slippage_bps": execution.slippage_bps,
                        "hit": net_pnl > 0,
                    },
                )
            self._update_daily_metrics(
                user_id=bot.user_id,
                mode=bot.actual_mode,
                gross_pnl_delta=gross_pnl,
                net_pnl_delta=net_pnl,
                fee_delta=total_fees,
                slippage_delta=execution.slippage_bps,
                hit=net_pnl > 0,
            )
            return execution

        return None

    def _execute_order(self, mode: BotMode, symbol: str, side: str, quantity: float, market_price: float) -> ExecutedOrder:
        if mode == "paper":
            return self._paper_broker.execute(mode, symbol, side, quantity, market_price)
        return self._binance_broker.execute(mode, symbol, side, quantity, market_price)

    def _persist_execution(self, bot: BotSettingsRecord, signal_id: str, execution: ExecutedOrder) -> None:
        order_id = self._repo.insert_order(
            {
                "user_id": bot.user_id,
                "signal_id": signal_id,
                "broker_mode": execution.mode,
                "symbol": execution.symbol,
                "side": execution.side,
                "order_type": "market",
                "status": "filled",
                "client_order_id": execution.client_order_id,
                "exchange_order_id": execution.exchange_order_id,
                "quantity": execution.quantity,
                "price": execution.price,
                "fees_quote": execution.commission_amount,
                "raw_payload": execution.raw_payload,
            }
        )
        self._repo.insert_fill(
            {
                "user_id": bot.user_id,
                "order_id": order_id,
                "mode": execution.mode,
                "symbol": execution.symbol,
                "side": execution.side,
                "executed_at": execution.executed_at.isoformat(),
                "quantity": execution.quantity,
                "price": execution.price,
                "commission_asset": execution.commission_asset,
                "commission_amount": execution.commission_amount,
                "quote_amount": execution.quote_amount,
                "exchange_trade_id": execution.exchange_order_id,
            }
        )

    def _persist_execution_failure(
        self,
        bot: BotSettingsRecord,
        signal_id: str,
        symbol: str,
        side: str,
        quantity: float,
        market_price: float,
        exc: Exception,
    ) -> None:
        LOGGER.exception("Execution failed for %s %s", side, symbol)
        severity = "warning"
        event_type = "execution_failed"
        if isinstance(exc, BinanceQuantityError):
            event_type = "execution_blocked"
        self._repo.insert_risk_event(
            {
                "user_id": bot.user_id,
                "event_type": event_type,
                "severity": severity,
                "mode": bot.actual_mode,
                "symbol": symbol,
                "message": self._safe_error_message(exc),
                "details": {
                    "signal_id": signal_id,
                    "side": side,
                    "quantity": quantity,
                    "market_price": market_price,
                    **self._exception_details(exc),
                },
            }
        )

    def _update_daily_metrics(
        self,
        user_id: str,
        mode: BotMode,
        gross_pnl_delta: float,
        net_pnl_delta: float,
        fee_delta: float,
        slippage_delta: float,
        hit: bool,
    ) -> None:
        trading_day = date.today()
        current = self._repo.get_daily_metric(user_id, mode, trading_day)
        current = current or DailyMetricRecord(user_id=user_id, mode=mode, trading_day=trading_day)
        trades_count = current.trades_count + 1
        predictions_hit = current.predictions_hit + (1 if hit else 0)
        metric = DailyMetricRecord(
            user_id=user_id,
            mode=mode,
            trading_day=trading_day,
            gross_pnl=current.gross_pnl + gross_pnl_delta,
            net_pnl=current.net_pnl + net_pnl_delta,
            fee_total=current.fee_total + fee_delta,
            slippage_total=current.slippage_total + slippage_delta,
            trades_count=trades_count,
            predictions_hit=predictions_hit,
            predictions_total=current.predictions_total + 1,
            win_rate=predictions_hit / trades_count if trades_count else 0.0,
        )
        self._repo.upsert_daily_metrics(metric)

    def _can_open_position(self, bot: BotSettingsRecord, symbol: str, market_price: float) -> tuple[bool, str]:
        if bot.actual_mode == "live" and not self._settings.allow_live_trading:
            return False, "ALLOW_LIVE_TRADING=false blocks live mode."

        open_positions = self._repo.list_open_positions(bot.user_id, bot.actual_mode)
        if len(open_positions) >= bot.max_concurrent_positions:
            return False, "Max concurrent positions reached."

        trade_notional = self._trade_notional(bot)
        starting_balance = self._starting_balance(bot)
        exposure_now = 0.0
        for position in open_positions:
            position_price = market_price if position.symbol == symbol else self._binance.get_last_price(position.symbol)
            exposure_now += position.quantity * position_price
        symbol_exposure_pct = (trade_notional / starting_balance) * 100
        total_exposure_pct = ((exposure_now + trade_notional) / starting_balance) * 100

        if symbol_exposure_pct > bot.max_symbol_allocation_pct:
            return False, "Per-symbol exposure would exceed the configured cap."
        if total_exposure_pct > bot.max_total_exposure_pct:
            return False, "Total exposure would exceed the configured cap."
        return True, "ok"

    def _hit_risk_halt(self, bot: BotSettingsRecord) -> bool:
        recent_metrics = self._repo.get_recent_metrics(bot.user_id, bot.actual_mode, limit=7)
        if not recent_metrics:
            return False

        daily = recent_metrics[0].net_pnl
        weekly = sum(metric.net_pnl for metric in recent_metrics)
        starting_balance = self._starting_balance(bot)
        daily_loss_pct = abs(min(daily, 0)) / starting_balance * 100
        weekly_loss_pct = abs(min(weekly, 0)) / starting_balance * 100

        if daily_loss_pct >= bot.daily_drawdown_limit_pct or weekly_loss_pct >= bot.weekly_drawdown_limit_pct:
            self._repo.update_bot_settings(bot.user_id, {"is_running": False})
            self._repo.insert_risk_event(
                {
                    "user_id": bot.user_id,
                    "event_type": "drawdown_halt",
                    "severity": "critical",
                    "mode": bot.actual_mode,
                    "message": "Bot halted because drawdown limits were breached.",
                    "details": {
                        "daily_loss_pct": daily_loss_pct,
                        "weekly_loss_pct": weekly_loss_pct,
                    },
                }
            )
            return True

        return False

    def _snapshot_equity(self, bot: BotSettingsRecord, latest_prices: dict[str, float]) -> None:
        open_positions = self._repo.list_open_positions(bot.user_id, bot.actual_mode)
        cumulative = self._repo.get_cumulative_performance(bot.user_id, bot.actual_mode)
        invested_balance = 0.0
        unrealized_pnl = 0.0

        for position in open_positions:
            price = latest_prices.get(position.symbol) or self._binance.get_last_price(position.symbol)
            position_unrealized = (price - position.average_entry) * position.quantity
            invested_balance += price * position.quantity
            unrealized_pnl += position_unrealized
            self._repo.update_position(
                position.id,
                {
                    "unrealized_pnl": position_unrealized,
                },
            )

        starting_balance = self._starting_balance(bot)
        total_equity = starting_balance + cumulative["net_pnl"] + unrealized_pnl
        cash_balance = total_equity - invested_balance
        peak_equity = max(starting_balance, self._repo.get_peak_equity(bot.user_id, bot.actual_mode))
        drawdown_pct = ((peak_equity - total_equity) / peak_equity * 100) if peak_equity else 0

        self._repo.insert_equity_snapshot(
            {
                "user_id": bot.user_id,
                "mode": bot.actual_mode,
                "snapped_at": datetime.now(UTC).isoformat(),
                "cash_balance": cash_balance,
                "invested_balance": invested_balance,
                "total_equity": total_equity,
                "realized_pnl": cumulative["net_pnl"],
                "unrealized_pnl": unrealized_pnl,
                "fee_total": cumulative["fee_total"],
                "drawdown_pct": max(drawdown_pct, 0),
            }
        )

    def _flatten_all(self, bot: BotSettingsRecord) -> None:
        positions = self._repo.list_open_positions(bot.user_id, bot.actual_mode)
        latest_prices = {position.symbol: self._binance.get_last_price(position.symbol) for position in positions}

        for position in positions:
            signal_stub = type("SignalStub", (), {"symbol": position.symbol, "predicted_direction": "sell"})()
            self._maybe_execute(bot, position.signal_id or "", signal_stub, position, latest_prices[position.symbol])

    def _estimated_round_trip_cost_bps(self, bot: BotSettingsRecord) -> float:
        if bot.actual_mode == "paper":
            fee_bps = self._settings.paper_fee_rate * 10000
            slippage_bps = self._settings.paper_slippage_bps
        else:
            fee_bps = self._settings.live_fee_rate * 10000
            slippage_bps = self._settings.live_slippage_bps
        return (fee_bps * 2) + (slippage_bps * 2) + self._settings.estimated_spread_bps

    @staticmethod
    def _safe_error_message(exc: Exception) -> str:
        if isinstance(exc, BinanceQuantityError):
            return str(exc)
        message = str(exc)
        if "key=" in message:
            return message.split("key=", maxsplit=1)[0] + "key=<redacted>"
        return message[:500]

    @staticmethod
    def _exception_details(exc: Exception) -> dict[str, Any]:
        details: dict[str, Any] = {"error_type": type(exc).__name__}
        if isinstance(exc, BinanceQuantityError):
            details.update(exc.details)
        return details

    def _starting_balance(self, bot: BotSettingsRecord) -> float:
        return bot.paper_starting_balance if bot.actual_mode == "paper" else bot.live_starting_balance

    def _trade_notional(self, bot: BotSettingsRecord) -> float:
        return bot.paper_trade_notional if bot.actual_mode == "paper" else bot.live_trade_notional
