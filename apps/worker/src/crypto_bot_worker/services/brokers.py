from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from crypto_bot_worker.config import Settings
from crypto_bot_worker.models import BotMode, ExecutedOrder
from crypto_bot_worker.services.binance import BinanceService


class PaperBroker:
    def __init__(self, settings: Settings) -> None:
        self._fee_rate = settings.paper_fee_rate
        self._slippage_bps = settings.paper_slippage_bps

    def execute(self, mode: BotMode, symbol: str, side: str, quantity: float, market_price: float) -> ExecutedOrder:
        price_multiplier = 1 + (self._slippage_bps / 10000 if side == "buy" else -self._slippage_bps / 10000)
        executed_price = market_price * price_multiplier
        quote_amount = executed_price * quantity
        commission_amount = quote_amount * self._fee_rate

        return ExecutedOrder(
            symbol=symbol,
            side=side,  # type: ignore[arg-type]
            mode=mode,
            quantity=quantity,
            price=executed_price,
            commission_amount=commission_amount,
            quote_amount=quote_amount,
            slippage_bps=self._slippage_bps,
            client_order_id=f"paper-{uuid4().hex[:20]}",
            exchange_order_id=f"paper-{uuid4().hex[:10]}",
            raw_payload={"mode": "paper", "executed_at": datetime.now(UTC).isoformat()},
        )


class BinanceBroker:
    def __init__(self, binance_service: BinanceService) -> None:
        self._binance_service = binance_service

    def execute(self, mode: BotMode, symbol: str, side: str, quantity: float, market_price: float) -> ExecutedOrder:
        del market_price
        return self._binance_service.place_market_order(mode=mode, symbol=symbol, side=side, quantity=quantity)
