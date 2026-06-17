"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Preset } from "@/lib/types";
import { PRESETS } from "@/lib/schema";

interface PresetSelectorProps {
  activeId: string;
  onChange: (preset: Preset) => void;
}

export function PresetSelector({ activeId, onChange }: PresetSelectorProps) {
  const [open, setOpen] = useState(false);

  const activePreset = PRESETS.find((p) => p.id === activeId);
  const displayName = activePreset
    ? activePreset.name
    : "Custom";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground/80"
      >
        {displayName}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 right-0 top-full mt-1 w-64 rounded-md border bg-popover shadow-md">
          <div className="p-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onChange(preset);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-start w-full gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent",
                  activeId === preset.id && "bg-accent"
                )}
              >
                <Check
                  className={cn(
                    "h-4 w-4 mt-0.5 shrink-0",
                    activeId === preset.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div>
                  <div className="text-sm font-medium">{preset.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {preset.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
