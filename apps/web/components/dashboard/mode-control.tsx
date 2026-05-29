"use client";

import type { BotMode } from "@crypto-bot/shared";

type CommandNotice = {
  detail?: string;
  title: string;
  tone: "error" | "info" | "success";
};

type ModeControlProps = {
  desiredMode?: BotMode;
  actualMode?: BotMode;
  pendingMode?: BotMode;
  isRunning?: boolean;
  isSubmitting: boolean;
  activeAction?: string | null;
  commandNotice?: CommandNotice | null;
  onSwitchMode: (mode: BotMode) => void;
  onStart: () => void;
  onStop: () => void;
  onFlatten: () => void;
};

const modes: BotMode[] = ["paper", "testnet", "live"];

function ActionButton({
  activeAction,
  actionKey,
  children,
  disabled,
  onClick,
  tone = "default"
}: {
  activeAction?: string | null;
  actionKey: string;
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  tone?: "danger" | "default" | "outline";
}) {
  const isActive = activeAction === actionKey;
  const className =
    tone === "danger"
      ? "border-rose-400 bg-rose-50 text-rose-700"
      : tone === "outline"
        ? "border-[var(--color-ink)] bg-transparent text-[var(--color-ink)]"
        : "border-[var(--color-ink)] bg-[var(--color-ink)] text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center rounded-full border px-5 py-3 text-sm font-medium transition ${
        className
      } ${disabled ? "cursor-not-allowed opacity-55" : "hover:-translate-y-0.5"} ${isActive ? "shadow-[0_16px_35px_rgba(15,23,42,0.18)]" : ""}`}
    >
      {isActive ? "Submitting..." : children}
    </button>
  );
}

export function ModeControl({
  desiredMode,
  actualMode,
  pendingMode,
  isRunning,
  isSubmitting,
  activeAction,
  commandNotice,
  onSwitchMode,
  onStart,
  onStop,
  onFlatten
}: ModeControlProps) {
  return (
    <section className="glass-panel rounded-[2rem] p-5 md:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-muted)]">Execution control</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
            Paper to live stays explicit
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)] md:text-[15px]">
            The UI can only request actions. The Oracle worker decides whether the command is valid, applies exchange
            safety checks, and reports the final result back into Supabase.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[21rem] xl:max-w-[24rem]">
          <div className="rounded-[1.35rem] border border-white/70 bg-white/75 px-4 py-3">
            <p className="mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Desired</p>
            <p className="mt-2 text-base font-semibold capitalize text-[var(--color-ink)]">{desiredMode ?? "paper"}</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/70 bg-white/75 px-4 py-3">
            <p className="mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Actual</p>
            <p className="mt-2 text-base font-semibold capitalize text-[var(--color-ink)]">{actualMode ?? "paper"}</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/70 bg-white/75 px-4 py-3">
            <p className="mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Pending</p>
            <p className="mt-2 text-base font-semibold capitalize text-[var(--color-ink)]">{pendingMode ?? "none"}</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/70 bg-white/75 px-4 py-3">
            <p className="mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Status</p>
            <p className="mt-2 text-base font-semibold text-[var(--color-ink)]">{isRunning ? "Bot running" : "Bot stopped"}</p>
          </div>
        </div>
      </div>

      {commandNotice ? (
        <div
          className={`mt-6 rounded-[1.5rem] border px-4 py-4 md:px-5 ${
            commandNotice.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : commandNotice.tone === "error"
                ? "border-rose-300 bg-rose-50 text-rose-800"
                : "border-sky-300 bg-sky-50 text-sky-900"
          }`}
        >
          <p className="font-medium">{commandNotice.title}</p>
          {commandNotice.detail ? <p className="mt-1 text-sm opacity-80">{commandNotice.detail}</p> : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {modes.map((mode) => {
          const isActiveMode = actualMode === mode;
          const isPendingMode = pendingMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSwitchMode(mode)}
              disabled={isSubmitting}
              className={`rounded-[1.5rem] border px-4 py-4 text-left transition md:px-5 ${
                isActiveMode
                  ? "border-[var(--color-accent)] bg-[linear-gradient(180deg,rgba(245,158,11,0.22),rgba(255,255,255,0.92))] text-[var(--color-ink)] shadow-[0_18px_40px_rgba(217,119,6,0.16)]"
                  : "border-white/70 bg-white/70 text-[var(--color-ink)] hover:-translate-y-0.5"
              } ${isSubmitting ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-xs uppercase tracking-[0.24em]">{mode}</p>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${
                    isActiveMode
                      ? "bg-amber-100 text-amber-900"
                      : isPendingMode
                        ? "bg-sky-100 text-sky-800"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {isActiveMode ? "live state" : isPendingMode ? "queued" : "ready"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-current/80">
                {mode === "paper"
                  ? "Local fills with modeled fees and slippage. Best starting mode for verifying telemetry and command flow."
                  : mode === "testnet"
                    ? "Routes real API requests into Binance Spot Testnet without risking capital."
                    : "Real Binance spot orders. Worker-side live guardrails still apply even if you request this mode."}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ActionButton activeAction={activeAction} actionKey="start_bot" disabled={isSubmitting} onClick={onStart}>
          Start bot
        </ActionButton>
        <ActionButton activeAction={activeAction} actionKey="stop_bot" disabled={isSubmitting} onClick={onStop} tone="outline">
          Stop bot
        </ActionButton>
        <ActionButton activeAction={activeAction} actionKey="flatten_all" disabled={isSubmitting} onClick={onFlatten} tone="danger">
          Flatten all positions
        </ActionButton>
      </div>
    </section>
  );
}
