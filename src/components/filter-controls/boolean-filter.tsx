"use client";

interface BooleanFilterProps {
  label: string;
  value: boolean;
  onChange: (val: boolean) => void;
}

export function BooleanFilter({ label, value, onChange }: BooleanFilterProps) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        className="rounded border-border bg-transparent accent-primary cursor-pointer"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
