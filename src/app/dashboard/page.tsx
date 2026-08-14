"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { FilterPanel } from "@/components/filter-panel";
import { PresetSelector } from "@/components/preset-selector";
import { SummaryCards } from "@/components/summary-cards";
import { SignalBadge } from "@/components/signal-badge";
import { BackfillPanel } from "@/components/backfill-panel";
import { BackfillSubtitle } from "@/components/backfill-subtitle";
import { COLUMNS, PRESETS } from "@/lib/schema";
import type { ColumnSchema, FilterSpec, Preset, HealthResponse, SchemaResponse } from "@/lib/types";

// Read ?preset=<id> at module load so demo links can deep-link into a view.
const INITIAL_PRESET: Preset =
  typeof window === "undefined"
    ? PRESETS[0]
    : PRESETS.find((p) => p.id === new URLSearchParams(window.location.search).get("preset")) ??
      PRESETS[0];

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<ColumnSchema[]>(COLUMNS);
  const [activePresetId, setActivePresetId] = useState<string>(INITIAL_PRESET.id);
  const [filters, setFilters] = useState<FilterSpec>({ ...INITIAL_PRESET.filters } as FilterSpec);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(COLUMNS.filter((c) => c.default_visible).map((c) => c.key))
  );
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>(
    COLUMNS.find((c) => c.default_sort)?.key
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    COLUMNS.find((c) => c.default_sort)?.default_sort ?? "desc"
  );
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  const toggleDark = useCallback(() => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("fundraises-theme", next ? "dark" : "light");
    } catch {
      // localStorage unavailable — theme just won't persist
    }
  }, [dark]);

  // Check health
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => {
        if (!data.ready) {
          router.replace("/onboarding");
        } else {
          setReady(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  // Load schema (enum values populated from DB)
  useEffect(() => {
    if (!ready) return;
    fetch("/api/schema")
      .then((r) => r.json())
      .then((data: SchemaResponse) => setColumns(data.columns))
      .catch(() => {});
  }, [ready]);

  // Apply preset
  const handlePresetChange = useCallback(
    (preset: Preset) => {
      setActivePresetId(preset.id);
      setFilters({ ...preset.filters } as FilterSpec);
      setPage(1);
      // Keep the URL shareable so a demo link can point at a specific view.
      router.replace(`/dashboard?preset=${preset.id}`, { scroll: false });
    },
    [router]
  );

  // Mark preset as custom when user modifies filters
  const displayPresetId = useMemo(() => {
    const current = JSON.stringify({
      industry_groups: filters.industry_groups,
      exclude_funds: filters.exclude_funds,
    });
    const match = PRESETS.find(
      (p) => JSON.stringify(p.filters) === current
    );
    return match?.id ?? "custom";
  }, [filters]);

  const handleFilterChange = useCallback((newFilters: FilterSpec) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Private Market Fundraising Signals
              </h1>
              <div className="hidden sm:block">
                <BackfillSubtitle />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDark}
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <BackfillPanel />
            <PresetSelector
              activeId={displayPresetId}
              onChange={handlePresetChange}
            />
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-4 space-y-4">
        <SummaryCards />

        <FilterPanel
          columns={columns}
          filters={filters}
          onChange={handleFilterChange}
        />

        <DataTable
          columns={columns.filter((c) => visibleColumns.has(c.key))}
          filters={filters}
          page={page}
          sortBy={sortBy}
          sortDir={sortDir}
          onPageChange={setPage}
          onSortChange={(col, dir) => {
            setSortBy(col);
            setSortDir(dir);
            setPage(1); // new sort order, start from the first page
          }}
        />
      </main>
    </div>
  );
}
