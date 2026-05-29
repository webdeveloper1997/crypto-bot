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
    candle_limit: int = Field(default=200, alias="CANDLE_LIMIT")
    paper_fee_rate: float = Field(default=0.001, alias="PAPER_FEE_RATE")
    paper_slippage_bps: float = Field(default=5.0, alias="PAPER_SLIPPAGE_BPS")

