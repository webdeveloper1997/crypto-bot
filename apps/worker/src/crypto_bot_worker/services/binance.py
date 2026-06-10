from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from typing import Any, Literal
from uuid import uuid4

from binance.spot import Spot

from crypto_bot_worker.config import Settings
from crypto_bot_worker.models import BotMode, Candle, ExecutedOrder


@dataclass(frozen=True)
class SymbolFilters:
    step_size: Decimal
    min_qty: Decimal
    max_qty: Decimal
    min_notional: Decimal


class BinanceQuantityError(ValueError):
    def __init__(self, message: str, details: dict[str, Any]) -> None:
        super().__init__(message)
        self.details = details


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
        self._symbol_filters: dict[tuple[BotMode, str], SymbolFilters] = {}

    def get_klines(self, symbol: str, interval: str, limit: int) -> list[Candle]:
        payload = self._public_client.klines(symbol=symbol, interval=interval, limit=limit)
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        closed_rows = [row for row in payload if int(row[6]) <= now_ms]
        return [
            Candle(
                opened_at=datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[5]),
            )
            for row in closed_rows
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
        market_price: float,
    ) -> ExecutedOrder:
        client = self._testnet_client if mode == "testnet" else self._live_client
        client_order_id = f"crypto-bot-{uuid4().hex[:20]}"
        filters = self.get_symbol_filters(mode, symbol)
        rounded_qty = self.quantize_quantity(quantity, filters)
        quantity_text = self.format_quantity(rounded_qty, filters.step_size)
        notional = rounded_qty * Decimal(str(market_price))
        self._validate_quantity(symbol, quantity, rounded_qty, notional, filters)

        payload: dict[str, Any] = client.new_order(
            symbol=symbol,
            side=side.upper(),
            type="MARKET",
            quantity=quantity_text,
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

    def get_symbol_filters(self, mode: BotMode, symbol: str) -> SymbolFilters:
        cache_key = (mode, symbol)
        if cache_key in self._symbol_filters:
            return self._symbol_filters[cache_key]

        client = self._client_for_mode(mode)
        payload = client.exchange_info(symbol=symbol)
        symbol_info = (payload.get("symbols") or [payload])[0]
        filters = {item["filterType"]: item for item in symbol_info.get("filters", [])}
        lot_size = filters.get("LOT_SIZE") or {}
        min_notional = filters.get("MIN_NOTIONAL") or filters.get("NOTIONAL") or {}
        parsed = SymbolFilters(
            step_size=Decimal(str(lot_size.get("stepSize", "0.000001"))),
            min_qty=Decimal(str(lot_size.get("minQty", "0"))),
            max_qty=Decimal(str(lot_size.get("maxQty", "999999999"))),
            min_notional=Decimal(str(min_notional.get("minNotional", "0"))),
        )
        self._symbol_filters[cache_key] = parsed
        return parsed

    def _client_for_mode(self, mode: BotMode) -> Spot:
        if mode == "testnet":
            return self._testnet_client
        if mode == "live":
            return self._live_client
        return self._public_client

    @staticmethod
    def quantize_quantity(quantity: float, filters: SymbolFilters) -> Decimal:
        raw = Decimal(str(quantity))
        if filters.step_size <= 0:
            return raw
        steps = (raw / filters.step_size).to_integral_value(rounding=ROUND_DOWN)
        return steps * filters.step_size

    @staticmethod
    def format_quantity(quantity: Decimal, step_size: Decimal) -> str:
        precision = max(0, -step_size.as_tuple().exponent)
        return f"{quantity:.{precision}f}"

    @staticmethod
    def _validate_quantity(
        symbol: str,
        raw_quantity: float,
        rounded_quantity: Decimal,
        notional: Decimal,
        filters: SymbolFilters,
    ) -> None:
        details = {
            "symbol": symbol,
            "raw_quantity": raw_quantity,
            "rounded_quantity": float(rounded_quantity),
            "step_size": float(filters.step_size),
            "min_qty": float(filters.min_qty),
            "max_qty": float(filters.max_qty),
            "min_notional": float(filters.min_notional),
            "notional": float(notional),
        }
        if rounded_quantity <= 0:
            raise BinanceQuantityError("Rounded quantity is zero after applying Binance step size.", details)
        if rounded_quantity < filters.min_qty:
            raise BinanceQuantityError("Rounded quantity is below Binance minQty.", details)
        if rounded_quantity > filters.max_qty:
            raise BinanceQuantityError("Rounded quantity is above Binance maxQty.", details)
        if notional < filters.min_notional:
            raise BinanceQuantityError("Order notional is below Binance minNotional.", details)
