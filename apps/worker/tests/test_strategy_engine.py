import math
from datetime import UTC, datetime, timedelta

from crypto_bot_worker.models import Candle, LlmAssessment
from crypto_bot_worker.strategy.engine import StrategyEngine


def make_trending_candles() -> list[Candle]:
    now = datetime.now(UTC)
    candles = []
    price = 100.0
    for index in range(90):
        change = 0.05 + (0.12 * math.sin(index / 2.2))
        if index % 4 == 0:
            change -= 0.05
        if index >= 86:
            change -= 0.05
        close = price + change
        candles.append(
            Candle(
                opened_at=now + timedelta(minutes=index),
                open=price,
                high=max(price, close) + 0.35,
                low=min(price, close) - 0.25,
                close=close,
                volume=1200 + index * 5 + (450 if index >= 78 else 0),
            )
        )
        price = close
    return candles


def test_strategy_builds_buy_signal_in_clean_trend() -> None:
    engine = StrategyEngine()
    signal = engine.build_signal("BTCUSDT", "1m", make_trending_candles(), has_open_position=False)

    assert signal.predicted_direction == "buy"
    assert signal.confidence > 0.5


def test_llm_filter_can_veto_buy_signal() -> None:
    engine = StrategyEngine()
    signal = engine.build_signal("BTCUSDT", "1m", make_trending_candles(), has_open_position=False)
    filtered = engine.apply_llm_filter(
        signal,
        LlmAssessment(sentiment="bearish", risk_flag=True, confidence=0.91, one_sentence_reason="Macro event risk rising."),
    )

    assert filtered.predicted_direction == "hold"
