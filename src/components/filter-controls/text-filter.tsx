"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface TextFilterProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
}

export function TextFilter({ placeholder, value, onChange }: TextFilterProps) {
  return (
    <div className="relative flex-1 min-w-[200px] max-w-md">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
