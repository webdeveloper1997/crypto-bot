# Version 001: Current Bot Analysis And Solution

Date: 2026-06-10

## Purpose

This document records the behavior of the current crypto bot after inspecting the live Supabase data and worker code. It explains why the current strategy is not profit-ready and defines the solution direction for the next version.

The goal is to move from a weak long-only signal bot into a controlled short-duration trading system that can target small repeatable profits while accounting for fees, slippage, execution quality, and risk.

## Current Bot Summary

The current bot is an intraday spot strategy. It is not a short-selling bot.

It watches:

- `BTCUSDT`
- `ETHUSDT`
- `SOLUSDT`

Current timeframe:

- `1m`

Current mode in the database:

- `testnet`

The strategy calculates:

- EMA 21
- EMA 55
- RSI 14
- ATR 14
- Volume SMA 20
- VWAP
- ATR in basis points

It creates three possible signals:

- `buy`
- `sell`
- `hold`

## Current Entry Rule

The bot buys only when all of these are true:

```text
No open position for the symbol
close > EMA21 > EMA55
RSI between 52 and 68
volume > volume_sma_20 * 1.1
ATR bps < 280
```

This means it buys only during a small 1-minute bullish trend plus volume pulse.

## Current Exit Rule

The bot sells only when it already has an open position and any of these are true:

```text
close < EMA21
RSI < 45
close < VWAP
```

This means the bot does not use real take-profit or stop-loss execution. It exits reactively when 1-minute momentum weakens.

## Measured Database Findings

The inspected database contained:

- `7320` signals
- `14` orders
- `14` fills
- `7` positions
- `2` daily metric rows
- `1` risk event

The bot ran mainly from 2026-05-29 to 2026-05-31.

### Signal Behavior

On 2026-05-30 in testnet:

```text
Total signals: 4002
Hold signals: 3915
Buy signals: 82
Sell signals: 5
Hold rate: 97.83%
Buy signal rate: 2.05%
Sell signal rate: 0.12%
```

This confirms the bot mostly holds throughout the day.

### Confidence Behavior

The common `0.42` confidence value is mostly caused by `hold` signals.

Current code hard-codes no-trade confidence:

```text
hold confidence = 0.42
```

Actual executed buy signals were much higher, around `0.65` to `0.86`. So the dashboard can make the bot look like every trade has 40% confidence, but that is mostly hold-signal noise.

### Trade Results

Paper mode on 2026-05-29:

```text
Closed trades: 2
Winners: 0
Losers: 2
Win rate: 0%
Net PnL: -0.35112103
```

Testnet mode on 2026-05-30:

```text
Closed trades: 5
Winners: 2
Losers: 3
Win rate: 40%
Net PnL: -0.31099120
```

Testnet average:

```text
Average return: -24.5477 bps
Average winner: 1.6157 bps
Average loser: -41.9900 bps
Average entry expected move: 1.41 bps
Average hold time: 13.83 minutes
```

This is a bad reward/risk shape. Winners were tiny, while losers were much larger.

## Important Testnet Distortion

One BTC testnet trade was not a realistic market result.

At `2026-05-30 05:37 UTC`:

```text
Public BTCUSDT market candle price: around 73574
Testnet order fill price: 74524.41
Difference: about +129 bps worse
```

That one fill created a very large fake loss:

```text
Realized return: -122.7558 bps
```

This happened because the bot uses public Binance market candles, but testnet execution uses the Binance Spot Testnet order book. Testnet prices can be detached from the real public market.

Conclusion:

```text
Do not judge strategy profitability from Binance testnet PnL.
```

Use paper mode with real public prices, or build a proper backtest.

## Oracle Worker Log Findings

The database did not contain all important failures. Oracle systemd journal logs for `crypto-bot-worker.service` showed runtime errors that were not persisted to Supabase.

Log window inspected:

```text
2026-05-29 00:00:00 UTC to 2026-05-31 23:59:59 UTC
```

Counts from Oracle logs:

```text
LOT_SIZE errors: 135
Gemini 429 warnings: 90
Worker cycle failures: 364
```

Daily breakdown:

