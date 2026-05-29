"use client";

import { type BotMode } from "@crypto-bot/shared";

import { AuthGate } from "@/components/auth/auth-gate";
import { ActivityPanels } from "@/components/dashboard/activity-panels";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ModeControl } from "@/components/dashboard/mode-control";
import { PerformanceCharts } from "@/components/dashboard/performance-charts";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useBotDashboard } from "@/hooks/use-bot-dashboard";
import { formatPercentFromWhole, formatTimestamp, formatUsd } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function DashboardPage() {
  const { user } = useAuthSession();
  const {
    settings,
    equitySnapshots,
    dailyMetrics,
    signals,
    fills,
    positions,
    riskEvents,
    commands,
    summary,
    isLoading,
    error,
    enqueueCommand
  } = useBotDashboard(user?.id);

  const pendingMode = commands.find((command) => command.command_type === "switch_mode" && command.status === "pending")?.payload
    ?.targetMode as BotMode | undefined;

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
  }

  return (
    <AuthGate>
      <main className="dashboard-shell">
        <section className="glass-panel rounded-[2.75rem] px-8 py-8 md:px-10">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="mono text-xs uppercase tracking-[0.34em] text-[var(--color-muted)]">Oracle worker + Supabase control plane</p>
              <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-tight text-[var(--color-ink)]">
                Read the bot like an operator, not like a black box.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--color-muted)]">
                Compare what the bot predicted against what the market actually did, track exact fee drag, inspect open
                exposure, and keep the paper-to-live boundary deliberate.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={signOut}
                className="rounded-full border border-[var(--color-ink)] px-5 py-3 text-sm font-medium text-[var(--color-ink)]"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="mt-6 rounded-[2rem] border border-rose-300 bg-rose-50 px-6 py-5 text-rose-700">
            {(error as Error).message}
          </section>
        ) : null}

        {isLoading ? (
          <section className="mt-6 rounded-[2rem] border border-white/70 bg-white/75 px-6 py-12 text-center text-[var(--color-muted)]">
            Pulling bot settings, daily metrics, fills, and prediction history from Supabase.
          </section>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total equity"
            value={formatUsd(summary.latestEquity?.total_equity)}
            tone="good"
            caption={`Latest snapshot ${formatTimestamp(summary.latestEquity?.snapped_at)}`}
          />
          <MetricCard
            label="Daily net PnL"
            value={formatUsd(summary.latestMetrics?.net_pnl)}
            tone={(summary.latestMetrics?.net_pnl ?? 0) >= 0 ? "good" : "warn"}
            caption={`Gross ${formatUsd(summary.latestMetrics?.gross_pnl)}`}
          />
          <MetricCard
            label="Fees today"
            value={formatUsd(summary.latestMetrics?.fee_total)}
            caption="Summed from fills and persisted daily rollups"
          />
          <MetricCard
            label="Prediction accuracy"
            value={formatPercentFromWhole(summary.accuracy)}
            caption={`${summary.latestMetrics?.predictions_hit ?? 0}/${summary.latestMetrics?.predictions_total ?? 0} calls resolved`}
          />
        </div>

        <div className="mt-6">
          <ModeControl
            desiredMode={settings?.desired_mode}
            actualMode={settings?.actual_mode}
            pendingMode={pendingMode}
            isRunning={settings?.is_running}
            isSubmitting={enqueueCommand.isPending}
            onSwitchMode={(mode) => enqueueCommand.mutate({ commandType: "switch_mode", payload: { targetMode: mode } })}
            onStart={() => enqueueCommand.mutate({ commandType: "start_bot" })}
            onStop={() => enqueueCommand.mutate({ commandType: "stop_bot" })}
            onFlatten={() => enqueueCommand.mutate({ commandType: "flatten_all" })}
          />
        </div>

        <div className="mt-6">
          <PerformanceCharts equitySnapshots={equitySnapshots} dailyMetrics={dailyMetrics} />
        </div>

        <div className="mt-6">
          <ActivityPanels signals={signals} fills={fills} positions={positions} riskEvents={riskEvents} commands={commands} />
        </div>
      </main>
    </AuthGate>
  );
}
