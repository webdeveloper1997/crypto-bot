"use client";

import { useEffect, useMemo, useState } from "react";
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

type CommandFeedback = {
  commandId?: string;
  detail?: string;
  title: string;
  tone: "error" | "info" | "success";
};

function describeCommand(commandType: string, mode?: BotMode) {
  if (commandType === "switch_mode") {
    return {
      actionKey: "switch_mode",
      detail: mode ? `Requested mode change to ${mode}. The worker will validate flat positions before applying it.` : "Requested mode change.",
      success: mode ? `Execution mode switched to ${mode}.` : "Execution mode switched.",
      title: mode ? `Switch to ${mode}` : "Switch mode"
    };
  }

  if (commandType === "start_bot") {
    return {
      actionKey: "start_bot",
      detail: "The worker will mark the bot as running and begin processing the next cycle.",
      success: "The bot is marked running.",
      title: "Start bot"
    };
  }

  if (commandType === "stop_bot") {
    return {
      actionKey: "stop_bot",
      detail: "The worker will stop opening new work and the dashboard will reflect the paused state.",
      success: "The bot is marked stopped.",
      title: "Stop bot"
    };
  }

  return {
    actionKey: "flatten_all",
    detail: "The worker will attempt to close any open position in the active mode.",
    success: "Flatten request was applied.",
    title: "Flatten positions"
  };
}

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
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<CommandFeedback | null>(null);

  const pendingMode = commands.find((command) => command.command_type === "switch_mode" && command.status === "pending")?.payload
    ?.targetMode as BotMode | undefined;
  const latestCommandStatus = useMemo(
    () => (commandFeedback?.commandId ? commands.find((command) => command.id === commandFeedback.commandId) : null),
    [commandFeedback?.commandId, commands]
  );

  useEffect(() => {
    if (!latestCommandStatus || latestCommandStatus.status === "pending") {
      return;
    }

    const meta = describeCommand(
      latestCommandStatus.command_type,
      latestCommandStatus.payload?.targetMode as BotMode | undefined
    );

    if (latestCommandStatus.status === "applied") {
      setCommandFeedback({
        commandId: latestCommandStatus.id,
        detail: meta.success,
        title: `${meta.title} succeeded`,
        tone: "success"
      });
      setActiveAction(null);
      return;
    }

    if (latestCommandStatus.status === "failed") {
      setCommandFeedback({
        commandId: latestCommandStatus.id,
        detail: latestCommandStatus.error_message ?? "The worker rejected the command.",
        title: `${meta.title} failed`,
        tone: "error"
      });
      setActiveAction(null);
    }
  }, [latestCommandStatus]);

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
  }

  function queueCommand(commandType: "flatten_all" | "start_bot" | "stop_bot" | "switch_mode", mode?: BotMode) {
    const meta = describeCommand(commandType, mode);
    setActiveAction(commandType);
    setCommandFeedback({
      detail: meta.detail,
      title: `${meta.title} requested`,
      tone: "info"
    });

    enqueueCommand.mutate(
      commandType === "switch_mode"
        ? { commandType, payload: { targetMode: mode } }
        : { commandType },
      {
        onError: (mutationError) => {
          setActiveAction(null);
          setCommandFeedback({
            detail: (mutationError as Error).message,
            title: `${meta.title} failed`,
            tone: "error"
          });
        },
        onSuccess: (command) => {
          setCommandFeedback({
            commandId: command.id,
            detail: "Command stored in Supabase. Waiting for the Oracle worker to apply it.",
            title: `${meta.title} queued`,
            tone: "info"
          });
        }
      }
    );
  }

  return (
    <AuthGate>
      <main className="dashboard-shell">
        <section className="glass-panel rounded-[2rem] px-5 py-6 md:rounded-[2.75rem] md:px-10 md:py-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="mono text-xs uppercase tracking-[0.34em] text-[var(--color-muted)]">Oracle worker + Supabase control plane</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-[var(--color-ink)] md:text-5xl">
                Read the bot like an operator, not like a black box.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-[var(--color-muted)] md:text-base md:leading-8">
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
          <section className="mt-6 rounded-[1.5rem] border border-rose-300 bg-rose-50 px-5 py-4 text-rose-700 md:rounded-[2rem] md:px-6 md:py-5">
            {(error as Error).message}
          </section>
        ) : null}

        {isLoading ? (
          <section className="mt-6 rounded-[1.5rem] border border-white/70 bg-white/75 px-6 py-10 text-center text-[var(--color-muted)] md:rounded-[2rem] md:py-12">
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
            activeAction={activeAction}
            commandNotice={commandFeedback}
            onSwitchMode={(mode) => queueCommand("switch_mode", mode)}
            onStart={() => queueCommand("start_bot")}
            onStop={() => queueCommand("stop_bot")}
            onFlatten={() => queueCommand("flatten_all")}
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
