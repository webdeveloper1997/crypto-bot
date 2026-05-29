# Deployment Notes

## Frontend
- Static export lives in `apps/web/out`.
- GitHub Actions injects only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Firebase Hosting serves the exported dashboard from root `firebase.json`.

## Worker
- The Oracle worker is deployed to `/opt/crypto-bot/current`.
- Runtime secrets live in `/etc/crypto-bot/worker.env`.
- Systemd unit file is `deploy/systemd/crypto-bot-worker.service`.
- Run `deploy/bootstrap-oracle.sh` once on the server before enabling automatic deploys.

## Database
- SQL migrations live under `supabase/migrations`.
- Apply them intentionally through Supabase SQL or the CLI after the project exists.
- The deploy workflows do not auto-apply schema changes.
