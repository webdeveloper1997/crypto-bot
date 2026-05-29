type MetricCardProps = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn";
  caption?: string;
};

export function MetricCard({ label, value, tone = "default", caption }: MetricCardProps) {
  const toneClass =
    tone === "good"
      ? "border-emerald-300/60 bg-emerald-100/65"
      : tone === "warn"
        ? "border-amber-300/60 bg-amber-100/70"
        : "border-white/70 bg-white/70";

  return (
    <div className={`rounded-[1.75rem] border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur ${toneClass}`}>
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
      {caption ? <p className="mt-2 text-sm text-[var(--color-muted)]">{caption}</p> : null}
    </div>
  );
}

