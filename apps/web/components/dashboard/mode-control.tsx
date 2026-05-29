"use client";

import type { BotMode } from "@crypto-bot/shared";

type ModeControlProps = {
  desiredMode?: BotMode;
  actualMode?: BotMode;
  pendingMode?: BotMode;
  isRunning?: boolean;
  isSubmitting: boolean;
  onSwitchMode: (mode: BotMode) => void;
  onStart: () => void;
  onStop: () => void;
  onFlatten: () => void;
};

const modes: BotMode[] = ["paper", "testnet", "live"];

export function ModeControl({
  desiredMode,
  actualMode,
  pendingMode,
  isRunning,
  isSubmitting,
  onSwitchMode,
  onStart,
  onStop,
  onFlatten
}: ModeControlProps) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-muted)]">Execution control</p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">Paper to live stays explicit</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
            The UI only requests mode switches and operator actions. The worker enforces flat-position checks, runtime safety
            flags, and all exchange access.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-white/70 px-4 py-2">Desired: {desiredMode ?? "paper"}</span>
          <span className="rounded-full bg-white/70 px-4 py-2">Actual: {actualMode ?? "paper"}</span>
          <span className="rounded-full bg-white/70 px-4 py-2">Pending: {pendingMode ?? "none"}</span>
          <span className="rounded-full bg-white/70 px-4 py-2">{isRunning ? "Bot running" : "Bot stopped"}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {modes.map((mode) => {
          const active = actualMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSwitchMode(mode)}
              disabled={isSubmitting}
              className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-ink)]"
                  : "border-white/70 bg-white/70 text-[var(--color-ink)] hover:-translate-y-0.5"
              }`}
            >
              <p className="font-mono text-xs uppercase tracking-[0.24em]">{mode}</p>
              <p className="mt-2 text-sm text-current/80">
                {mode === "paper"
                  ? "Local fills with modeled fees and slippage."
                  : mode === "testnet"
                    ? "Binance integration checks without touching capital."
                    : "Real spot orders, still subject to worker-side live guardrails."}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={isSubmitting}
          className="rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          Start bot
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={isSubmitting}
          className="rounded-full border border-[var(--color-ink)] px-5 py-3 text-sm font-medium text-[var(--color-ink)]"
        >
          Stop bot
        </button>
        <button
          type="button"
          onClick={onFlatten}
          disabled={isSubmitting}
          className="rounded-full border border-rose-400 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-700"
        >
          Flatten all positions
        </button>
      </div>
    </section>
  );
}

