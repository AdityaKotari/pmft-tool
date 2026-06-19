"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Loader2, RefreshCw, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CoverageDate {
  date: string;
  status: string;
  filings_seen: number;
  filings_stored: number;
}

interface CoverageResponse {
  total_dates: number;
  complete_dates: number;
  partial_dates: number;
  total_filings: number;
  first_date: string | null;
  last_date: string | null;
  dates: CoverageDate[];
  gaps: string[];
}

type PanelState = "closed" | "coverage" | "form" | "progress";

export function BackfillPanel() {
  const [panelState, setPanelState] = useState<PanelState>("closed");
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [progress, setProgress] = useState<{
    current_date?: string;
    filings_seen?: number;
    running_total?: number;
    dates_processed?: number;
  }>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const fetchCoverage = useCallback(async () => {
    try {
      const res = await fetch("/api/backfill/coverage");
      const data = await res.json();
      setCoverage(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (panelState === "coverage") fetchCoverage();
  }, [panelState, fetchCoverage]);

  const startBackfill = async () => {
    setPanelState("progress");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(err.error || "Failed to start backfill");
        setPanelState("form");
        setLoading(false);
        return;
      }

      const eventSource = new EventSource("/api/backfill/progress");
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "progress") {
          setProgress(data);
        }
        if (data.type === "complete") {
          eventSource.close();
          setLoading(false);
          fetchCoverage();
          setPanelState("coverage");
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        fetchCoverage();
        setPanelState("coverage");
        setLoading(false);
      };
    } catch (e) {
      setError(String(e));
      setPanelState("form");
      setLoading(false);
    }
  };

  const fillGaps = () => {
    if (!coverage || coverage.gaps.length === 0) return;
    setFromDate(coverage.gaps[0]);
    setToDate(coverage.gaps[coverage.gaps.length - 1]);
    setPanelState("form");
  };

  const pullToday = () => {
    setFromDate(today);
    setToDate(today);
    setPanelState("form");
  };

  const pullRecent = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setFromDate(d.toISOString().split("T")[0]);
    setToDate(today);
    setPanelState("form");
  };

  return (
    <>
      {/* Trigger button in header */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPanelState(panelState === "closed" ? "coverage" : "closed")}
      >
        <Calendar className="h-4 w-4" />
        Data
        {coverage && (
          <Badge variant="secondary" className="ml-1 text-[10px] px-1 h-4">
            {coverage.complete_dates}d
          </Badge>
        )}
      </Button>

      {/* Slide-out panel */}
      {panelState !== "closed" && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setPanelState("closed")}
          />
          <div className="fixed right-0 top-0 z-50 h-full w-96 max-w-[90vw] border-l bg-background shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold">Data Coverage</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPanelState("closed")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Coverage view */}
              {panelState === "coverage" && coverage && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Dates pulled" value={String(coverage.total_dates)} />
                    <Stat label="Complete" value={String(coverage.complete_dates)} />
                    <Stat label="Total filings" value={coverage.total_filings.toLocaleString()} />
                    <Stat
                      label="Gaps"
                      value={String(coverage.gaps.length)}
                      warn={coverage.gaps.length > 0}
                    />
                  </div>

                  {coverage.first_date && (
                    <div className="text-sm text-muted-foreground">
                      Range: {coverage.first_date} → {coverage.last_date}
                    </div>
                  )}

                  {/* Gap warning */}
                  {coverage.gaps.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        {coverage.gaps.length} date{coverage.gaps.length > 1 ? "s" : ""} missing
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {coverage.gaps.slice(0, 5).join(", ")}
                        {coverage.gaps.length > 5 && ` +${coverage.gaps.length - 5} more`}
                      </p>
                      <Button size="sm" onClick={fillGaps}>
                        Fill gaps
                      </Button>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Pull new data
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={pullToday}>
                        Today
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => pullRecent(7)}>
                        Last 7 days
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => pullRecent(30)}>
                        Last 30 days
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPanelState("form")}
                      >
                        Custom range
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Date list */}
                  {coverage.dates.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Date history
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {coverage.dates
                          .slice()
                          .reverse()
                          .map((d) => (
                            <div
                              key={d.date}
                              className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-muted/50"
                            >
                              <span>{d.date}</span>
                              <span className="flex items-center gap-2">
                                {d.filings_stored > 0 && (
                                  <span className="text-muted-foreground tabular-nums">
                                    {d.filings_stored} filings
                                  </span>
                                )}
                                <Badge
                                  variant={d.status === "complete" ? "secondary" : "warning"}
                                  className="text-[10px] px-1 py-0"
                                >
                                  {d.status}
                                </Badge>
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Backfill form */}
              {panelState === "form" && (
                <div className="space-y-4">
                  <div>
                    <button
                      type="button"
                      onClick={() => setPanelState("coverage")}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      ← Back
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">From</label>
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        max={toDate}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">To</label>
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        min={fromDate}
                        max={today}
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button
                    className="w-full"
                    onClick={startBackfill}
                    disabled={!fromDate || !toDate || fromDate > toDate}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Pull {fromDate} → {toDate}
                  </Button>
                </div>
              )}

              {/* Progress */}
              {panelState === "progress" && (
                <div className="space-y-4 py-8">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Pulling filings...</p>
                    {progress.current_date && (
                      <p className="text-xs text-muted-foreground">
                        Processing {progress.current_date}
                      </p>
                    )}
                    {progress.running_total !== undefined && (
                      <p className="text-lg font-semibold tabular-nums">
                        {progress.running_total.toLocaleString()} filings
                      </p>
                    )}
                    {progress.dates_processed !== undefined && progress.dates_processed > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {progress.dates_processed} date{progress.dates_processed !== 1 ? "s" : ""} processed
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          warn && "text-amber-600"
        )}
      >
        {value}
      </div>
    </div>
  );
}
