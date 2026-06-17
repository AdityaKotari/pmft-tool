export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    const d = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
