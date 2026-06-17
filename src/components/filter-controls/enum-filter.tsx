"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface EnumFilterProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}

export function EnumFilter({ label, options, value, onChange }: EnumFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  const clear = () => onChange([]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center justify-between w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm",
          value.length > 0 && "border-primary/50"
        )}
      >
        <span className={cn(value.length === 0 && "text-muted-foreground")}>
          {value.length > 0 ? `${label} (${value.length})` : label}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-56 rounded-md border bg-popover shadow-md">
          <div className="p-1 max-h-60 overflow-auto">
            {value.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            )}
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={cn(
                  "flex items-center w-full gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                  value.includes(opt) && "bg-accent"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border border-primary/30",
                    value.includes(opt) && "bg-primary border-primary"
                  )}
                >
                  {value.includes(opt) && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop to close */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