```text
2026-05-29 LOT_SIZE=16   Worker failed=244   Gemini 429=2
2026-05-30 LOT_SIZE=77   Worker failed=77    Gemini 429=62
2026-05-31 LOT_SIZE=42   Worker failed=43    Gemini 429=26
```

The key execution error was:

```text
binance.error.ClientError: Filter failure: LOT_SIZE
```

This explains why many ETH/SOL buy signals did not become orders. The signal was saved first, then Binance rejected the order because the requested quantity did not match the symbol's allowed lot size rules.

The current code rounds order quantity to 6 decimals:

```text
round(quantity, 6)
```

That is not enough. Binance requires each symbol to obey its own exchange filters:

```text
stepSize
minQty
maxQty
minNotional
```

BTC sometimes passed by chance. ETH/SOL failed more often because their required quantity increments did not match the naive rounding.

### Historical Signal Insert Bug

On 2026-05-29, Oracle logs also showed repeated worker failures from:

```text
TypeError: Object of type bool is not JSON serializable
```

This happened when inserting signal metadata into Supabase. The deployed code now casts the signal booleans with `bool(...)`, so this specific historical issue appears fixed.

### Gemini Rate Limit And Secret Exposure

Oracle logs showed many Gemini failures:

```text
Gemini research filter failed: 429 Too Many Requests
```

This means Gemini was rate-limited and the bot often fell back to rules-only behavior.

The logs also included the Gemini request URL with the API key in the exception text. That key should be rotated, and Gemini error logging should redact request URLs or API keys before writing to journal.

## Main Reasons The Bot Behaves Badly

### 1. It Trades Tiny Expected Moves

The bot often enters trades with expected moves around:

```text
1 to 8 bps
```

That is too small for real trading after fees, spread, and slippage.

In paper mode, the model charges:

```text
Buy fee: 10 bps
Sell fee: 10 bps
Buy slippage: 5 bps
Sell slippage: 5 bps
Approximate round-trip cost: 30 bps
```

But the bot entered paper trades expecting only about `5` to `8` bps.

That means many trades are negative expectancy before they start.

### 2. It Has No Real Take-Profit

The bot stores this:

```text
take_profit_plan
```

But it does not actually execute a take-profit order or close based on that plan.

The take-profit plan is only metadata.

### 3. It Has No Real Stop-Loss

The bot stores this:

```text
stop_plan
```

But it does not actually execute a stop-loss order or close based on that plan.

The stop plan is only metadata.

### 4. Exits Are Noisy

The bot buys on a 1-minute bullish burst, then exits when:

```text
close < EMA21
or RSI < 45
or close < VWAP
```

On a 1-minute chart, these conditions flip frequently. That creates small wins, many holds, and sudden exits.

### 5. It Does Not Check Cost Before Trading

There is no rule like:

```text
Only trade if expected profit > fees + spread + slippage + profit buffer
```

This is the biggest missing profitability filter.

### 6. It Is Long-Only

The bot buys spot and later sells spot.

It does not short-sell. If the goal is to profit from falling prices, the current system cannot do that.

### 7. Execution Failures Are Not Visible Enough

The DB showed many ETH/SOL buy signals in testnet, but actual testnet orders were only BTC.

Confirmed explanation from Oracle logs:

```text
ETH/SOL order execution failed after the signal was saved because Binance rejected invalid LOT_SIZE quantities.
```

But the worker currently does not persist those execution errors clearly into `risk_events`.

That makes debugging difficult from the dashboard.

### 8. It Does Not Respect Binance Symbol Filters

The worker uses a simple 6-decimal quantity round before order submission.

That is not exchange-safe.

Each symbol needs quantity rounded down to its actual `stepSize`, then checked against:

```text
minQty
maxQty
minNotional
```

Without this, valid-looking signals can fail at execution time.

### 9. Gemini Can Be Rate-Limited

Gemini hit `429 Too Many Requests` repeatedly.

When that happens, the code falls back to a neutral rules-only decision. That is acceptable as a fail-open fallback, but the dashboard should show when Gemini was skipped, failed, or rate-limited.

### 10. Logs Can Leak Secrets

The Gemini exception message included the request URL with the API key.

That is a security issue. API keys should not appear in systemd journal logs.

### 11. Hold Signals Lack Detailed Reason Codes

For each signal, the DB stores:

```text
trend_ok
volume_pulse
```

