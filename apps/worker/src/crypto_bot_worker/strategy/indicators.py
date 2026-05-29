from __future__ import annotations

import pandas as pd

from crypto_bot_worker.models import Candle


def candles_to_frame(candles: list[Candle]) -> pd.DataFrame:
    frame = pd.DataFrame(
        {
            "opened_at": [candle.opened_at for candle in candles],
            "open": [candle.open for candle in candles],
            "high": [candle.high for candle in candles],
            "low": [candle.low for candle in candles],
            "close": [candle.close for candle in candles],
            "volume": [candle.volume for candle in candles],
        }
    )

    frame["ema_fast"] = frame["close"].ewm(span=21, adjust=False).mean()
    frame["ema_slow"] = frame["close"].ewm(span=55, adjust=False).mean()

    delta = frame["close"].diff()
    gains = delta.clip(lower=0).rolling(window=14).mean()
    losses = (-delta.clip(upper=0)).rolling(window=14).mean()
    losses = losses.replace(0, 1e-9)
    rs = gains / losses
    frame["rsi"] = 100 - (100 / (1 + rs))

    true_range = pd.concat(
        [
            frame["high"] - frame["low"],
            (frame["high"] - frame["close"].shift(1)).abs(),
            (frame["low"] - frame["close"].shift(1)).abs(),
        ],
        axis=1,
    ).max(axis=1)
    frame["atr"] = true_range.rolling(window=14).mean()

    frame["volume_sma"] = frame["volume"].rolling(window=20).mean()
    typical_price = (frame["high"] + frame["low"] + frame["close"]) / 3
    frame["vwap"] = (typical_price * frame["volume"]).cumsum() / frame["volume"].cumsum()
    frame["atr_bps"] = (frame["atr"] / frame["close"]) * 10000

    return frame.bfill().ffill()
