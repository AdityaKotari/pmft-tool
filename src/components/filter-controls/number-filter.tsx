"use client";

import { Input } from "@/components/ui/input";

interface NumberFilterProps {
  label: string;
  min?: number;
  max?: number;
  onMinChange: (val: number | undefined) => void;
  onMaxChange: (val: number | undefined) => void;
}

export function NumberFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: NumberFilterProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-1">
        <Input
          className="h-9"
          type="number"
          placeholder="Min"
          value={min ?? ""}
          onChange={(e) =>
            onMinChange(e.target.value ? Number(e.target.value) : undefined)
          }
        />
        <Input
          className="h-9"
          type="number"
          placeholder="Max"
          value={max ?? ""}
          onChange={(e) =>
            onMaxChange(e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>
    </div>
  );
}
