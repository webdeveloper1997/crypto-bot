"use client";

import type { BotCommand, FillRecord, PositionRecord, RiskEvent, SignalRecord } from "@crypto-bot/shared";

import { formatNumber, formatSignedBps, formatTimestamp, formatUsd } from "@/lib/format";

type ActivityPanelsProps = {
  signals: SignalRecord[];
  fills: FillRecord[];
  positions: PositionRecord[];
  riskEvents: RiskEvent[];
  commands: BotCommand[];
};

function SectionTable({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-muted)]">{subtitle}</p>
      <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">{title}</h2>
      <div className="mt-5 overflow-x-auto">{children}</div>
    </section>
  );
}

export function ActivityPanels({ signals, fills, positions, riskEvents, commands }: ActivityPanelsProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionTable title="Prediction ledger" subtitle="Signals">
        <table className="min-w-full text-sm">
          <thead className="text-left text-[var(--color-muted)]">
            <tr>
              <th className="pb-3 pr-4">Pair</th>
              <th className="pb-3 pr-4">Call</th>
              <th className="pb-3 pr-4">Expected</th>
              <th className="pb-3 pr-4">Actual</th>
              <th className="pb-3 pr-4">Fees</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <tr key={signal.id} className="border-t border-slate-200/60">
                <td className="py-3 pr-4 font-medium text-[var(--color-ink)]">{signal.symbol}</td>
                <td className="py-3 pr-4 capitalize text-[var(--color-ink)]">{signal.predicted_direction}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatSignedBps(signal.expected_move_bps)}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatSignedBps(signal.realized_return_bps)}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatUsd(signal.fee_quote ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionTable>

      <SectionTable title="Fill tape" subtitle="Binance and paper fills">
        <table className="min-w-full text-sm">
          <thead className="text-left text-[var(--color-muted)]">
            <tr>
              <th className="pb-3 pr-4">Time</th>
              <th className="pb-3 pr-4">Pair</th>
              <th className="pb-3 pr-4">Side</th>
              <th className="pb-3 pr-4">Price</th>
              <th className="pb-3 pr-4">Commission</th>
            </tr>
          </thead>
          <tbody>
            {fills.map((fill) => (
              <tr key={fill.id} className="border-t border-slate-200/60">
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatTimestamp(fill.executed_at)}</td>
                <td className="py-3 pr-4 font-medium text-[var(--color-ink)]">{fill.symbol}</td>
                <td className="py-3 pr-4 uppercase text-[var(--color-ink)]">{fill.side}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatUsd(fill.price)}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">
                  {formatNumber(fill.commission_amount, 6)} {fill.commission_asset ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionTable>

      <SectionTable title="Open exposure" subtitle="Positions">
        <table className="min-w-full text-sm">
          <thead className="text-left text-[var(--color-muted)]">
            <tr>
              <th className="pb-3 pr-4">Pair</th>
              <th className="pb-3 pr-4">Qty</th>
              <th className="pb-3 pr-4">Entry</th>
              <th className="pb-3 pr-4">Unrealized</th>
              <th className="pb-3 pr-4">Fees</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr key={position.id} className="border-t border-slate-200/60">
                <td className="py-3 pr-4 font-medium text-[var(--color-ink)]">{position.symbol}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatNumber(position.quantity, 6)}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatUsd(position.average_entry)}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatUsd(position.unrealized_pnl)}</td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">{formatUsd(position.fee_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionTable>

      <SectionTable title="Risk and operator feed" subtitle="Events + commands">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] bg-white/70 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Risk events</p>
            <div className="mt-4 space-y-3">
              {riskEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/70 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-[var(--color-ink)]">{event.message}</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase text-slate-600">{event.severity}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">{formatTimestamp(event.triggered_at)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-white/70 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Recent commands</p>
            <div className="mt-4 space-y-3">
              {commands.map((command) => (
                <div key={command.id} className="rounded-2xl border border-white/70 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium capitalize text-[var(--color-ink)]">{command.command_type.replaceAll("_", " ")}</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase text-slate-600">{command.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">{formatTimestamp(command.requested_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionTable>
    </div>
  );
}

