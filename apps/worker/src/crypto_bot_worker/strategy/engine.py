from __future__ import annotations

from crypto_bot_worker.models import Candle, LlmAssessment, SignalDecision
from crypto_bot_worker.strategy.indicators import candles_to_frame


class StrategyEngine:
    def build_signal(
        self,
        symbol: str,
        timeframe: str,
        candles: list[Candle],
        has_open_position: bool,
        *,
        estimated_round_trip_cost_bps: float = 0.0,
        min_profit_buffer_bps: float = 0.0,
        min_expected_move_bps: float = 0.0,
        min_volume_ratio: float = 1.1,
        max_entry_atr_bps: float = 280.0,
        min_reward_risk: float = 1.8,
    ) -> SignalDecision:
        frame = candles_to_frame(candles)
        latest = frame.iloc[-1]
        previous = frame.iloc[-2]

        bullish_trend = latest["close"] > latest["ema_fast"] > latest["ema_slow"]
        weak_trend = latest["close"] < latest["ema_fast"] or latest["rsi"] < 45
        volume_ratio = float(latest["volume"] / latest["volume_sma"]) if latest["volume_sma"] else 0.0
        volume_pulse = volume_ratio >= min_volume_ratio
        expected_move_bps = float(latest["atr_bps"] * 0.8)
        required_edge_bps = max(
            float(min_expected_move_bps),
            float(estimated_round_trip_cost_bps) + float(min_profit_buffer_bps),
        )
        cost_ok = expected_move_bps >= required_edge_bps
        rsi_ok = 54 <= latest["rsi"] <= 68
        volatility_ok = latest["atr_bps"] <= max_entry_atr_bps
        above_vwap = latest["close"] > latest["vwap"]
        close_up = latest["close"] > previous["close"]

        failed_reasons: list[str] = []
        if has_open_position:
            failed_reasons.append("position_already_open")
        if not bullish_trend:
            failed_reasons.append("trend_not_bullish")
        if not rsi_ok:
            failed_reasons.append("rsi_outside_entry_band")
        if not volume_pulse:
            failed_reasons.append("volume_ratio_below_min")
        if not volatility_ok:
            failed_reasons.append("atr_above_max")
        if not above_vwap:
            failed_reasons.append("price_below_vwap")
        if not cost_ok:
            failed_reasons.append("expected_move_below_required_edge")

        if not has_open_position and bullish_trend and rsi_ok and volume_pulse and volatility_ok and above_vwap and cost_ok:
            direction = "buy"
            edge_bonus = min(0.12, max(0.0, (expected_move_bps - required_edge_bps) / max(required_edge_bps, 1.0)) * 0.08)
            volume_bonus = min(0.08, max(0.0, volume_ratio - 1.0) * 0.08)
            confidence = min(0.92, 0.5 + ((latest["rsi"] - 50) / 80) + volume_bonus + edge_bonus + (0.04 if close_up else 0))
            regime = "trend-long"
            rationale = "Price is above EMAs and VWAP, RSI is constructive, volume confirms, and expected move clears costs."
        elif has_open_position and (weak_trend or latest["close"] < latest["vwap"]):
            direction = "sell"
            confidence = min(0.88, 0.58 + ((50 - min(latest["rsi"], 50)) / 60))
            regime = "risk-off"
            rationale = "Momentum has softened beneath the fast EMA or VWAP, so the open long should be reduced."
        else:
            direction = "hold"
            confidence = 0.0
            regime = "no-trade"
            rationale = "The setup does not clear the trend, volume, volatility, and cost filters."

        take_profit_bps = max(required_edge_bps, expected_move_bps * 0.9)
        stop_distance_bps = max(8.0, take_profit_bps / max(min_reward_risk, 1.0))
        score = confidence * expected_move_bps

        return SignalDecision(
            symbol=symbol,
            timeframe=timeframe,
            predicted_direction=direction,
            confidence=round(float(confidence), 4),
            expected_move_bps=round(expected_move_bps, 2),
            score=round(score, 2),
            regime=regime,
            rationale=rationale,
            entry_plan={
                "trigger": "market",
                "trend_ok": bool(bullish_trend),
                "rsi_ok": bool(rsi_ok),
                "volume_pulse": bool(volume_pulse),
                "volatility_ok": bool(volatility_ok),
                "above_vwap": bool(above_vwap),
                "cost_ok": bool(cost_ok),
                "failed_reasons": failed_reasons,
                "diagnostics": {
                    "close": round(float(latest["close"]), 8),
                    "ema_fast": round(float(latest["ema_fast"]), 8),
                    "ema_slow": round(float(latest["ema_slow"]), 8),
                    "rsi": round(float(latest["rsi"]), 4),
                    "atr_bps": round(float(latest["atr_bps"]), 2),
                    "volume_ratio": round(volume_ratio, 4),
                    "vwap": round(float(latest["vwap"]), 8),
                    "vwap_distance_bps": round(float(((latest["close"] - latest["vwap"]) / latest["close"]) * 10000), 2),
                    "expected_move_bps": round(expected_move_bps, 2),
                    "estimated_round_trip_cost_bps": round(float(estimated_round_trip_cost_bps), 2),
                    "min_profit_buffer_bps": round(float(min_profit_buffer_bps), 2),
                    "required_edge_bps": round(required_edge_bps, 2),
                },
            },
            stop_plan={"distance_bps": round(stop_distance_bps, 2)},
            take_profit_plan={"distance_bps": round(take_profit_bps, 2)},
        )

    def apply_llm_filter(self, signal: SignalDecision, assessment: LlmAssessment) -> SignalDecision:
        if signal.predicted_direction == "hold":
            signal.llm_assessment = assessment
            return signal

        updated = signal.model_copy(deep=True)
        updated.llm_assessment = assessment

        if assessment.risk_flag and updated.predicted_direction == "buy":
            updated.predicted_direction = "hold"
            updated.confidence = round(updated.confidence * 0.4, 4)
            updated.rationale = f"{updated.rationale} Gemini vetoed the long: {assessment.one_sentence_reason}"
            return updated

        if assessment.sentiment == "bearish" and updated.predicted_direction == "buy":
            updated.confidence = round(updated.confidence * 0.65, 4)
            updated.rationale = f"{updated.rationale} Gemini was cautious: {assessment.one_sentence_reason}"
        elif assessment.sentiment == "bullish" and updated.predicted_direction == "buy":
            updated.confidence = round(min(0.98, updated.confidence + 0.06), 4)
            updated.rationale = f"{updated.rationale} Gemini agreed: {assessment.one_sentence_reason}"

        if assessment.sentiment == "bearish" and updated.predicted_direction == "sell":
            updated.confidence = round(min(0.98, updated.confidence + 0.05), 4)

        return updated
