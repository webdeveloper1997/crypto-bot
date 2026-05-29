# Crypto Bot

This repo implements a first production-shaped version of the Binance spot bot stack:

- `apps/web` is a static Next.js dashboard deployed to Firebase Hosting.
- `apps/worker` is the Python execution worker that runs on Oracle.
- `packages/shared` holds dashboard-side contracts and JSON schema.
- `supabase/migrations` contains the initial Supabase schema and RLS policies.
- `.github/workflows` contains CI plus separate frontend and worker deploy pipelines.

## Frontend

The web app signs users in with Supabase auth, reads bot telemetry with the anon key, and writes operator commands like:

- `switch_mode`
- `start_bot`
- `stop_bot`
- `flatten_all`

It shows:

- total equity
- daily gross and net PnL
- fee drag
- prediction accuracy
- prediction ledger
- fill tape
- open positions
- risk events

## Worker

The worker owns all sensitive integrations:

- Supabase `service_role`
- Gemini API
- Binance spot testnet and live keys

It currently implements:

- market-data polling from Binance spot
- lightweight rules-plus-indicators signal generation
- optional Gemini research veto/boost
- paper broker execution
- testnet/live broker execution
- order, fill, position, metric, and risk-event persistence

## Setup order

1. Create the Supabase project.
2. Apply the SQL migration in `supabase/migrations`.
3. Create the Firebase project and GitHub repository secrets from `docs/CREDENTIALS.md`.
4. Bootstrap the Oracle VM with `deploy/bootstrap-oracle.sh`.
5. Fill `/etc/crypto-bot/worker.env` on the Oracle VM.
6. Push to `main` to trigger frontend and worker deployment.

## Safety

- The dashboard never stores or sees Binance or Gemini secrets.
- `ALLOW_LIVE_TRADING=false` blocks real orders at the worker even if the UI asks for live mode.
- Switching from paper/testnet/live is blocked while open positions exist.
- Daily and weekly loss limits halt the worker and emit risk events.
