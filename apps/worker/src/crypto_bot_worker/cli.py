from __future__ import annotations

import argparse

from crypto_bot_worker.config import Settings
from crypto_bot_worker.logging import configure_logging
from crypto_bot_worker.worker import CryptoBotWorker


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the crypto bot worker.")
    parser.add_argument("--once", action="store_true", help="Run one worker cycle and exit.")
    args = parser.parse_args()

    settings = Settings()
    configure_logging(settings.log_level)
    worker = CryptoBotWorker(settings)
    worker.run_forever(once=args.once)