But it does not store the full indicator snapshot:

```text
RSI
EMA values
ATR bps
VWAP distance
volume ratio
spread estimate
cost estimate
specific failed gate
```

Without those fields, it is hard to explain exactly why a given signal became `hold`.

## Required Solution For Version 002

The next version should not simply loosen the current buy rule. It should add proper trade economics and execution control.

## Solution Plan

### 1. Add A Real Cost Filter

Before any entry, estimate:

```text
fee_bps
spread_bps
slippage_bps
minimum_profit_buffer_bps
required_edge_bps
```

Then require:

```text
expected_move_bps >= required_edge_bps
```

Example:

```text
estimated round-trip cost = 12 bps
minimum profit buffer = 8 bps
required edge = 20 bps
```

If expected move is only `2 bps`, the bot must not trade.

### 2. Add Real Exit Management

Every opened trade needs explicit exit rules:

```text
take_profit_bps
stop_loss_bps
trailing_stop_bps
max_hold_minutes
emergency_exit
```

The worker should check open positions each cycle before looking for new entries.

Example:

```text
Take profit: +18 bps
Stop loss: -9 bps
Trailing stop after +10 bps
Max hold: 15 minutes
```

This creates a defined reward/risk profile instead of waiting for noisy EMA/VWAP weakness.

### 3. Add A Minimum Reward/Risk Rule

The bot should only enter if:

```text
take_profit_bps / stop_loss_bps >= 1.5
```

Preferred:

```text
2.0 or better
```

For example:

```text
Target: +20 bps
Stop: -10 bps
Reward/risk: 2.0
```

### 4. Store Full Signal Diagnostics

Each signal should save a diagnostic payload:

```json
{
  "close": 73574.42,
  "ema_fast": 73540.12,
  "ema_slow": 73498.88,
  "rsi": 61.4,
  "atr_bps": 4.8,
  "volume_ratio": 1.27,
  "vwap": 73521.10,
  "vwap_distance_bps": 7.25,
  "expected_move_bps": 18.2,
  "estimated_cost_bps": 9.5,
  "required_edge_bps": 17.5,
  "failed_reasons": []
}
```

For holds, it should explain exactly why:

```json
{
  "failed_reasons": [
    "volume_ratio_below_min",
    "expected_move_below_required_edge"
  ]
}
```

### 5. Fix Hold Confidence

Hold confidence should not be displayed like trade confidence.

Options:

```text
Set hold confidence to 0
or store signal_strength separately
or hide hold confidence in dashboard
```

Recommended:

```text
confidence = null or 0 for hold
trade_confidence only for buy/sell
```

### 6. Persist Execution Errors

If an order fails, write a `risk_events` row with:

```text
event_type = execution_failed
severity = warning or critical
symbol
mode
signal_id
exchange error message
request quantity
market price
```

This will explain why a buy signal did not create an order.

### 7. Respect Binance Symbol Filters

Before placing an order, fetch and cache exchange filters for every configured symbol.

For every order:

```text
raw_quantity = trade_notional / market_price
quantity = floor_to_step_size(raw_quantity, symbol.stepSize)
notional = quantity * market_price
```

Then block the order if:

```text
quantity < minQty
quantity > maxQty
notional < minNotional
```

If blocked, write a `risk_events` row:

```text
event_type = execution_blocked
message = quantity did not satisfy Binance filters
details = raw quantity, rounded quantity, stepSize, minQty, minNotional
```

This prevents `Filter failure: LOT_SIZE` from killing the whole worker cycle.

### 8. Keep Processing After A Symbol Fails

Execution errors should be caught per symbol.

One failed ETH or SOL order should not fail the entire worker cycle.

Recommended behavior:

```text
save signal
try execution
if execution fails:
  save execution_failed risk event
  continue to next symbol
```

### 9. Redact Secret Values In Logs

Gemini and Binance errors must not write API keys into logs.

Recommended behavior:

```text
Log HTTP status, provider, model, and short error reason.
Do not log full request URLs.
Do not log query strings.
Do not log API keys.
```

Rotate the Gemini key that appeared in the Oracle journal.

### 10. Do Not Use Testnet PnL As Profitability Truth

For strategy testing:

