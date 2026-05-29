from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from supabase import Client, create_client

from crypto_bot_worker.config import Settings
from crypto_bot_worker.models import BotSettingsRecord, Candle, CommandRecord, DailyMetricRecord, PositionRecord


class SupabaseRepository:
    def __init__(self, settings: Settings) -> None:
        self._client: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    def list_bot_settings(self) -> list[BotSettingsRecord]:
        response = self._client.table("bot_settings").select("*").execute()
        return [BotSettingsRecord.model_validate(row) for row in response.data or []]

    def get_bot_settings(self, user_id: str) -> BotSettingsRecord:
        response = self._client.table("bot_settings").select("*").eq("user_id", user_id).single().execute()
        return BotSettingsRecord.model_validate(response.data)

    def update_bot_settings(self, user_id: str, changes: dict[str, Any]) -> None:
        self._client.table("bot_settings").update(changes).eq("user_id", user_id).execute()

    def fetch_pending_commands(self, user_id: str) -> list[CommandRecord]:
        response = (
            self._client.table("bot_commands")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "pending")
            .order("requested_at")
            .execute()
        )
        return [CommandRecord.model_validate(row) for row in response.data or []]

    def mark_command_status(self, command_id: str, status: str, error_message: str | None = None) -> None:
        self._client.table("bot_commands").update(
            {
                "status": status,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": error_message,
            }
        ).eq("id", command_id).execute()

    def upsert_market_bars(self, user_id: str, symbol: str, timeframe: str, candles: list[Candle]) -> None:
        rows = [
            {
                "user_id": user_id,
                "symbol": symbol,
                "timeframe": timeframe,
                "opened_at": candle.opened_at.isoformat(),
                "open": candle.open,
                "high": candle.high,
                "low": candle.low,
                "close": candle.close,
                "volume": candle.volume,
            }
            for candle in candles
        ]
        if rows:
            self._client.table("market_bars").upsert(rows, on_conflict="user_id,symbol,timeframe,opened_at").execute()

    def insert_llm_analysis(self, user_id: str, symbol: str, timeframe: str, payload: dict[str, Any]) -> str:
        response = (
            self._client.table("llm_analyses")
            .insert(
                {
                    "user_id": user_id,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    **payload,
                }
            )
            .execute()
        )
        return response.data[0]["id"]

    def insert_signal(self, user_id: str, llm_analysis_id: str | None, payload: dict[str, Any]) -> str:
        response = (
            self._client.table("signals")
            .insert(
                {
                    "user_id": user_id,
                    "llm_analysis_id": llm_analysis_id,
                    **payload,
                }
            )
            .execute()
        )
        return response.data[0]["id"]

    def update_signal_outcome(self, signal_id: str, payload: dict[str, Any]) -> None:
        self._client.table("signals").update(payload).eq("id", signal_id).execute()

    def list_open_positions(self, user_id: str, mode: str) -> list[PositionRecord]:
        response = (
            self._client.table("positions")
            .select("*")
            .eq("user_id", user_id)
            .eq("mode", mode)
            .eq("status", "open")
            .execute()
        )
        return [PositionRecord.model_validate(row) for row in response.data or []]

    def get_open_position(self, user_id: str, mode: str, symbol: str) -> PositionRecord | None:
        response = (
            self._client.table("positions")
            .select("*")
            .eq("user_id", user_id)
            .eq("mode", mode)
            .eq("symbol", symbol)
            .eq("status", "open")
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return PositionRecord.model_validate(response.data[0])

    def insert_order(self, payload: dict[str, Any]) -> str:
        response = self._client.table("orders").insert(payload).execute()
        return response.data[0]["id"]

    def update_order(self, order_id: str, payload: dict[str, Any]) -> None:
        self._client.table("orders").update(payload).eq("id", order_id).execute()

    def insert_fill(self, payload: dict[str, Any]) -> None:
        self._client.table("fills").insert(payload).execute()

    def open_position(self, payload: dict[str, Any]) -> None:
        self._client.table("positions").insert(payload).execute()

    def update_position(self, position_id: str, payload: dict[str, Any]) -> None:
        self._client.table("positions").update(payload).eq("id", position_id).execute()

    def close_position(self, position_id: str, payload: dict[str, Any]) -> None:
        self._client.table("positions").update(payload).eq("id", position_id).execute()

    def insert_risk_event(self, payload: dict[str, Any]) -> None:
        self._client.table("risk_events").insert(payload).execute()

    def get_daily_metric(self, user_id: str, mode: str, trading_day: date) -> DailyMetricRecord | None:
        response = (
            self._client.table("daily_metrics")
            .select("*")
            .eq("user_id", user_id)
            .eq("mode", mode)
            .eq("trading_day", trading_day.isoformat())
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return DailyMetricRecord.model_validate(response.data[0])

    def upsert_daily_metrics(self, metric: DailyMetricRecord) -> None:
        self._client.table("daily_metrics").upsert(
            {
                "user_id": metric.user_id,
                "mode": metric.mode,
                "trading_day": metric.trading_day.isoformat(),
                "gross_pnl": metric.gross_pnl,
                "net_pnl": metric.net_pnl,
                "fee_total": metric.fee_total,
                "slippage_total": metric.slippage_total,
                "win_rate": metric.win_rate,
                "trades_count": metric.trades_count,
                "predictions_hit": metric.predictions_hit,
                "predictions_total": metric.predictions_total,
            },
            on_conflict="user_id,mode,trading_day",
        ).execute()

    def get_recent_metrics(self, user_id: str, mode: str, limit: int = 7) -> list[DailyMetricRecord]:
        response = (
            self._client.table("daily_metrics")
            .select("*")
            .eq("user_id", user_id)
            .eq("mode", mode)
            .order("trading_day", desc=True)
            .limit(limit)
            .execute()
        )
        return [DailyMetricRecord.model_validate(row) for row in response.data or []]

    def get_cumulative_performance(self, user_id: str, mode: str) -> dict[str, float]:
        response = self._client.table("daily_metrics").select("*").eq("user_id", user_id).eq("mode", mode).execute()
        gross = sum(float(row["gross_pnl"]) for row in response.data or [])
        net = sum(float(row["net_pnl"]) for row in response.data or [])
        fees = sum(float(row["fee_total"]) for row in response.data or [])
        return {"gross_pnl": gross, "net_pnl": net, "fee_total": fees}

    def get_peak_equity(self, user_id: str, mode: str) -> float:
        response = (
            self._client.table("equity_snapshots")
            .select("total_equity")
            .eq("user_id", user_id)
            .eq("mode", mode)
            .order("total_equity", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return 0.0
        return float(response.data[0]["total_equity"])

    def insert_equity_snapshot(self, payload: dict[str, Any]) -> None:
        self._client.table("equity_snapshots").insert(payload).execute()

