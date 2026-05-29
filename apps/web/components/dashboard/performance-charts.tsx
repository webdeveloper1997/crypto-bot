"use client";

import type { DailyMetric, EquitySnapshot } from "@crypto-bot/shared";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatUsd } from "@/lib/format";

type PerformanceChartsProps = {
  equitySnapshots: EquitySnapshot[];
  dailyMetrics: DailyMetric[];
};

export function PerformanceCharts({ equitySnapshots, dailyMetrics }: PerformanceChartsProps) {
  const equityData = equitySnapshots.map((item) => ({
    label: new Date(item.snapped_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    equity: item.total_equity,
    fees: item.fee_total
  }));

  const dailyData = dailyMetrics.map((item) => ({
    label: new Date(item.trading_day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    net: item.net_pnl,
    gross: item.gross_pnl
  }));
  const hasEquityData = equityData.length > 0;
  const hasDailyData = dailyData.length > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
      <section className="glass-panel rounded-[1.75rem] p-5 md:rounded-[2rem] md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-muted)]">Equity curve</p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">Total equity against fee drag</h2>
          </div>
        </div>
        {hasEquityData ? (
          <div className="mt-6 h-72 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="#fef3c7" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" />
                <YAxis stroke="#64748b" tickFormatter={(value) => formatUsd(value)} width={92} />
                <Tooltip formatter={(value: number) => formatUsd(value)} />
                <Area dataKey="equity" stroke="#b45309" fill="url(#equityFill)" strokeWidth={3} />
                <Line type="monotone" dataKey="fees" stroke="#334155" dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-6 rounded-[1.4rem] border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-sm text-[var(--color-muted)]">
            No equity history yet. Start the bot in paper mode and this chart will begin plotting total equity and fee drag.
          </div>
        )}
      </section>

      <section className="glass-panel rounded-[1.75rem] p-5 md:rounded-[2rem] md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-muted)]">Daily result</p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">Gross vs net after friction</h2>
        {hasDailyData ? (
          <div className="mt-6 h-72 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" />
                <YAxis stroke="#64748b" tickFormatter={(value) => formatUsd(value)} width={92} />
                <Tooltip formatter={(value: number) => formatUsd(value)} />
                <Line type="monotone" dataKey="gross" stroke="#0f766e" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="net" stroke="#b91c1c" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-6 rounded-[1.4rem] border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-sm text-[var(--color-muted)]">
            Daily PnL is still empty. Once a position closes, gross and net results will render here.
          </div>
        )}
      </section>
    </div>
  );
}
