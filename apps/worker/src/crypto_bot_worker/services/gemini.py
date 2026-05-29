from __future__ import annotations

import json
import logging

import httpx

from crypto_bot_worker.config import Settings
from crypto_bot_worker.models import Candle, LlmAssessment, SignalDecision

LOGGER = logging.getLogger(__name__)


class GeminiResearchService:
    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_model

    def analyze_signal(self, signal: SignalDecision, candles: list[Candle]) -> LlmAssessment:
        if not self._api_key:
            return LlmAssessment(one_sentence_reason="Gemini key missing; falling back to rules only.")

        closes = [candle.close for candle in candles[-5:]]
        prompt = (
            "You are a crypto research filter. Respond as JSON only. "
            f"Symbol: {signal.symbol}. Timeframe: {signal.timeframe}. "
            f"Direction: {signal.predicted_direction}. Confidence: {signal.confidence:.2f}. "
            f"Recent closes: {closes}. "
            f"Strategy rationale: {signal.rationale}. "
            "Return keys sentiment (bullish/bearish/neutral), risk_flag (boolean), "
            "confidence (0-1), one_sentence_reason."
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "sentiment": {"type": "STRING", "enum": ["bullish", "bearish", "neutral"]},
                        "risk_flag": {"type": "BOOLEAN"},
                        "confidence": {"type": "NUMBER"},
                        "one_sentence_reason": {"type": "STRING"},
                    },
                    "required": ["sentiment", "risk_flag", "confidence", "one_sentence_reason"],
                },
            },
        }

        try:
            response = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent",
                params={"key": self._api_key},
                json=payload,
                timeout=25.0,
            )
            response.raise_for_status()
            raw = response.json()
            text = raw["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
            return LlmAssessment.model_validate({**parsed, "raw_response": raw})
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Gemini research filter failed: %s", exc)
            return LlmAssessment(
                sentiment="neutral",
                risk_flag=False,
                confidence=0.0,
                one_sentence_reason="Gemini call failed; rules-only decision kept.",
            )

