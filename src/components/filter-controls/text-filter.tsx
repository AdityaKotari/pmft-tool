"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface TextFilterProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  debounceMs?: number;
}

// Debounced text input so typing doesn't fire a server query per keystroke.
export function TextFilter({ placeholder, value, onChange, debounceMs = 300 }: TextFilterProps) {
  const [local, setLocal] = useState(value);

  // Keep local state in sync when the value is reset externally (e.g. Clear all).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [local, value, onChange, debounceMs]);

  return (
    <div className="relative flex-1 min-w-[200px] max-w-md">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8"
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
}
