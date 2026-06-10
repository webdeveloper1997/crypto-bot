from dataclasses import dataclass

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass(frozen=True)
class GeminiKeyConfig:
    label: str
    api_key: str
    priority: int


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_api_keys: str | None = Field(default=None, alias="GEMINI_API_KEYS")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_daily_request_limit: int = Field(default=50, alias="GEMINI_DAILY_REQUEST_LIMIT")
    gemini_minute_request_limit: int = Field(default=10, alias="GEMINI_MINUTE_REQUEST_LIMIT")
    gemini_daily_token_limit: int = Field(default=0, alias="GEMINI_DAILY_TOKEN_LIMIT")
    gemini_token_minute_limit: int = Field(default=0, alias="GEMINI_TOKEN_MINUTE_LIMIT")
    gemini_rate_limit_cooldown_minutes: int = Field(default=60, alias="GEMINI_RATE_LIMIT_COOLDOWN_MINUTES")
    binance_testnet_api_key: str | None = Field(default=None, alias="BINANCE_TESTNET_API_KEY")
    binance_testnet_api_secret: str | None = Field(default=None, alias="BINANCE_TESTNET_API_SECRET")
    binance_live_api_key: str | None = Field(default=None, alias="BINANCE_LIVE_API_KEY")
    binance_live_api_secret: str | None = Field(default=None, alias="BINANCE_LIVE_API_SECRET")
    allow_live_trading: bool = Field(default=False, alias="ALLOW_LIVE_TRADING")
    poll_interval_seconds: int = Field(default=60, alias="POLL_INTERVAL_SECONDS")
    candle_limit: int = Field(default=300, alias="CANDLE_LIMIT")
    paper_fee_rate: float = Field(default=0.001, alias="PAPER_FEE_RATE")
    paper_slippage_bps: float = Field(default=5.0, alias="PAPER_SLIPPAGE_BPS")
    live_fee_rate: float = Field(default=0.001, alias="LIVE_FEE_RATE")
    live_slippage_bps: float = Field(default=5.0, alias="LIVE_SLIPPAGE_BPS")
    estimated_spread_bps: float = Field(default=2.0, alias="ESTIMATED_SPREAD_BPS")
    min_profit_buffer_bps: float = Field(default=8.0, alias="MIN_PROFIT_BUFFER_BPS")
    min_expected_move_bps: float = Field(default=18.0, alias="MIN_EXPECTED_MOVE_BPS")
    min_volume_ratio: float = Field(default=1.15, alias="MIN_VOLUME_RATIO")
    max_entry_atr_bps: float = Field(default=220.0, alias="MAX_ENTRY_ATR_BPS")
    min_reward_risk: float = Field(default=1.8, alias="MIN_REWARD_RISK")
    max_hold_minutes: int = Field(default=45, alias="MAX_HOLD_MINUTES")

    def gemini_key_configs(self) -> list[GeminiKeyConfig]:
        raw_entries = self._split_gemini_entries(self.gemini_api_keys)
        if not raw_entries and self.gemini_api_key:
            raw_entries = [f"primary:{self.gemini_api_key}"]

        configs: list[GeminiKeyConfig] = []
        seen_labels: set[str] = set()
        for index, entry in enumerate(raw_entries, start=1):
            label, api_key = self._parse_gemini_entry(entry, index)
            if not api_key or label in seen_labels:
                continue
            seen_labels.add(label)
            configs.append(GeminiKeyConfig(label=label, api_key=api_key, priority=index))
        return configs

    @staticmethod
    def _split_gemini_entries(value: str | None) -> list[str]:
        if not value:
            return []
        normalized = value.replace("\n", ",").replace(";", ",")
        return [entry.strip() for entry in normalized.split(",") if entry.strip()]

    @staticmethod
    def _parse_gemini_entry(entry: str, index: int) -> tuple[str, str]:
        if ":" in entry:
            label, api_key = entry.split(":", maxsplit=1)
        elif "=" in entry:
            label, api_key = entry.split("=", maxsplit=1)
        else:
            label, api_key = f"key_{index}", entry
        safe_label = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in label.strip().lower())
        return safe_label or f"key_{index}", api_key.strip()
