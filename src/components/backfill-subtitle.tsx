"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDate } from "@/lib/format";
import type { SummaryResponse } from "@/lib/types";

export function BackfillSubtitle() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const fetchSummary = useCallback(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSummary();
    // Refresh numbers when a backfill completes.
    window.addEventListener("backfill-complete", fetchSummary);
    return () => window.removeEventListener("backfill-complete", fetchSummary);
  }, [fetchSummary]);

  if (!summary || summary.total_filings === 0) return null;

  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      Backfilled {summary.total_filings.toLocaleString()} SEC Form D/D-A filings
      across {summary.operating_companies.toLocaleString()} operating companies
      {summary.first_date && summary.last_date && (
        <> &middot; {formatDate(summary.first_date)} → {formatDate(summary.last_date)}</>
      )}
      {" · "}
      Contacts are officers/directors listed on Form D — not vetted fundraising contacts.
    </p>
  );
}
