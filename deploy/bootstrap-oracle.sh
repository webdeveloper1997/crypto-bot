#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-ubuntu}"
APP_ROOT="${APP_ROOT:-/opt/crypto-bot/current}"
ENV_ROOT="${ENV_ROOT:-/etc/crypto-bot}"

echo "Bootstrapping Oracle worker host for ${APP_USER}"

sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip build-essential rsync git

sudo mkdir -p "${APP_ROOT}" "${ENV_ROOT}"
sudo chown -R "${APP_USER}:${APP_USER}" /opt/crypto-bot

if [[ ! -f "${ENV_ROOT}/worker.env" ]]; then
  sudo install -m 600 deploy/worker-runtime.env.example "${ENV_ROOT}/worker.env"
  echo "Created ${ENV_ROOT}/worker.env from example. Fill in real secrets before starting the service."
fi

sudo install -m 644 deploy/systemd/crypto-bot-worker.service /etc/systemd/system/crypto-bot-worker.service
sudo systemctl daemon-reload
sudo systemctl enable crypto-bot-worker.service

echo "Bootstrap complete. Edit /etc/systemd/system/crypto-bot-worker.service if the run user is not ubuntu."
echo "Then copy the repo to ${APP_ROOT}, create the venv, and restart the service."

