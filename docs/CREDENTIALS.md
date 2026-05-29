# Credentials Checklist

## GitHub Actions secrets
- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`
- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_PROJECT_ID`
- `ORACLE_HOST`
- `ORACLE_USER`
- `ORACLE_SSH_PRIVATE_KEY`
- `ORACLE_PORT` (optional if `22`)

## Oracle runtime env
Store these in `/etc/crypto-bot/worker.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `BINANCE_TESTNET_API_KEY`
- `BINANCE_TESTNET_API_SECRET`
- `BINANCE_LIVE_API_KEY`
- `BINANCE_LIVE_API_SECRET`
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)
- `ALLOW_LIVE_TRADING=false` until paper-mode validation is complete

## Not allowed in the frontend
- `SUPABASE_SERVICE_ROLE_KEY`
- Any Binance credentials
- `GEMINI_API_KEY`
- Telegram tokens
