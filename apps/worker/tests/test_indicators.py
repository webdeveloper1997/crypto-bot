from datetime import UTC, datetime, timedelta

from crypto_bot_worker.models import Candle
from crypto_bot_worker.strategy.indicators import candles_to_frame


def build_candles() -> list[Candle]:
    now = datetime.now(UTC)
    candles = []
    price = 100.0
    for index in range(80):
        candles.append(
            Candle(
                opened_at=now + timedelta(minutes=index),
                open=price,
                high=price + 1.2,
                low=price - 0.8,
                close=price + 0.6,
                volume=1000 + index * 10,
            )
        )
        price += 0.7
    return candles


def test_candles_to_frame_adds_expected_indicator_columns() -> None:
    frame = candles_to_frame(build_candles())

    for column in ["ema_fast", "ema_slow", "rsi", "atr", "volume_sma", "vwap", "atr_bps"]:
        assert column in frame.columns

    assert frame.iloc[-1]["ema_fast"] > frame.iloc[-1]["ema_slow"]
