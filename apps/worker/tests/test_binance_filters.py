from decimal import Decimal
from datetime import UTC, datetime

import pytest

from crypto_bot_worker.services.binance import BinanceQuantityError, BinanceService, SymbolFilters


class FakeSpot:
    def klines(self, symbol: str, interval: str, limit: int) -> list[list[object]]:
        del symbol, interval, limit
        now_ms = int(datetime.now(UTC).timestamp() * 1000)
        return [
            [now_ms - 120_000, "100", "101", "99", "100.5", "10", now_ms - 60_000],
            [now_ms - 60_000, "100.5", "102", "100", "101.5", "12", now_ms + 60_000],
        ]


def test_get_klines_ignores_live_unclosed_candle() -> None:
    service = object.__new__(BinanceService)
    service._public_client = FakeSpot()

    candles = service.get_klines("BTCUSDT", "1m", 2)

    assert len(candles) == 1
    assert candles[0].close == 100.5


def test_quantize_quantity_floors_to_step_size() -> None:
    filters = SymbolFilters(
        step_size=Decimal("0.001"),
        min_qty=Decimal("0.001"),
        max_qty=Decimal("1000"),
        min_notional=Decimal("5"),
    )

    quantity = BinanceService.quantize_quantity(1.2349, filters)

    assert quantity == Decimal("1.234")
    assert BinanceService.format_quantity(quantity, filters.step_size) == "1.234"


def test_validate_quantity_rejects_below_min_notional() -> None:
    filters = SymbolFilters(
        step_size=Decimal("0.01"),
        min_qty=Decimal("0.01"),
        max_qty=Decimal("1000"),
        min_notional=Decimal("10"),
    )
    quantity = BinanceService.quantize_quantity(0.2, filters)

    with pytest.raises(BinanceQuantityError):
        BinanceService._validate_quantity("ETHUSDT", 0.2, quantity, Decimal("8"), filters)
