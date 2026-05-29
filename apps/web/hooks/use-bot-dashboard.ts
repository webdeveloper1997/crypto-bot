"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type BotCommand,
  type BotMode,
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
  parser: (value: TInput) => TParsed,
  label: string
): Promise<TParsed> {
  const result = await query;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
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
        (value) => (value ? botSettingsSchema.parse(value) : null),
        "bot_settings"
      )
  });

  const currentMode: BotMode = settingsQuery.data?.actual_mode ?? "paper";

  const equityQuery = useQuery({
    queryKey: ["equity-snapshots", userId, currentMode],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client
          .from("equity_snapshots")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", currentMode)
          .order("snapped_at", { ascending: false })
          .limit(48),
        (value) => equitySnapshotSchema.array().parse(value).reverse(),
        "equity_snapshots"
      )
  });

  const metricsQuery = useQuery({
    queryKey: ["daily-metrics", userId, currentMode],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client
          .from("daily_metrics")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", currentMode)
          .order("trading_day", { ascending: false })
          .limit(30),
        (value) => dailyMetricSchema.array().parse(value).reverse(),
        "daily_metrics"
      )
  });

  const signalsQuery = useQuery({
    queryKey: ["signals", userId, currentMode],
    enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      const scoped = await client
        .from("signals")
        .select("*")
        .eq("user_id", userId)
        .eq("mode", currentMode)
        .order("generated_at", { ascending: false })
        .limit(15);

      if (!scoped.error) {
        return signalSchema.array().parse(scoped.data ?? []);
      }

      const legacy = await client
        .from("signals")
        .select("*")
        .eq("user_id", userId)
        .order("generated_at", { ascending: false })
        .limit(15);

      if (legacy.error) {
        throw new Error(`signals: ${legacy.error.message}`);
      }

      return signalSchema.array().parse((legacy.data ?? []).map((row) => ({ mode: currentMode, ...row })));
    }
  });

  const fillsQuery = useQuery({
    queryKey: ["fills", userId, currentMode],
    enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      const scoped = await client
        .from("fills")
        .select("*")
        .eq("user_id", userId)
        .eq("mode", currentMode)
        .order("executed_at", { ascending: false })
        .limit(15);

      if (!scoped.error) {
        return fillSchema.array().parse(scoped.data ?? []);
      }

      const legacy = await client
        .from("fills")
        .select("id,user_id,order_id,symbol,side,executed_at,quantity,price,commission_asset,commission_amount,quote_amount,orders!inner(broker_mode)")
        .eq("user_id", userId)
        .eq("orders.broker_mode", currentMode)
        .order("executed_at", { ascending: false })
        .limit(15);

      if (legacy.error) {
        throw new Error(`fills: ${legacy.error.message}`);
      }

      const rows = (legacy.data ?? []).map((row) => {
        const { orders, ...fill } = row as Record<string, unknown> & { orders?: { broker_mode?: BotMode }[] | { broker_mode?: BotMode } };
        const brokerMode = Array.isArray(orders) ? orders[0]?.broker_mode : orders?.broker_mode;
        return { ...fill, mode: brokerMode ?? currentMode };
      });

      return fillSchema.array().parse(rows);
    }
  });

  const positionsQuery = useQuery({
    queryKey: ["positions", userId, currentMode],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client
          .from("positions")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", currentMode)
          .eq("status", "open")
          .order("opened_at", { ascending: false }),
        (value) => positionSchema.array().parse(value),
        "positions"
      )
  });

  const closedPositionsQuery = useQuery({
    queryKey: ["closed-positions", userId, currentMode],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client
          .from("positions")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", currentMode)
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(15),
        (value) => positionSchema.array().parse(value),
        "closed_positions"
      )
  });

  const riskEventsQuery = useQuery({
    queryKey: ["risk-events", userId, currentMode],
    enabled,
    refetchInterval: 15000,
    queryFn: () =>
      fetchSingle(
        client
          .from("risk_events")
          .select("*")
          .eq("user_id", userId)
          .eq("mode", currentMode)
          .order("triggered_at", { ascending: false })
          .limit(12),
        (value) => riskEventSchema.array().parse(value),
        "risk_events"
      )
  });

  const commandsQuery = useQuery({
    queryKey: ["bot-commands", userId],
    enabled,
    refetchInterval: 4000,
    queryFn: () =>
      fetchSingle(
        client.from("bot_commands").select("*").eq("user_id", userId).order("requested_at", { ascending: false }).limit(12),
        (value) => botCommandSchema.array().parse(value),
        "bot_commands"
      )
  });

  const enqueueCommand = useMutation({
    mutationFn: async (input: { commandType: BotCommandType; payload?: BotCommandPayload }): Promise<BotCommand> => {
      if (!userId) {
        throw new Error("Missing authenticated user.");
      }

      const payload = {
        user_id: userId,
        command_type: input.commandType,
        payload: input.payload ?? {}
      };

      const { data, error } = await client.from("bot_commands").insert(payload).select("*").single();

      if (error) {
        throw new Error(error.message);
      }

      return botCommandSchema.parse(data);
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
    closedPositions: closedPositionsQuery.data ?? [],
    riskEvents: riskEventsQuery.data ?? [],
    commands: commandsQuery.data ?? [],
    isLoading:
      settingsQuery.isLoading ||
      equityQuery.isLoading ||
      metricsQuery.isLoading ||
      signalsQuery.isLoading ||
      fillsQuery.isLoading ||
      positionsQuery.isLoading ||
      closedPositionsQuery.isLoading ||
      riskEventsQuery.isLoading ||
      commandsQuery.isLoading,
    error:
      settingsQuery.error ??
      equityQuery.error ??
      metricsQuery.error ??
      signalsQuery.error ??
      fillsQuery.error ??
      positionsQuery.error ??
      closedPositionsQuery.error ??
      riskEventsQuery.error ??
      commandsQuery.error,
    enqueueCommand,
    summary
  };
}
