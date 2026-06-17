"use client";

import { Loader2 } from "lucide-react";

interface StepProgressProps {
  currentDate?: string;
  filingsSeen?: number;
  from: string;
  to: string;
}

export function StepProgress({
  currentDate,
  filingsSeen,
  from,
  to,
}: StepProgressProps) {
  const totalDays = (() => {
    const start = new Date(from);
    const end = new Date(to);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  })();

  const daysComplete = currentDate
    ? Math.ceil(
        (new Date(currentDate).getTime() - new Date(from).getTime()) / 86400000
      ) + 1
    : 0;

  const pct = Math.min(100, Math.round((daysComplete / totalDays) * 100));

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <h2 className="text-xl font-bold tracking-tight">
          Pulling SEC filings...
        </h2>
        <p className="text-muted-foreground">
          This may take a few minutes. You can close this tab — the backfill
          continues in the background.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>
            {daysComplete} of {totalDays} days
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {currentDate && (
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            Processing: <span className="font-medium text-foreground">{currentDate}</span>
          </p>
          {filingsSeen !== undefined && (
            <p className="text-sm text-muted-foreground">
              Filings found so far:{" "}
              <span className="font-medium text-foreground">{filingsSeen}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
