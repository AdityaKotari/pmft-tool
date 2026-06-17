"use client";

import { Input } from "@/components/ui/input";

interface DateFilterProps {
  label: string;
  from?: string;
  to?: string;
  onFromChange: (val: string | undefined) => void;
  onToChange: (val: string | undefined) => void;
}

export function DateFilter({
  label,
  from,
  to,
  onFromChange,
  onToChange,
}: DateFilterProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-1">
        <Input
          className="h-9"
          type="date"
          value={from ?? ""}
          onChange={(e) => onFromChange(e.target.value || undefined)}
        />
        <Input
          className="h-9"
          type="date"
          value={to ?? ""}
          onChange={(e) => onToChange(e.target.value || undefined)}
        />
      </div>
    </div>
  );
}
