"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface SignalRow {
  accession_number: string;
  form_type: string;
  total_amount_sold: number | null;
  total_offering_amount: number | null;
  prev_sold: number | null;
  prev_offering: number | null;
  signal: string;
  change_type: string | null;
  sold_delta: number | null;
  offering_delta: number | null;
}

const signalCache = new Map<string, SignalRow>();
// All badges on the page share one fetch instead of firing one per row.
let amendmentsPromise: Promise<void> | null = null;

function loadSignals(): Promise<void> {
  if (!amendmentsPromise) {
    amendmentsPromise = fetch("/api/amendments")
      .then((r) => r.json())
      .then((data) => {
        for (const s of data.signals as SignalRow[]) {
          signalCache.set(s.accession_number, s);
        }
      })
      .catch(() => {
        // Allow a retry on the next mount if this request failed.
        amendmentsPromise = null;
      });
  }
  return amendmentsPromise;
}

export function SignalBadge({ accessionNumber, formType }: { accessionNumber: string; formType: string }) {
  const [signal, setSignal] = useState<SignalRow | null>(signalCache.get(accessionNumber) ?? null);

  useEffect(() => {
    if (signal) return;

    loadSignals().then(() => {
      setSignal(signalCache.get(accessionNumber) ?? null);
    });
  }, [accessionNumber, signal]);

  if (!signal) {
    // Fallback: show form type badge
    if (formType === "D/A") {
      return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Amended</Badge>;
    }
    return null;
  }

  if (signal.signal === "new") {
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">New</Badge>;
  }

  if (signal.change_type === "sold_increased" && signal.sold_delta) {
    return <Badge variant="warning" className="text-[10px] px-1.5 py-0">Sold ↑ {fmtDelta(signal.sold_delta)}</Badge>;
  }

  if (signal.change_type === "sold_decreased" && signal.sold_delta) {
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Sold ↓ {fmtDelta(Math.abs(signal.sold_delta))}</Badge>;
  }

  if (signal.change_type === "target_changed" && signal.offering_delta) {
    const up = signal.offering_delta > 0;
    return <Badge variant="warning" className="text-[10px] px-1.5 py-0">Target {up ? "↑" : "↓"} {fmtDelta(Math.abs(signal.offering_delta))}</Badge>;
  }

  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Amended</Badge>;
}

function fmtDelta(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
