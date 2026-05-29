# Crypto Bot

This repo is a production-shaped Binance spot trading bot stack built for a small-budget setup:

- `apps/web` is a static Next.js dashboard deployed to Firebase Hosting.
- `apps/worker` is the Python trading worker deployed to an Oracle VM.
- `packages/shared` holds shared frontend contracts and JSON schemas.
- `supabase/migrations` holds the application database schema and RLS policies.
- `.github/workflows` holds CI plus separate frontend and worker deployment workflows.

## Architecture

The system is split into three planes:

1. Control and data plane: Supabase
   - Postgres stores bot settings, commands, signals, fills, positions, equity snapshots, daily metrics, and risk events.
   - Supabase Auth controls dashboard access.
   - RLS keeps each user scoped to their own bot data.
2. Presentation plane: Firebase-hosted static dashboard
   - The frontend reads Supabase data using the public anon key.
   - The frontend writes bot commands such as `switch_mode`, `start_bot`, `stop_bot`, and `flatten_all`.
   - The frontend never talks to Binance directly.
3. Execution plane: Oracle worker
   - The worker is the only component allowed to use Binance, Gemini, and the Supabase service-role key.
   - The worker polls market data, generates signals, writes telemetry, and executes paper, testnet, or live spot trades.

## Repo Layout

- `apps/web`
  - static Next.js app with client-side Supabase reads and command writes
- `apps/worker`
  - Python service with strategy logic, broker adapters, Binance integration, Gemini filter, and Supabase persistence
- `packages/shared`
  - TypeScript contracts and JSON schemas shared by the dashboard
- `supabase/migrations`
  - SQL migrations for schema, triggers, indexes, and policies
- `deploy`
  - Oracle bootstrap script, systemd unit, and worker runtime env template
- `docs`
  - supporting deployment and credential notes

## Frontend

The dashboard signs users in with Supabase Auth and shows:

- total equity
- daily gross and net PnL
- fee drag
- prediction accuracy
- prediction ledger
- fills
- open positions
- risk events
- current and pending execution mode

The frontend can request only operator actions:

- `switch_mode`
- `start_bot`
- `stop_bot`
- `flatten_all`
- `reconcile`

## Worker

The worker owns all sensitive integrations:

- Supabase `service_role`
- Gemini API
- Binance spot testnet and live keys

Current worker responsibilities:

- poll Binance spot OHLCV data
- compute indicator-based signals
- apply optional Gemini sentiment/risk veto or boost
- simulate paper fills with modeled fees and slippage
- execute testnet or live spot market orders
- persist orders, fills, positions, daily metrics, equity snapshots, and risk events

## Modes

- `paper`
  - local execution simulator with modeled fees and slippage
- `testnet`
  - Binance Spot Testnet integration mode
- `live`
  - real Binance spot execution

The worker enforces:

- flat-position checks before switching modes
- worker-side live-trading guard via `ALLOW_LIVE_TRADING`
- drawdown-based entry halts

## Database Migrations

All schema changes must go into `supabase/migrations` using a simple numbered format:

- `001_init_crypto_bot.sql`
- `002_add_some_feature.sql`
- `003_adjust_risk_events.sql`

Do not use timestamp-based migration names in this repo.

Rules:

1. Every database change must be stored as a migration file.
2. Apply migrations intentionally to the correct Supabase project.
3. Do not hide schema changes inside worker startup or deployment scripts.
4. Keep migration numbers sequential.

Current initial migration:

- [001_init_crypto_bot.sql](/home/muhammad/Desktop/crypto-bot/supabase/migrations/001_init_crypto_bot.sql)

## Credentials

Credential collection starts in:

- [`.env`](/home/muhammad/Desktop/crypto-bot/.env)

Use it only as a local worksheet. Final secret placement is split by environment:

- GitHub Actions
  - Firebase deploy credentials
  - public Supabase frontend values
  - Oracle SSH deploy credentials
- Oracle `/etc/crypto-bot/worker.env`
  - Supabase service-role key
  - Gemini key
  - Binance keys
  - worker runtime settings

Never put Binance keys, Gemini keys, or `SUPABASE_SERVICE_ROLE_KEY` into the frontend.

## Deployment

### Frontend

- GitHub Actions runs [deploy-web.yml](/home/muhammad/Desktop/crypto-bot/.github/workflows/deploy-web.yml).
- The workflow builds the static Next.js export.
- Firebase Hosting serves `apps/web/out`.

### Worker

- GitHub Actions runs [deploy-worker.yml](/home/muhammad/Desktop/crypto-bot/.github/workflows/deploy-worker.yml).
- The workflow SSHes into Oracle, syncs the repo, installs the worker into a virtualenv, and restarts `crypto-bot-worker.service`.
- The Oracle server must already be bootstrapped once with [bootstrap-oracle.sh](/home/muhammad/Desktop/crypto-bot/deploy/bootstrap-oracle.sh).

### Supabase

- Migrations are not auto-applied by GitHub Actions.
- You must apply migrations manually or through the correct Supabase MCP server before starting the worker.

## Setup Order

1. Create the Supabase project.
2. Apply `supabase/migrations/001_init_crypto_bot.sql`.
3. Create the Firebase project.
4. Add GitHub repository secrets.
5. Bootstrap the Oracle VM once with `deploy/bootstrap-oracle.sh`.
6. Install `/etc/crypto-bot/worker.env` on Oracle.
7. Push to `main` or re-run the GitHub Actions workflows.
8. Start in `paper` mode only.
9. Use `testnet` before enabling `live`.

## Safety

- The dashboard never stores or sees Binance or Gemini secrets.
- `ALLOW_LIVE_TRADING=false` blocks real orders at the worker even if the UI requests live mode.
- Switching from paper, testnet, or live is blocked while open positions exist.
- Daily and weekly loss limits halt new entries and emit risk events.
- Live keys can exist on the server without enabling live trading.
