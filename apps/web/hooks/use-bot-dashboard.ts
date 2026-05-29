"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  botCommandSchema,
  botSettingsSchema,
  dailyMetricSchema,
  equitySnapshotSchema,
  fillSchema,
  positionSchema,
  riskEventSchema,
  signalSchema,
  type BotCommandPayload,
  type BotCommandType
} from "@crypto-bot/shared";

import { getSupabaseBrowserClient } from "@/lib/supabase";

async function fetchSingle<TInput, TParsed>(
  query: PromiseLike<{ data: TInput; error: { message: string } | null }>,
  parser: (value: TInput) => TParsed
): Promise<TParsed> {
  const result = await query;
  if (result.error) {
    throw new Error(result.error.message);
  }

  return parser(result.data);
}

export function useBotDashboard(userId?: string) {
  const queryClient = useQueryClient();
  const client = getSupabaseBrowserClient();

  const enabled = Boolean(userId);

  const settingsQuery = useQuery({
    queryKey: ["bot-settings", userId],
    enabled,
    queryFn: () =>
      fetchSingle(
        client.from("bot_settings").select("*").eq("user_id", userId).maybeSingle(),
        (value) => (value ? botSettingsSchema.parse(value) : null)
      )
  });

  const equityQuery = useQuery({
    queryKey: ["equity-snapshots", userId],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client.from("equity_snapshots").select("*").eq("user_id", userId).order("snapped_at", { ascending: false }).limit(48),
        (value) => equitySnapshotSchema.array().parse(value).reverse()
      )
  });

  const metricsQuery = useQuery({
    queryKey: ["daily-metrics", userId],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client.from("daily_metrics").select("*").eq("user_id", userId).order("trading_day", { ascending: false }).limit(30),
        (value) => dailyMetricSchema.array().parse(value).reverse()
      )
  });

  const signalsQuery = useQuery({
    queryKey: ["signals", userId],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client.from("signals").select("*").eq("user_id", userId).order("generated_at", { ascending: false }).limit(15),
        (value) => signalSchema.array().parse(value)
      )
  });

  const fillsQuery = useQuery({
    queryKey: ["fills", userId],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client.from("fills").select("*").eq("user_id", userId).order("executed_at", { ascending: false }).limit(15),
        (value) => fillSchema.array().parse(value)
      )
  });

  const positionsQuery = useQuery({
    queryKey: ["positions", userId],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client.from("positions").select("*").eq("user_id", userId).eq("status", "open").order("opened_at", { ascending: false }),
        (value) => positionSchema.array().parse(value)
      )
  });

  const riskEventsQuery = useQuery({
    queryKey: ["risk-events", userId],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client.from("risk_events").select("*").eq("user_id", userId).order("triggered_at", { ascending: false }).limit(12),
        (value) => riskEventSchema.array().parse(value)
      )
  });

  const commandsQuery = useQuery({
    queryKey: ["bot-commands", userId],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client.from("bot_commands").select("*").eq("user_id", userId).order("requested_at", { ascending: false }).limit(12),
        (value) => botCommandSchema.array().parse(value)
      )
  });

  const enqueueCommand = useMutation({
    mutationFn: async (input: { commandType: BotCommandType; payload?: BotCommandPayload }) => {
      if (!userId) {
        throw new Error("Missing authenticated user.");
      }

      const payload = {
        user_id: userId,
        command_type: input.commandType,
        payload: input.payload ?? {}
      };

      const { error } = await client.from("bot_commands").insert(payload);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bot-commands", userId] }),
        queryClient.invalidateQueries({ queryKey: ["bot-settings", userId] })
      ]);
    }
  });

  const summary = useMemo(() => {
    const latestEquity = equityQuery.data?.at(-1) ?? null;
    const latestMetrics = metricsQuery.data?.at(-1) ?? null;
    const accuracy =
      latestMetrics && latestMetrics.predictions_total > 0
        ? (latestMetrics.predictions_hit / latestMetrics.predictions_total) * 100
        : 0;

    return {
      latestEquity,
      latestMetrics,
      accuracy
    };
  }, [equityQuery.data, metricsQuery.data]);

  return {
    settings: settingsQuery.data,
    equitySnapshots: equityQuery.data ?? [],
    dailyMetrics: metricsQuery.data ?? [],
    signals: signalsQuery.data ?? [],
    fills: fillsQuery.data ?? [],
    positions: positionsQuery.data ?? [],
    riskEvents: riskEventsQuery.data ?? [],
    commands: commandsQuery.data ?? [],
    isLoading:
      settingsQuery.isLoading ||
      equityQuery.isLoading ||
      metricsQuery.isLoading ||
      signalsQuery.isLoading ||
      fillsQuery.isLoading ||
      positionsQuery.isLoading ||
      riskEventsQuery.isLoading ||
      commandsQuery.isLoading,
    error:
      settingsQuery.error ??
      equityQuery.error ??
      metricsQuery.error ??
      signalsQuery.error ??
      fillsQuery.error ??
      positionsQuery.error ??
      riskEventsQuery.error ??
      commandsQuery.error,
    enqueueCommand,
    summary
  };
}
