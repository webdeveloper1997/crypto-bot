from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from crypto_bot_worker.config import GeminiKeyConfig, Settings
from crypto_bot_worker.models import Candle, LlmAssessment, SignalDecision
from crypto_bot_worker.services.repository import SupabaseRepository

LOGGER = logging.getLogger(__name__)
PACIFIC_TZ = ZoneInfo("America/Los_Angeles")


@dataclass(frozen=True)
class GeminiUsage:
    request_count: int = 0
    prompt_tokens: int = 0
    candidates_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class GeminiUsageWindow:
    daily: dict[str, GeminiUsage]
    minute: dict[str, GeminiUsage]


class GeminiResearchService:
    def __init__(self, settings: Settings, repository: SupabaseRepository) -> None:
        self._repo = repository
        self._keys = settings.gemini_key_configs()
        self._model = settings.gemini_model
        self._daily_request_limit = settings.gemini_daily_request_limit
        self._minute_request_limit = settings.gemini_minute_request_limit
        self._daily_token_limit = settings.gemini_daily_token_limit
        self._token_minute_limit = settings.gemini_token_minute_limit
        self._cooldown_minutes = max(settings.gemini_rate_limit_cooldown_minutes, 1)
        self._cooldowns: dict[str, datetime] = {}

    def sync_keys(self, user_id: str) -> None:
        for key in self._keys:
            self._upsert_key_metadata(user_id, key)

    def analyze_signal(self, user_id: str, signal: SignalDecision, candles: list[Candle]) -> LlmAssessment:
        if not self._keys:
            return LlmAssessment(one_sentence_reason="Gemini key missing; falling back to rules only.")

        self.sync_keys(user_id)
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

        selected_keys = self._available_keys(user_id)
        if not selected_keys:
            return LlmAssessment(
                sentiment="neutral",
                risk_flag=False,
                confidence=0.0,
                one_sentence_reason="All Gemini keys are locally exhausted; rules-only decision kept.",
            )

        last_reason = "Gemini call failed; rules-only decision kept."
        for key in selected_keys:
            started = time.perf_counter()
            try:
                response = httpx.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent",
                    params={"key": key.api_key},
                    json=payload,
                    timeout=25.0,
                )
                response.raise_for_status()
                raw = response.json()
                text = raw["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text)
                self._record_usage(
                    user_id=user_id,
                    key=key,
                    signal=signal,
                    status="success",
                    status_code=response.status_code,
                    latency_ms=self._elapsed_ms(started),
                    raw_response=raw,
                )
                self._upsert_key_status(user_id, key, status="success", last_used_at=datetime.now(UTC))
                return LlmAssessment.model_validate({**parsed, "raw_response": raw})
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code
                status = "rate_limited" if status_code == 429 else "error"
                last_reason = f"Gemini returned HTTP {status_code}; rules-only decision kept."
                LOGGER.warning("Gemini research filter failed: status=%s model=%s key_label=%s", status_code, self._model, key.label)
                exhausted_until = self._cooldown_until() if status_code == 429 else None
                if exhausted_until:
                    self._cooldowns[key.label] = exhausted_until
                self._record_usage(
                    user_id=user_id,
                    key=key,
                    signal=signal,
                    status=status,
                    status_code=status_code,
                    latency_ms=self._elapsed_ms(started),
                    error_type="HTTPStatusError",
                    error_message=f"Gemini HTTP {status_code}",
                )
                self._upsert_key_status(
                    user_id,
                    key,
                    status=status,
                    status_code=status_code,
                    last_error=f"Gemini HTTP {status_code}",
                    exhausted_until=exhausted_until,
                    last_used_at=datetime.now(UTC),
                )
                continue
            except Exception as exc:  # noqa: BLE001
                last_reason = "Gemini call failed; rules-only decision kept."
                LOGGER.warning("Gemini research filter failed: %s key_label=%s", type(exc).__name__, key.label)
                self._record_usage(
                    user_id=user_id,
                    key=key,
                    signal=signal,
                    status="error",
                    latency_ms=self._elapsed_ms(started),
                    error_type=type(exc).__name__,
                    error_message="Gemini call failed",
                )
                self._upsert_key_status(
                    user_id,
                    key,
                    status="error",
                    last_error=type(exc).__name__,
                    last_used_at=datetime.now(UTC),
                )
                continue

        return LlmAssessment(
            sentiment="neutral",
            risk_flag=False,
            confidence=0.0,
            one_sentence_reason=last_reason,
        )

    def _available_keys(self, user_id: str) -> list[GeminiKeyConfig]:
        usage = self._usage_window(user_id)
        now = datetime.now(UTC)
        available: list[tuple[int, int, GeminiKeyConfig]] = []
        for key in self._keys:
            cooldown_until = self._cooldowns.get(key.label)
            if cooldown_until and cooldown_until > now:
                continue

            daily = usage.daily.get(key.label, GeminiUsage())
            minute = usage.minute.get(key.label, GeminiUsage())
            if self._daily_request_limit and daily.request_count >= self._daily_request_limit:
                self._upsert_key_status(
                    user_id,
                    key,
                    status="rate_limited",
                    last_error="Local daily request limit reached",
                    exhausted_until=self._next_quota_reset(),
                )
                continue
            if self._minute_request_limit and minute.request_count >= self._minute_request_limit:
                self._upsert_key_status(
                    user_id,
                    key,
                    status="rate_limited",
                    last_error="Local minute request limit reached",
                    exhausted_until=now + timedelta(minutes=1),
                )
                continue
            if self._daily_token_limit and daily.total_tokens >= self._daily_token_limit:
                self._upsert_key_status(
                    user_id,
                    key,
                    status="rate_limited",
                    last_error="Local daily token limit reached",
                    exhausted_until=self._next_quota_reset(),
                )
                continue
            if self._token_minute_limit and minute.prompt_tokens >= self._token_minute_limit:
                self._upsert_key_status(
                    user_id,
                    key,
                    status="rate_limited",
                    last_error="Local token-minute limit reached",
                    exhausted_until=now + timedelta(minutes=1),
                )
                continue
            available.append((daily.request_count, key.priority, key))
        return [key for _, _, key in sorted(available, key=lambda item: (item[0], item[1]))]

    def _usage_window(self, user_id: str) -> GeminiUsageWindow:
        quota_day = self._quota_day()
        since = datetime.now(UTC) - timedelta(minutes=1)
        daily_events = self._safe_list_usage_events(user_id, quota_day)
        minute_events = self._safe_list_usage_events(user_id, quota_day, since=since)
        return GeminiUsageWindow(
            daily=self._summarize_usage(daily_events),
            minute=self._summarize_usage(minute_events),
        )

    def _safe_list_usage_events(self, user_id: str, quota_day, since: datetime | None = None) -> list[dict[str, Any]]:
        try:
            return self._repo.list_gemini_usage_events(user_id, quota_day, since=since)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Gemini usage query failed: %s", type(exc).__name__)
            return []

    @staticmethod
    def _summarize_usage(events: list[dict[str, Any]]) -> dict[str, GeminiUsage]:
        summary: dict[str, GeminiUsage] = {}
        for event in events:
            key_label = str(event.get("key_label") or "")
            if not key_label:
                continue
            current = summary.get(key_label, GeminiUsage())
            summary[key_label] = GeminiUsage(
                request_count=current.request_count + int(event.get("request_count") or 0),
                prompt_tokens=current.prompt_tokens + int(event.get("prompt_tokens") or 0),
                candidates_tokens=current.candidates_tokens + int(event.get("candidates_tokens") or 0),
                total_tokens=current.total_tokens + int(event.get("total_tokens") or 0),
            )
        return summary

    def _upsert_key_status(
        self,
        user_id: str,
        key: GeminiKeyConfig,
        *,
        status: str,
        status_code: int | None = None,
        last_error: str | None = None,
        exhausted_until: datetime | None = None,
        last_used_at: datetime | None = None,
    ) -> None:
        try:
            self._repo.upsert_gemini_key_status(
                user_id,
                {
                    "key_label": key.label,
                    "key_hash": self._key_hash(key.api_key),
                    "model": self._model,
                    "daily_request_limit": self._daily_request_limit,
                    "minute_request_limit": self._minute_request_limit,
                    "daily_token_limit": self._daily_token_limit,
                    "token_minute_limit": self._token_minute_limit,
                    "priority": key.priority,
                    "is_active": True,
                    "last_status": status,
                    "last_status_code": status_code,
                    "last_error": last_error,
                    "exhausted_until": exhausted_until.isoformat() if exhausted_until else None,
                    "last_used_at": last_used_at.isoformat() if last_used_at else None,
                },
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Gemini key status upsert failed: %s", type(exc).__name__)

    def _upsert_key_metadata(self, user_id: str, key: GeminiKeyConfig) -> None:
        try:
            self._repo.upsert_gemini_key_status(
                user_id,
                {
                    "key_label": key.label,
                    "key_hash": self._key_hash(key.api_key),
                    "model": self._model,
                    "daily_request_limit": self._daily_request_limit,
                    "minute_request_limit": self._minute_request_limit,
                    "daily_token_limit": self._daily_token_limit,
                    "token_minute_limit": self._token_minute_limit,
                    "priority": key.priority,
                    "is_active": True,
                },
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Gemini key metadata upsert failed: %s", type(exc).__name__)

    def _record_usage(
        self,
        *,
        user_id: str,
        key: GeminiKeyConfig,
        signal: SignalDecision,
        status: str,
        latency_ms: int,
        status_code: int | None = None,
        raw_response: dict[str, Any] | None = None,
        error_type: str | None = None,
        error_message: str | None = None,
    ) -> None:
        usage = self._extract_usage(raw_response or {})
        try:
            self._repo.insert_gemini_usage_event(
                {
                    "user_id": user_id,
                    "key_label": key.label,
                    "key_hash": self._key_hash(key.api_key),
                    "model": self._model,
                    "request_kind": "research_filter",
                    "symbol": signal.symbol,
                    "timeframe": signal.timeframe,
                    "status": status,
                    "status_code": status_code,
                    "request_count": 1,
                    "prompt_tokens": usage.prompt_tokens,
                    "candidates_tokens": usage.candidates_tokens,
                    "total_tokens": usage.total_tokens,
                    "latency_ms": latency_ms,
                    "quota_day": self._quota_day().isoformat(),
                    "error_type": error_type,
                    "error_message": error_message,
                }
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Gemini usage event insert failed: %s", type(exc).__name__)

    @staticmethod
    def _extract_usage(raw_response: dict[str, Any]) -> GeminiUsage:
        usage = raw_response.get("usageMetadata") or {}
        return GeminiUsage(
            prompt_tokens=int(usage.get("promptTokenCount") or 0),
            candidates_tokens=int(usage.get("candidatesTokenCount") or 0),
            total_tokens=int(usage.get("totalTokenCount") or 0),
        )

    @staticmethod
    def _key_hash(api_key: str) -> str:
        return hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _quota_day():
        return datetime.now(PACIFIC_TZ).date()

    @staticmethod
    def _next_quota_reset() -> datetime:
        now = datetime.now(PACIFIC_TZ)
        reset = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return reset.astimezone(UTC)

    def _cooldown_until(self) -> datetime:
        return datetime.now(UTC) + timedelta(minutes=self._cooldown_minutes)

    @staticmethod
    def _elapsed_ms(started: float) -> int:
        return int((time.perf_counter() - started) * 1000)
