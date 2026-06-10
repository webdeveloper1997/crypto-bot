from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
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
