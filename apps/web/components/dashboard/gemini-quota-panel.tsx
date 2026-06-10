"use client";

import type { GeminiKeyStatusRecord, GeminiUsageEvent } from "@crypto-bot/shared";

import { formatNumber, formatTimestamp } from "@/lib/format";

type GeminiQuotaPanelProps = {
  keys: GeminiKeyStatusRecord[];
  usageEvents: GeminiUsageEvent[];
};

type UsageTotals = {
  candidatesTokens: number;
  promptTokens: number;
  requests: number;
  totalTokens: number;
};

function emptyUsage(): UsageTotals {
  return {
    candidatesTokens: 0,
    promptTokens: 0,
    requests: 0,
    totalTokens: 0
  };
}

function addUsage(total: UsageTotals, event: GeminiUsageEvent): UsageTotals {
  return {
    candidatesTokens: total.candidatesTokens + event.candidates_tokens,
    promptTokens: total.promptTokens + event.prompt_tokens,
    requests: total.requests + event.request_count,
    totalTokens: total.totalTokens + event.total_tokens
  };
}

function statusTone(status: GeminiKeyStatusRecord["last_status"]) {
  if (status === "success" || status === "ready") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "rate_limited") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-rose-100 text-rose-700";
}

export function GeminiQuotaPanel({ keys, usageEvents }: GeminiQuotaPanelProps) {
  const now = Date.now();
  const minuteEvents = usageEvents.filter((event) => now - new Date(event.created_at).getTime() <= 60_000);
  const usageByKey = new Map<string, UsageTotals>();
  const minuteUsageByKey = new Map<string, UsageTotals>();

  for (const event of usageEvents) {
    usageByKey.set(event.key_label, addUsage(usageByKey.get(event.key_label) ?? emptyUsage(), event));
  }

  for (const event of minuteEvents) {
    minuteUsageByKey.set(event.key_label, addUsage(minuteUsageByKey.get(event.key_label) ?? emptyUsage(), event));
  }

  const totalRequests = Array.from(usageByKey.values()).reduce((sum, item) => sum + item.requests, 0);
  const totalRequestLimit = keys.reduce((sum, key) => sum + key.daily_request_limit, 0);
  const remainingRequests = Math.max(totalRequestLimit - totalRequests, 0);
  const totalTokens = Array.from(usageByKey.values()).reduce((sum, item) => sum + item.totalTokens, 0);
  const latestEvent = usageEvents[0];

  return (
    <section className="glass-panel rounded-[1.75rem] p-5 md:rounded-[2rem] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-muted)]">Gemini engine</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Quota and key rotation</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
            Estimated from worker-recorded calls. Exact active Gemini limits still live in Google AI Studio.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[30rem]">
          <div className="rounded-[1rem] bg-white/75 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Keys</p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">{keys.length}</p>
          </div>
          <div className="rounded-[1rem] bg-white/75 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Requests left</p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
              {remainingRequests}/{totalRequestLimit}
            </p>
          </div>
          <div className="rounded-[1rem] bg-white/75 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Tokens today</p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">{formatNumber(totalTokens, 0)}</p>
          </div>
        </div>
      </div>

      {keys.length === 0 ? (
        <div className="mt-5 rounded-[1.4rem] border border-dashed border-slate-200 bg-white/65 px-4 py-6 text-sm text-[var(--color-muted)]">
          No Gemini keys have been registered by the worker yet.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {keys.map((key) => {
            const usage = usageByKey.get(key.key_label) ?? emptyUsage();
            const minuteUsage = minuteUsageByKey.get(key.key_label) ?? emptyUsage();
            const keyRemaining = Math.max(key.daily_request_limit - usage.requests, 0);
            const lastEvent = usageEvents.find((event) => event.key_label === key.key_label);

            return (
              <article key={key.id} className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--color-ink)]">{key.key_label}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{key.model}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${statusTone(key.last_status)}`}>
                    {key.last_status.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1rem] bg-slate-50/90 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Daily requests</p>
                    <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
                      {usage.requests}/{key.daily_request_limit} used, {keyRemaining} left
                    </p>
                  </div>
                  <div className="rounded-[1rem] bg-slate-50/90 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Minute requests</p>
                    <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
                      {minuteUsage.requests}/{key.minute_request_limit}
                    </p>
                  </div>
                  <div className="rounded-[1rem] bg-slate-50/90 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Prompt tokens</p>
                    <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">{formatNumber(usage.promptTokens, 0)}</p>
                  </div>
                  <div className="rounded-[1rem] bg-slate-50/90 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Last use</p>
                    <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
                      {formatTimestamp(key.last_used_at ?? lastEvent?.created_at)}
                    </p>
                  </div>
                </div>

                {key.exhausted_until ? (
                  <p className="mt-3 text-sm text-amber-800">Cooldown until {formatTimestamp(key.exhausted_until)}</p>
                ) : null}
                {key.last_error ? <p className="mt-3 text-sm text-rose-700">{key.last_error}</p> : null}
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">
        Latest Gemini event: {latestEvent ? `${latestEvent.status} on ${latestEvent.key_label} at ${formatTimestamp(latestEvent.created_at)}` : "none today"}
      </p>
    </section>
  );
}
