import { z } from "zod";

const isoDatetimeSchema = z.string().datetime({ offset: true });

export const BOT_MODES = ["paper", "testnet", "live"] as const;
export const BOT_COMMAND_TYPES = ["switch_mode", "start_bot", "stop_bot", "flatten_all", "reconcile"] as const;
export const SIGNAL_DIRECTIONS = ["buy", "sell", "hold"] as const;
export const RISK_SEVERITIES = ["info", "warning", "critical"] as const;

export type BotMode = (typeof BOT_MODES)[number];
export type BotCommandType = (typeof BOT_COMMAND_TYPES)[number];
export type SignalDirection = (typeof SIGNAL_DIRECTIONS)[number];
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const botCommandPayloadSchema = z.object({
  targetMode: z.enum(BOT_MODES).optional(),
  symbol: z.string().optional(),
  symbols: z.array(z.string()).optional(),
  reason: z.string().max(280).optional()
});

export const botCommandSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  command_type: z.enum(BOT_COMMAND_TYPES),
  status: z.enum(["pending", "applied", "failed", "cancelled"]).default("pending"),
  payload: botCommandPayloadSchema.default({}),
  requested_at: isoDatetimeSchema.optional(),
  processed_at: isoDatetimeSchema.nullable().optional(),
  error_message: z.string().nullable().optional()
});

export const botSettingsSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  display_name: z.string(),
  desired_mode: z.enum(BOT_MODES),
  actual_mode: z.enum(BOT_MODES),
  is_running: z.boolean(),
  symbols: z.array(z.string()),
  timeframe: z.string(),
  decision_interval_minutes: z.number().int().positive(),
  paper_starting_balance: z.number().positive(),
  live_starting_balance: z.number().positive(),
  paper_trade_notional: z.number().positive(),
  live_trade_notional: z.number().positive(),
  max_concurrent_positions: z.number().int().positive(),
  max_symbol_allocation_pct: z.number().positive(),
  max_total_exposure_pct: z.number().positive(),
  daily_drawdown_limit_pct: z.number().positive(),
  weekly_drawdown_limit_pct: z.number().positive(),
  strategy_version: z.string()
});

export const equitySnapshotSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  mode: z.enum(BOT_MODES),
  snapped_at: isoDatetimeSchema,
  cash_balance: z.number(),
  invested_balance: z.number(),
  total_equity: z.number(),
  realized_pnl: z.number(),
  unrealized_pnl: z.number(),
  fee_total: z.number(),
  drawdown_pct: z.number()
});

export const dailyMetricSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  mode: z.enum(BOT_MODES),
  trading_day: z.string(),
  gross_pnl: z.number(),
  net_pnl: z.number(),
  fee_total: z.number(),
  slippage_total: z.number(),
  win_rate: z.number(),
  trades_count: z.number().int(),
  predictions_hit: z.number().int(),
  predictions_total: z.number().int()
});

export const signalSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  mode: z.enum(BOT_MODES).optional(),
  symbol: z.string(),
  timeframe: z.string(),
  generated_at: isoDatetimeSchema,
  predicted_direction: z.enum(SIGNAL_DIRECTIONS),
  confidence: z.number(),
  expected_move_bps: z.number(),
  score: z.number(),
  regime: z.string().nullable().optional(),
  rationale: z.string().nullable().optional(),
  strategy_version: z.string(),
  realized_return_bps: z.number().nullable().optional(),
  mae_bps: z.number().nullable().optional(),
  mfe_bps: z.number().nullable().optional(),
  fee_quote: z.number().nullable().optional(),
  slippage_bps: z.number().nullable().optional(),
  hit: z.boolean().nullable().optional()
});

export const fillSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  order_id: z.string().uuid(),
  mode: z.enum(BOT_MODES).optional(),
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  executed_at: isoDatetimeSchema,
  quantity: z.number(),
  price: z.number(),
  commission_asset: z.string().nullable().optional(),
  commission_amount: z.number(),
  quote_amount: z.number()
});

export const positionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  symbol: z.string(),
  mode: z.enum(BOT_MODES),
  status: z.enum(["open", "closed"]),
  quantity: z.number(),
  average_entry: z.number(),
  unrealized_pnl: z.number(),
  realized_pnl: z.number(),
  fee_total: z.number(),
  opened_at: isoDatetimeSchema,
  closed_at: isoDatetimeSchema.nullable().optional(),
  updated_at: isoDatetimeSchema
});

export const riskEventSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  event_type: z.string(),
  severity: z.enum(RISK_SEVERITIES),
  mode: z.enum(BOT_MODES),
  symbol: z.string().nullable().optional(),
  message: z.string(),
  details: z.record(z.unknown()).nullable().optional(),
  triggered_at: isoDatetimeSchema,
  resolved_at: isoDatetimeSchema.nullable().optional()
});

export type BotCommandPayload = z.infer<typeof botCommandPayloadSchema>;
export type BotCommand = z.infer<typeof botCommandSchema>;
export type BotSettings = z.infer<typeof botSettingsSchema>;
export type EquitySnapshot = z.infer<typeof equitySnapshotSchema>;
export type DailyMetric = z.infer<typeof dailyMetricSchema>;
export type SignalRecord = z.infer<typeof signalSchema>;
export type FillRecord = z.infer<typeof fillSchema>;
export type PositionRecord = z.infer<typeof positionSchema>;
export type RiskEvent = z.infer<typeof riskEventSchema>;
