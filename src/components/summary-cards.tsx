"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { SummaryResponse } from "@/lib/types";

export function SummaryCards() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  if (!summary || summary.total_filings === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        label="Amount Sold Tracked"
        value={formatCurrency(summary.total_raised)}
        sub="Excludes pooled funds, REITs, and SPVs"
      />
      <Card
        label="Median Company Raise"
        value={formatCurrency(summary.median_raise)}
        sub={`Across ${summary.operating_companies.toLocaleString()} operating cos`}
      />
      <Card
        label="Filings Backfilled"
        value={summary.total_filings.toLocaleString()}
        sub={summary.first_date && summary.last_date
          ? `${summary.first_date} → ${summary.last_date}`
          : undefined}
      />
      <Card
        label="Amendments Tracked"
        value={summary.amendments.toLocaleString()}
        sub={`${summary.new_filings.toLocaleString()} new filings · latest used for totals`}
      />
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</div>
      )}
    </div>
  );
}
