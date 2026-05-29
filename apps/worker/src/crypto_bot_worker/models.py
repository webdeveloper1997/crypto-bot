from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


BotMode = Literal["paper", "testnet", "live"]
SignalDirection = Literal["buy", "sell", "hold"]


class Candle(BaseModel):
    opened_at: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class LlmAssessment(BaseModel):
    sentiment: Literal["bullish", "bearish", "neutral"] = "neutral"
    risk_flag: bool = False
    confidence: float = 0.0
    one_sentence_reason: str = "No LLM context."
    raw_response: dict[str, Any] = Field(default_factory=dict)


class SignalDecision(BaseModel):
    symbol: str
    timeframe: str
    predicted_direction: SignalDirection
    confidence: float
    expected_move_bps: float
    score: float
    regime: str
    rationale: str
    entry_plan: dict[str, Any] = Field(default_factory=dict)
    stop_plan: dict[str, Any] = Field(default_factory=dict)
    take_profit_plan: dict[str, Any] = Field(default_factory=dict)
    strategy_version: str = "intraday-rules-ml-v1"
    llm_assessment: LlmAssessment | None = None


class BotSettingsRecord(BaseModel):
    id: str
    user_id: str
    display_name: str
    desired_mode: BotMode
    actual_mode: BotMode
    is_running: bool
    symbols: list[str]
    timeframe: str
    decision_interval_minutes: int
    paper_starting_balance: float
    live_starting_balance: float
    paper_trade_notional: float
    live_trade_notional: float
    max_concurrent_positions: int
    max_symbol_allocation_pct: float
    max_total_exposure_pct: float
    daily_drawdown_limit_pct: float
    weekly_drawdown_limit_pct: float
    strategy_version: str


class CommandRecord(BaseModel):
    id: str
    user_id: str
    command_type: Literal["switch_mode", "start_bot", "stop_bot", "flatten_all", "reconcile"]
    status: Literal["pending", "applied", "failed", "cancelled"]
    payload: dict[str, Any] = Field(default_factory=dict)
    requested_at: datetime
    processed_at: datetime | None = None
    error_message: str | None = None


class PositionRecord(BaseModel):
    id: str
    user_id: str
    signal_id: str | None = None
    symbol: str
    mode: BotMode
    status: Literal["open", "closed"]
    quantity: float
    average_entry: float
    unrealized_pnl: float
    realized_pnl: float
    fee_total: float
    opened_at: datetime
    closed_at: datetime | None = None
    updated_at: datetime


class DailyMetricRecord(BaseModel):
    id: str | None = None
    user_id: str
    mode: BotMode
    trading_day: date
    gross_pnl: float = 0.0
    net_pnl: float = 0.0
    fee_total: float = 0.0
    slippage_total: float = 0.0
    win_rate: float = 0.0
    trades_count: int = 0
    predictions_hit: int = 0
    predictions_total: int = 0


class ExecutedOrder(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    mode: BotMode
    quantity: float
    price: float
    commission_asset: str = "USDT"
    commission_amount: float = 0.0
    quote_amount: float = 0.0
    slippage_bps: float = 0.0
    client_order_id: str
    exchange_order_id: str | None = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)
    executed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