```text
Use paper mode with real public market prices
Run a historical backtest
Compare gross and net PnL
Include fees, spread, and slippage
```

Testnet should only verify:

```text
API keys work
orders can be submitted
fills can be parsed
balances are sufficient
mode switching works
```

### 11. Add Backtesting Before More Live Runs

Build a local backtest runner that can:

```text
load historical candles
run the strategy over every candle
simulate entries and exits
apply fees and slippage
report win rate, profit factor, drawdown, average win, average loss
```

Minimum report:

```text
trades
win_rate
gross_pnl
net_pnl
profit_factor
max_drawdown
average_win_bps
average_loss_bps
expectancy_bps
average_hold_minutes
```

Do not go live until backtest and paper mode show positive expectancy after costs.

## Proposed Version 002 Strategy Direction

Version 002 should be a short-duration long-only scalping strategy unless futures/margin shorting is intentionally added later.

Suggested direction:

```text
Timeframe: 1m entries with 5m trend confirmation
Trend filter: 5m EMA alignment
Entry trigger: 1m pullback/reclaim or breakout with volume
Cost filter: required edge above round-trip cost
Exit: fixed TP/SL plus trailing stop
Max hold: 10-20 minutes
No trade during low-volatility chop
No trade when spread/cost is too high
```

Core rule shape:

```text
Only buy when:
5m trend is bullish
1m setup has momentum or reclaim
volume confirms
expected move beats costs
reward/risk is at least 1.5
```

Exit:

```text
Take profit hit -> sell
Stop loss hit -> sell
Trailing stop hit -> sell
Max hold reached -> sell
Emergency risk condition -> sell
```

## Implementation Checklist

- [x] Add indicator diagnostics to every signal.
- [x] Add explicit hold failed reasons.
- [x] Add cost model: fee, spread, slippage, required edge.
- [x] Block entries below required edge.
- [x] Add real stop-loss and take-profit logic in worker.
- [ ] Add trailing stop support.
- [x] Add max hold time.
- [x] Persist execution failures as risk events.
- [x] Fetch and cache Binance exchange filters.
- [x] Round quantities down to symbol `stepSize`.
- [x] Check `minQty`, `maxQty`, and `minNotional` before order submission.
- [x] Catch execution failures per symbol and continue the cycle.
- [x] Redact API keys and request query strings from logs.
- [ ] Rotate the exposed Gemini API key.
- [ ] Fix dashboard hold confidence display.
- [ ] Build backtest runner.
- [ ] Backtest BTC, ETH, and SOL separately.
- [ ] Run paper mode for several days before any live mode.

## Implemented Version 002 Baseline

Implemented locally in strategy version `intraday-rules-cost-managed-v2`.

Core changes:

```text
Signals use only closed candles.
Orders and managed exits use current ticker price.
Buy signals require trend, RSI, volume, VWAP, volatility, and cost edge.
Hold confidence is 0 instead of misleading 0.42.
Managed exits sell on take-profit, stop-loss, or max hold time.
Binance orders are rounded to exchange stepSize and checked against minNotional.
Execution and symbol failures are persisted as risk_events.
Gemini errors no longer log API-key URLs.
```

Database migration:

```text
supabase/migrations/003_tune_primary_bot_for_cost_managed_scalping.sql
```

Applied live bot settings:

```text
desired_mode: paper
actual_mode: paper
is_running: false
timeframe: 5m
symbols: BTCUSDT, ETHUSDT, SOLUSDT
max_concurrent_positions: 2
max_symbol_allocation_pct: 5
max_total_exposure_pct: 10
daily_drawdown_limit_pct: 1
weekly_drawdown_limit_pct: 3
paper_trade_notional: 50
live_trade_notional: 25
```

## Bottom Line

The current bot is not useless because of one small bug. It is structurally incomplete for profitable short-duration trading.

The biggest problems are:

```text
No cost filter
No real take-profit
No real stop-loss
Tiny expected moves
No proper backtest
Misleading hold confidence
Poor visibility into execution failures
Invalid Binance LOT_SIZE quantity handling
Gemini rate limits
Secret-bearing exception logs
Testnet PnL distortion
```

Version 002 should focus on trade economics, controlled exits, observability, and backtesting before trying to increase trade frequency.
