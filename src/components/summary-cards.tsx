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
      <Card label="Total Raised" value={formatCurrency(summary.total_raised)} />
      <Card label="Avg Raise" value={formatCurrency(summary.avg_offering)} />
      <Card label="Operating Cos" value={summary.operating_companies.toLocaleString()} />
      <Card label="Total Filings" value={summary.total_filings.toLocaleString()} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
