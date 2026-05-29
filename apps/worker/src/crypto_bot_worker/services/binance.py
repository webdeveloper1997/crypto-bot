from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from binance.spot import Spot

from crypto_bot_worker.config import Settings
from crypto_bot_worker.models import BotMode, Candle, ExecutedOrder


class BinanceService:
    def __init__(self, settings: Settings) -> None:
        self._public_client = Spot()
        self._testnet_client = Spot(
            api_key=settings.binance_testnet_api_key,
            api_secret=settings.binance_testnet_api_secret,
            base_url="https://testnet.binance.vision",
        )
        self._live_client = Spot(
            api_key=settings.binance_live_api_key,
            api_secret=settings.binance_live_api_secret,
        )

    def get_klines(self, symbol: str, interval: str, limit: int) -> list[Candle]:
        payload = self._public_client.klines(symbol=symbol, interval=interval, limit=limit)
        return [
            Candle(
                opened_at=datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[5]),
            )
            for row in payload
        ]

    def get_last_price(self, symbol: str) -> float:
        payload = self._public_client.ticker_price(symbol=symbol)
        return float(payload["price"])

    def place_market_order(
        self,
        mode: BotMode,
        symbol: str,
        side: Literal["buy", "sell"],
        quantity: float,
    ) -> ExecutedOrder:
        client = self._testnet_client if mode == "testnet" else self._live_client
        client_order_id = f"crypto-bot-{uuid4().hex[:20]}"
        rounded_qty = max(round(quantity, 6), 0.000001)
        payload: dict[str, Any] = client.new_order(
            symbol=symbol,
            side=side.upper(),
            type="MARKET",
            quantity=f"{rounded_qty:.6f}",
            newClientOrderId=client_order_id,
        )

        fills = payload.get("fills") or []
        if fills:
            total_qty = sum(float(fill["qty"]) for fill in fills)
            total_quote = sum(float(fill["price"]) * float(fill["qty"]) for fill in fills)
            avg_price = total_quote / total_qty if total_qty else float(payload.get("price") or 0)
            commission_amount = sum(float(fill["commission"]) for fill in fills)
            commission_asset = fills[0].get("commissionAsset", "USDT")
        else:
            total_qty = float(payload.get("executedQty", rounded_qty))
            total_quote = float(payload.get("cummulativeQuoteQty", 0))
            avg_price = total_quote / total_qty if total_qty else self.get_last_price(symbol)
            commission_amount = 0.0
            commission_asset = "USDT"

        return ExecutedOrder(
            symbol=symbol,
            side=side,
            mode=mode,
            quantity=total_qty,
            price=avg_price,
            commission_asset=commission_asset,
            commission_amount=commission_amount,
            quote_amount=total_quote,
            client_order_id=client_order_id,
            exchange_order_id=str(payload.get("orderId")) if payload.get("orderId") else None,
            raw_payload=payload,
        )

