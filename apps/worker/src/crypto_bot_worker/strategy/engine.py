from __future__ import annotations

from crypto_bot_worker.models import Candle, LlmAssessment, SignalDecision
from crypto_bot_worker.strategy.indicators import candles_to_frame


class StrategyEngine:
    def build_signal(self, symbol: str, timeframe: str, candles: list[Candle], has_open_position: bool) -> SignalDecision:
        frame = candles_to_frame(candles)
        latest = frame.iloc[-1]
        previous = frame.iloc[-2]

        bullish_trend = latest["close"] > latest["ema_fast"] > latest["ema_slow"]
        weak_trend = latest["close"] < latest["ema_fast"] or latest["rsi"] < 45
        volume_pulse = latest["volume"] > latest["volume_sma"] * 1.1
        expected_move_bps = float(latest["atr_bps"] * 0.6)

        if not has_open_position and bullish_trend and 52 <= latest["rsi"] <= 68 and volume_pulse and latest["atr_bps"] < 280:
            direction = "buy"
            confidence = min(0.91, 0.55 + ((latest["rsi"] - 50) / 50) + (0.05 if latest["close"] > previous["close"] else 0))
            regime = "trend-long"
            rationale = "Price is above both EMAs, RSI is constructive, and volume is expanding."
        elif has_open_position and (weak_trend or latest["close"] < latest["vwap"]):
            direction = "sell"
            confidence = min(0.88, 0.58 + ((50 - min(latest["rsi"], 50)) / 60))
            regime = "risk-off"
            rationale = "Momentum has softened beneath the fast EMA or VWAP, so the open long should be reduced."
        else:
            direction = "hold"
            confidence = 0.42
            regime = "no-trade"
            rationale = "The setup does not clear both the trend and cost-of-trading filters."

        stop_distance_bps = max(80.0, expected_move_bps * 1.1)
        take_profit_bps = max(120.0, expected_move_bps * 1.6)
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
            entry_plan={"trigger": "market", "trend_ok": bool(bullish_trend), "volume_pulse": bool(volume_pulse)},
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
