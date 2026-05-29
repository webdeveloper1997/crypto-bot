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

function SectionShell({
  children,
  subtitle,
  title
}: {
  children: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="glass-panel rounded-[1.75rem] p-5 md:rounded-[2rem] md:p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-muted)]">{subtitle}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-white/65 px-4 py-6 text-sm text-[var(--color-muted)]">
      {message}
    </div>
  );
}

function InfoGrid({
  items
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-[1rem] bg-slate-50/90 px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">{item.label}</p>
          <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function ActivityPanels({ signals, fills, positions, riskEvents, commands }: ActivityPanelsProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionShell title="Prediction ledger" subtitle="Signals">
        {signals.length === 0 ? (
          <EmptyState message="No resolved signal records yet. Start the bot in paper mode and this panel will fill with calls, realized outcomes, and fee drag." />
        ) : (
          <div className="max-h-[34rem] space-y-4 overflow-y-auto pr-1">
            {signals.map((signal) => (
              <article key={signal.id} className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--color-ink)]">{signal.symbol}</p>
                    <p className="mt-1 text-sm capitalize text-[var(--color-muted)]">
                      {signal.predicted_direction} {signal.timeframe} • {formatTimestamp(signal.generated_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${
                      signal.hit == null
                        ? "bg-slate-100 text-slate-600"
                        : signal.hit
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {signal.hit == null ? "open" : signal.hit ? "hit" : "miss"}
                  </span>
                </div>
                <div className="mt-4">
                  <InfoGrid
                    items={[
                      { label: "Expected", value: formatSignedBps(signal.expected_move_bps) },
                      { label: "Actual", value: formatSignedBps(signal.realized_return_bps) },
                      { label: "Fees", value: formatUsd(signal.fee_quote ?? 0) },
                      { label: "Confidence", value: `${signal.confidence.toFixed(2)}` }
                    ]}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Fill tape" subtitle="Binance and paper fills">
        {fills.length === 0 ? (
          <EmptyState message="No fills yet. Once the worker executes a paper, testnet, or live order, every commission and price will be listed here." />
        ) : (
          <div className="max-h-[34rem] space-y-4 overflow-y-auto pr-1">
            {fills.map((fill) => (
              <article key={fill.id} className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--color-ink)]">{fill.symbol}</p>
                    <p className="mt-1 text-sm uppercase text-[var(--color-muted)]">
                      {fill.side} • {formatTimestamp(fill.executed_at)}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-700">
                    {formatUsd(fill.price)}
                  </span>
                </div>
                <div className="mt-4">
                  <InfoGrid
                    items={[
                      { label: "Quantity", value: formatNumber(fill.quantity, 6) },
                      { label: "Quote amount", value: formatUsd(fill.quote_amount) },
                      {
                        label: "Commission",
                        value: `${formatNumber(fill.commission_amount, 6)} ${fill.commission_asset ?? ""}`.trim()
                      }
                    ]}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Open exposure" subtitle="Positions">
        {positions.length === 0 ? (
          <EmptyState message="No open positions in the current mode. This section will show live exposure, entry price, and unrealized PnL once a position is opened." />
        ) : (
          <div className="max-h-[34rem] space-y-4 overflow-y-auto pr-1">
            {positions.map((position) => (
              <article key={position.id} className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--color-ink)]">{position.symbol}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {position.mode} mode • opened {formatTimestamp(position.opened_at)}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-amber-900">
                    {position.status}
                  </span>
                </div>
                <div className="mt-4">
                  <InfoGrid
                    items={[
                      { label: "Quantity", value: formatNumber(position.quantity, 6) },
                      { label: "Average entry", value: formatUsd(position.average_entry) },
                      { label: "Unrealized PnL", value: formatUsd(position.unrealized_pnl) },
                      { label: "Fees", value: formatUsd(position.fee_total) }
                    ]}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Risk and operator feed" subtitle="Events + commands">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] bg-white/70 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Risk events</p>
            <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
              {riskEvents.length === 0 ? (
                <EmptyState message="No risk events recorded yet." />
              ) : (
                riskEvents.map((event) => (
                  <div key={event.id} className="rounded-[1.25rem] border border-white/70 bg-white/80 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-[var(--color-ink)]">{event.message}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${
                          event.severity === "critical"
                            ? "bg-rose-100 text-rose-700"
                            : event.severity === "warning"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {event.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">{formatTimestamp(event.triggered_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-white/70 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Recent commands</p>
            <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
              {commands.length === 0 ? (
                <EmptyState message="No commands yet. Use the execution controls above to queue one." />
              ) : (
                commands.map((command) => (
                  <div key={command.id} className="rounded-[1.25rem] border border-white/70 bg-white/80 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium capitalize text-[var(--color-ink)]">{command.command_type.replaceAll("_", " ")}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${
                          command.status === "applied"
                            ? "bg-emerald-100 text-emerald-800"
                            : command.status === "failed"
                              ? "bg-rose-100 text-rose-700"
                              : command.status === "pending"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {command.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">{formatTimestamp(command.requested_at)}</p>
                    {command.error_message ? <p className="mt-2 text-sm text-rose-700">{command.error_message}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SectionShell>
    </div>
  );
}
