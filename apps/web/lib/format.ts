const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2
});

export function formatUsd(value?: number | null): string {
  return currencyFormatter.format(value ?? 0);
}

export function formatPercentFromWhole(value?: number | null): string {
  return percentFormatter.format((value ?? 0) / 100);
}

export function formatSignedBps(value?: number | null): string {
  const basisPoints = value ?? 0;
  const prefix = basisPoints > 0 ? "+" : "";
  return `${prefix}${basisPoints.toFixed(0)} bps`;
}

export function formatNumber(value?: number | null, digits = 2): string {
  return (value ?? 0).toFixed(digits);
}

export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

