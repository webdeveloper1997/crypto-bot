"use client";

import { useEffect, useState } from "react";
import type { BotSettings } from "@crypto-bot/shared";

type SettingsPanelProps = {
  isSubmitting: boolean;
  onSave: (input: Partial<BotSettings>) => Promise<void> | void;
  settings?: BotSettings | null;
};

type SettingsFormState = {
  dailyDrawdownLimitPct: string;
  decisionIntervalMinutes: string;
  displayName: string;
  liveStartingBalance: string;
  liveTradeNotional: string;
  maxConcurrentPositions: string;
  maxSymbolAllocationPct: string;
  maxTotalExposurePct: string;
  paperStartingBalance: string;
  paperTradeNotional: string;
  strategyVersion: string;
  symbols: string;
  timeframe: string;
  weeklyDrawdownLimitPct: string;
};

type Feedback = {
  detail?: string;
  tone: "error" | "success";
  title: string;
};

const timeframeOptions = ["1m", "5m", "15m", "1h", "4h"];

function buildFormState(settings?: BotSettings | null): SettingsFormState {
  return {
    dailyDrawdownLimitPct: `${settings?.daily_drawdown_limit_pct ?? 2}`,
    decisionIntervalMinutes: `${settings?.decision_interval_minutes ?? 5}`,
    displayName: settings?.display_name ?? "Primary Bot",
    liveStartingBalance: `${settings?.live_starting_balance ?? 1000}`,
    liveTradeNotional: `${settings?.live_trade_notional ?? 25}`,
    maxConcurrentPositions: `${settings?.max_concurrent_positions ?? 2}`,
    maxSymbolAllocationPct: `${settings?.max_symbol_allocation_pct ?? 10}`,
    maxTotalExposurePct: `${settings?.max_total_exposure_pct ?? 25}`,
    paperStartingBalance: `${settings?.paper_starting_balance ?? 1000}`,
    paperTradeNotional: `${settings?.paper_trade_notional ?? 50}`,
    strategyVersion: settings?.strategy_version ?? "intraday-rules-ml-v1",
    symbols: (settings?.symbols ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"]).join(", "),
    timeframe: settings?.timeframe ?? "1m",
    weeklyDrawdownLimitPct: `${settings?.weekly_drawdown_limit_pct ?? 6}`
  };
}

function FieldShell({
  children,
  label
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">{label}</p>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function textInputClass() {
  return "w-full rounded-[1rem] border border-slate-200 bg-white/85 px-4 py-3 text-sm text-[var(--color-ink)] outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100";
}

function parsePositiveNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a whole number greater than 0.`);
  }
  return parsed;
}

export function SettingsPanel({ isSubmitting, onSave, settings }: SettingsPanelProps) {
  const [form, setForm] = useState<SettingsFormState>(() => buildFormState(settings));
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    setForm(buildFormState(settings));
  }, [settings]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const symbols = form.symbols
        .split(/[\s,]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);

      if (symbols.length === 0) {
        throw new Error("Add at least one symbol.");
      }

      await onSave({
        daily_drawdown_limit_pct: parsePositiveNumber(form.dailyDrawdownLimitPct, "Daily drawdown limit"),
        decision_interval_minutes: parsePositiveInteger(form.decisionIntervalMinutes, "Decision interval"),
        display_name: form.displayName.trim() || "Primary Bot",
        live_starting_balance: parsePositiveNumber(form.liveStartingBalance, "Live starting balance"),
        live_trade_notional: parsePositiveNumber(form.liveTradeNotional, "Live trade notional"),
        max_concurrent_positions: parsePositiveInteger(form.maxConcurrentPositions, "Max concurrent positions"),
        max_symbol_allocation_pct: parsePositiveNumber(form.maxSymbolAllocationPct, "Per-symbol allocation cap"),
        max_total_exposure_pct: parsePositiveNumber(form.maxTotalExposurePct, "Total exposure cap"),
        paper_starting_balance: parsePositiveNumber(form.paperStartingBalance, "Paper starting balance"),
        paper_trade_notional: parsePositiveNumber(form.paperTradeNotional, "Paper trade notional"),
        strategy_version: form.strategyVersion.trim() || "intraday-rules-ml-v1",
        symbols,
        timeframe: form.timeframe,
        weekly_drawdown_limit_pct: parsePositiveNumber(form.weeklyDrawdownLimitPct, "Weekly drawdown limit")
      });

      setFeedback({
        detail: "Saved to Supabase. The Oracle worker will pick up the new settings on its next cycle.",
        title: "Settings updated",
        tone: "success"
      });
    } catch (error) {
      setFeedback({
        detail: error instanceof Error ? error.message : "Unable to save settings.",
        title: "Settings update failed",
        tone: "error"
      });
    }
  }

  function updateField<Key extends keyof SettingsFormState>(key: Key, value: SettingsFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="glass-panel rounded-[2rem] p-5 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-muted)]">Bot settings</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
            Tune risk, sizing, and symbols from the dashboard
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)] md:text-[15px]">
            These fields update your `bot_settings` row directly. Exchange keys, Supabase service-role credentials,
            and the global live-trading guard remain server-only and are intentionally not editable from the browser.
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-white/70 bg-white/75 px-4 py-3 xl:max-w-[20rem]">
          <p className="mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Not in browser</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
            Binance keys, Gemini key, `ALLOW_LIVE_TRADING`, and Supabase service-role key stay on Oracle only.
          </p>
        </div>
      </div>

      {feedback ? (
        <div
          className={`mt-6 rounded-[1.5rem] border px-4 py-4 md:px-5 ${
            feedback.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-rose-300 bg-rose-50 text-rose-800"
          }`}
        >
          <p className="font-medium">{feedback.title}</p>
          {feedback.detail ? <p className="mt-1 text-sm opacity-80">{feedback.detail}</p> : null}
        </div>
      ) : null}

      <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <FieldShell label="Bot name">
            <input className={textInputClass()} value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} />
          </FieldShell>
          <FieldShell label="Symbols">
            <input
              className={textInputClass()}
              value={form.symbols}
              onChange={(event) => updateField("symbols", event.target.value)}
              placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
            />
          </FieldShell>
          <FieldShell label="Timeframe">
            <select className={textInputClass()} value={form.timeframe} onChange={(event) => updateField("timeframe", event.target.value)}>
              {timeframeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FieldShell>
          <FieldShell label="Decision interval (minutes)">
            <input className={textInputClass()} value={form.decisionIntervalMinutes} onChange={(event) => updateField("decisionIntervalMinutes", event.target.value)} />
          </FieldShell>
          <FieldShell label="Strategy version">
            <input className={textInputClass()} value={form.strategyVersion} onChange={(event) => updateField("strategyVersion", event.target.value)} />
          </FieldShell>
          <div className="rounded-[1rem] border border-dashed border-slate-200 bg-white/55 px-4 py-4 text-sm leading-6 text-[var(--color-muted)]">
            Use comma-separated symbols. The worker will read the new list on its next cycle.
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <FieldShell label="Paper starting balance">
            <input className={textInputClass()} value={form.paperStartingBalance} onChange={(event) => updateField("paperStartingBalance", event.target.value)} />
          </FieldShell>
          <FieldShell label="Paper trade notional">
            <input className={textInputClass()} value={form.paperTradeNotional} onChange={(event) => updateField("paperTradeNotional", event.target.value)} />
          </FieldShell>
          <FieldShell label="Live starting balance">
            <input className={textInputClass()} value={form.liveStartingBalance} onChange={(event) => updateField("liveStartingBalance", event.target.value)} />
          </FieldShell>
          <FieldShell label="Live trade notional">
            <input className={textInputClass()} value={form.liveTradeNotional} onChange={(event) => updateField("liveTradeNotional", event.target.value)} />
          </FieldShell>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          <FieldShell label="Max concurrent positions">
            <input className={textInputClass()} value={form.maxConcurrentPositions} onChange={(event) => updateField("maxConcurrentPositions", event.target.value)} />
          </FieldShell>
          <FieldShell label="Per-symbol allocation %">
            <input className={textInputClass()} value={form.maxSymbolAllocationPct} onChange={(event) => updateField("maxSymbolAllocationPct", event.target.value)} />
          </FieldShell>
          <FieldShell label="Total exposure %">
            <input className={textInputClass()} value={form.maxTotalExposurePct} onChange={(event) => updateField("maxTotalExposurePct", event.target.value)} />
          </FieldShell>
          <FieldShell label="Daily drawdown %">
            <input className={textInputClass()} value={form.dailyDrawdownLimitPct} onChange={(event) => updateField("dailyDrawdownLimitPct", event.target.value)} />
          </FieldShell>
          <FieldShell label="Weekly drawdown %">
            <input className={textInputClass()} value={form.weeklyDrawdownLimitPct} onChange={(event) => updateField("weeklyDrawdownLimitPct", event.target.value)} />
          </FieldShell>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-white/70 bg-white/65 px-4 py-4">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            Mode switching, start/stop, and flattening remain separate operator actions above. This form is for persistent strategy and risk settings.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--color-ink)] px-6 py-3 text-sm font-medium ${
              isSubmitting ? "cursor-not-allowed opacity-60" : "bg-[var(--color-ink)] text-white hover:-translate-y-0.5"
            }`}
          >
            {isSubmitting ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>
    </section>
  );
}
