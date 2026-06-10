from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from crypto_bot_worker.config import Settings
from crypto_bot_worker.services.gemini import GeminiResearchService


class FakeGeminiRepository:
    def __init__(self, events=None) -> None:
        self.events = events or []
        self.status_updates = []
        self.usage_events = []

    def upsert_gemini_key_status(self, user_id, payload):
        self.status_updates.append({"user_id": user_id, **payload})

    def list_gemini_usage_events(self, user_id, quota_day, since=None):
        del user_id, quota_day
        if since is None:
            return self.events
        return [event for event in self.events if datetime.fromisoformat(event["created_at"]) >= since]

    def insert_gemini_usage_event(self, payload):
        self.usage_events.append(payload)


def make_settings(**overrides) -> Settings:
    base = {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-role",
    }
    base.update(overrides)
    return Settings(**base)


def test_gemini_api_keys_parse_labels_and_fallback() -> None:
    settings = make_settings(GEMINI_API_KEYS="primary:key-1, backup=key-2; raw-key-3")

    configs = settings.gemini_key_configs()

    assert [config.label for config in configs] == ["primary", "backup", "key_3"]
    assert [config.api_key for config in configs] == ["key-1", "key-2", "raw-key-3"]


def test_gemini_service_skips_key_that_hit_daily_request_limit() -> None:
    user_id = str(uuid4())
    settings = make_settings(
        GEMINI_API_KEYS="primary:key-1,backup:key-2",
        GEMINI_DAILY_REQUEST_LIMIT=1,
        GEMINI_MINUTE_REQUEST_LIMIT=10,
    )
    repo = FakeGeminiRepository(
        events=[
            {
                "key_label": "primary",
                "request_count": 1,
                "prompt_tokens": 0,
                "candidates_tokens": 0,
                "total_tokens": 0,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]
    )
    service = GeminiResearchService(settings, repo)  # type: ignore[arg-type]

    available = service._available_keys(user_id)

    assert [key.label for key in available] == ["backup"]
    assert any(update["key_label"] == "primary" and update["last_status"] == "rate_limited" for update in repo.status_updates)
