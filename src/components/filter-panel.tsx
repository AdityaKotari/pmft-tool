"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EnumFilter } from "@/components/filter-controls/enum-filter";
import { NumberFilter } from "@/components/filter-controls/number-filter";
import { DateFilter } from "@/components/filter-controls/date-filter";
import { BooleanFilter } from "@/components/filter-controls/boolean-filter";
import { TextFilter } from "@/components/filter-controls/text-filter";
import { cn } from "@/lib/utils";
import type { ColumnSchema, FilterSpec } from "@/lib/types";

interface FilterPanelProps {
  columns: ColumnSchema[];
  filters: FilterSpec;
  onChange: (f: FilterSpec) => void;
}

const FILTERABLE_ENUM_COLUMNS = new Set([
  "industry_group",
  "state",
  "jurisdiction",
  "entity_type",
  "form_type",
]);

const FILTERABLE_NUMBER_COLUMNS = new Set([
  "total_amount_sold",
  "total_offering_amount",
]);

const FILTERABLE_DATE_COLUMNS = new Set([
  "date_filed",
  "date_first_sale",
]);

export function FilterPanel({ columns, filters, onChange }: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const set = (patch: Partial<FilterSpec>) =>
    onChange({ ...filters, ...patch });

  const enumColumns = columns.filter(
    (c) => FILTERABLE_ENUM_COLUMNS.has(c.key) && c.values && c.values.length > 0
  );

  const activeCount = countActive(filters);

  return (
    <div className="space-y-2">
      {/* Primary row */}
      <div className="flex items-center gap-2 flex-wrap">
        <TextFilter
          placeholder="Search company or contact..."
          value={filters.search ?? ""}
          onChange={(v) => set({ search: v || undefined })}
        />

        <Button
          variant={expanded ? "secondary" : "outline"}
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 h-4 min-w-4">
              {activeCount}
            </Badge>
          )}
        </Button>

        <BooleanFilter
          label="Hide board contacts"
          value={filters.hide_board_contacts ?? false}
          onChange={(v) => set({ hide_board_contacts: v || undefined })}
        />

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                exclude_funds: filters.exclude_funds,
                sort_by: filters.sort_by,
                sort_dir: filters.sort_dir,
              })
            }
          >
            <X className="h-4 w-4" />
            Clear all
          </Button>
        )}
      </div>

      {/* Expandable row */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2 pt-1">
          {enumColumns.map((col) => (
            <EnumFilter
              key={col.key}
              label={col.label}
              options={col.values!}
              value={getEnumFilterValue(filters, col.key)}
              onChange={(v) => setEnumFilter(filters, col.key, v, set)}
            />
          ))}

          {columns
            .filter((c) => FILTERABLE_NUMBER_COLUMNS.has(c.key))
            .map((col) => {
              const minKey = `${col.key.replace("total_", "")}_min` as keyof FilterSpec;
              const maxKey = `${col.key.replace("total_", "")}_max` as keyof FilterSpec;
              return (
                <NumberFilter
                  key={col.key}
                  label={col.label}
                  min={(filters as Record<string, number | undefined>)[minKey]}
                  max={(filters as Record<string, number | undefined>)[maxKey]}
                  onMinChange={(v) => set({ [minKey]: v } as Partial<FilterSpec>)}
                  onMaxChange={(v) => set({ [maxKey]: v } as Partial<FilterSpec>)}
                />
              );
            })}

          {columns
            .filter((c) => FILTERABLE_DATE_COLUMNS.has(c.key))
            .map((col) => {
              const fromKey = `${col.key}_from` as keyof FilterSpec;
              const toKey = `${col.key}_to` as keyof FilterSpec;
              return (
                <DateFilter
                  key={col.key}
                  label={col.label}
                  from={(filters as Record<string, string | undefined>)[fromKey]}
                  to={(filters as Record<string, string | undefined>)[toKey]}
                  onFromChange={(v) => set({ [fromKey]: v } as Partial<FilterSpec>)}
                  onToChange={(v) => set({ [toKey]: v } as Partial<FilterSpec>)}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}

function getEnumFilterValue(f: FilterSpec, key: string): string[] {
  const map: Record<string, keyof FilterSpec> = {
    industry_group: "industry_groups",
    state: "states",
    jurisdiction: "jurisdictions",
    entity_type: "entity_types",
    form_type: "form_types",
  };
  const filterKey = map[key];
  if (!filterKey) return [];
  return (f[filterKey] as string[] | undefined) ?? [];
}

function setEnumFilter(
  f: FilterSpec,
  key: string,
  value: string[],
  set: (patch: Partial<FilterSpec>) => void
) {
  const map: Record<string, keyof FilterSpec> = {
    industry_group: "industry_groups",
    state: "states",
    jurisdiction: "jurisdictions",
    entity_type: "entity_types",
    form_type: "form_types",
  };
  const filterKey = map[key];
  if (!filterKey) return;
  set({ [filterKey]: value.length > 0 ? value : undefined } as Partial<FilterSpec>);
}

function countActive(f: FilterSpec): number {
  let n = 0;
  if (f.industry_groups?.length) n++;
  if (f.states?.length) n++;
  if (f.jurisdictions?.length) n++;
  if (f.entity_types?.length) n++;
  if (f.form_types?.length) n++;
  if (f.amount_sold_min !== undefined || f.amount_sold_max !== undefined) n++;
  if (f.date_filed_from || f.date_filed_to) n++;
  if (f.date_first_sale_from || f.date_first_sale_to) n++;
  if (f.hide_board_contacts) n++;
  if (f.search) n++;
  return n;
}
