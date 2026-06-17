"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface StepDateRangeProps {
  preset: "7" | "30" | "90" | "custom";
  from: string;
  to: string;
  onPresetChange: (v: "7" | "30" | "90" | "custom") => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onBack: () => void;
  onStart: () => void;
  error: string;
}

const presets: { value: "7" | "30" | "90"; label: string; desc: string }[] = [
  { value: "7", label: "Last 7 days", desc: "~500–1,000 filings" },
  { value: "30", label: "Last 30 days", desc: "~2,000–5,000 filings" },
  { value: "90", label: "Last 90 days", desc: "~6,000–15,000 filings" },
];

export function StepDateRange({
  preset,
  from,
  to,
  onPresetChange,
  onFromChange,
  onToChange,
  onBack,
  onStart,
  error,
}: StepDateRangeProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-bold tracking-tight">How far back?</h2>
        <p className="text-muted-foreground">
          Choose a date range for your initial data pull. You can run backfills
          again later — they&apos;re safe to re-run.
        </p>
      </div>

      <div className="space-y-2">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPresetChange(p.value)}
            className={cn(
              "w-full flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors",
              preset === p.value
                ? "border-primary bg-primary/5"
                : "hover:bg-accent"
            )}
          >
            <span className="font-medium">{p.label}</span>
            <span className="text-xs text-muted-foreground">{p.desc}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPresetChange("custom")}
          className={cn(
            "w-full flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors",
            preset === "custom"
              ? "border-primary bg-primary/5"
              : "hover:bg-accent"
          )}
        >
          <span className="font-medium">Custom range</span>
        </button>

        {preset === "custom" && (
          <div className="flex gap-2 pt-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onStart}>
          Start Backfill
        </Button>
      </div>
    </div>
  );
}
