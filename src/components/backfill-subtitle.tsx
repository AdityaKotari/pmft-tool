"use client";

import { useEffect, useState } from "react";
import type { SummaryResponse } from "@/lib/types";

export function BackfillSubtitle() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  if (!summary || summary.total_filings === 0) return null;

  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      Backfilled {summary.total_filings.toLocaleString()} SEC Form D/D-A filings
      across {summary.operating_companies.toLocaleString()} operating companies
      {summary.first_date && summary.last_date && (
        <> &middot; {summary.first_date} → {summary.last_date}</>
      )}
      {" · "}
      Contacts are officers/directors listed on Form D — not vetted fundraising contacts.
    </p>
  );
}
