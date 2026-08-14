"use client";

import { useEffect, useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignalBadge } from "@/components/signal-badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ColumnSchema, FilterSpec, LeadRow, LeadResponse } from "@/lib/types";

interface DataTableProps {
  columns: ColumnSchema[];
  filters: FilterSpec;
  page: number;
  sortBy?: string;
  sortDir: "asc" | "desc";
  onPageChange: (page: number) => void;
  onSortChange: (column: string, dir: "asc" | "desc") => void;
}

export function DataTable({
  columns: schemaColumns,
  filters,
  page,
  sortBy,
  sortDir,
  onPageChange,
  onSortChange,
}: DataTableProps) {
  const [data, setData] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const pageSize = filters.page_size ?? 50;
  const totalPages = Math.ceil(total / pageSize);

  // Refetch when a backfill completes so new filings appear without a reload.
  useEffect(() => {
    const onBackfillComplete = () => setRetryKey((k) => k + 1);
    window.addEventListener("backfill-complete", onBackfillComplete);
    return () => window.removeEventListener("backfill-complete", onBackfillComplete);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Abort in-flight requests when deps change so stale responses can't win a race.
    const controller = new AbortController();

    const params = new URLSearchParams();
    if (filters.industry_groups?.length)
      filters.industry_groups.forEach((v) => params.append("industry_group", v));
    if (filters.states?.length)
      filters.states.forEach((v) => params.append("state", v));
    if (filters.jurisdictions?.length)
      filters.jurisdictions.forEach((v) => params.append("jurisdiction", v));
    if (filters.entity_types?.length)
      filters.entity_types.forEach((v) => params.append("entity_type", v));
    if (filters.form_types?.length)
      filters.form_types.forEach((v) => params.append("form_type", v));
    if (filters.exclude_funds !== undefined)
      params.set("exclude_funds", String(filters.exclude_funds));
    if (filters.hide_board_contacts)
      params.set("hide_board_contacts", "true");
    if (filters.amount_sold_min !== undefined)
      params.set("amount_sold_min", String(filters.amount_sold_min));
    if (filters.amount_sold_max !== undefined)
      params.set("amount_sold_max", String(filters.amount_sold_max));
    if (filters.date_filed_from)
      params.set("date_filed_from", filters.date_filed_from);
    if (filters.date_filed_to)
      params.set("date_filed_to", filters.date_filed_to);
    if (filters.date_first_sale_from)
      params.set("date_first_sale_from", filters.date_first_sale_from);
    if (filters.date_first_sale_to)
      params.set("date_first_sale_to", filters.date_first_sale_to);
    if (filters.search)
      params.set("search", filters.search);
    params.set("sort_by", sortBy ?? "total_amount_sold");
    params.set("sort_dir", sortDir);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));

    fetch(`/api/leads?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((res: LeadResponse) => {
        setData(res.rows);
        setTotal(res.total);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return; // superseded by a newer request
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [filters, page, sortBy, sortDir, pageSize, retryKey]);

  const tableColumns = useMemo<ColumnDef<LeadRow>[]>(
    () =>
      schemaColumns.map((col): ColumnDef<LeadRow> => {
        if (col.key === "company_name") {
          return {
            accessorKey: col.key,
            header: col.sortable
              ? () => (
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </span>
                )
              : col.label,
            cell: ({ row }) => {
              const acc = row.original.accession_number as string;
              const ft = row.original.form_type as string;
              return (
                <div className="flex items-center gap-1.5 max-w-[260px]">
                  <span className="font-medium text-sm truncate">{String(row.original.company_name)}</span>
                  {acc && ft && <SignalBadge accessionNumber={acc} formType={ft} />}
                </div>
              );
            },
            enableSorting: col.sortable,
            sortUndefined: "last",
          };
        }
        return {
          accessorKey: col.key,
          header: col.sortable
            ? () => (
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                </span>
              )
            : col.label,
          cell: ({ getValue }) => {
            const value = getValue();
            return <CellRenderer value={value} column={col} />;
          },
          enableSorting: col.sortable,
          sortUndefined: "last",
        };
      }),
    [schemaColumns]
  );

  const [sorting, setSorting] = useState<SortingState>(
    sortBy ? [{ id: sortBy, desc: sortDir === "desc" }] : []
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      if (newSorting.length > 0) {
        onSortChange(newSorting[0].id, newSorting[0].desc ? "desc" : "asc");
      }
    },
    state: { sorting },
    manualSorting: true,
    sortDescFirst: true,
    enableSortingRemoval: false,
  });

  if (error) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-destructive space-y-2">
        <p>Failed to load leads: {error}</p>
        <Button variant="outline" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {loading
          ? "Loading..."
          : total === 0
            ? "No leads match your filters."
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}
      </div>

      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-3 py-2 text-left text-xs font-medium text-muted-foreground select-none whitespace-nowrap",
                      header.column.getCanSort() && "cursor-pointer hover:text-foreground"
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ChevronUp className="h-3 w-3" />,
                        desc: <ChevronDown className="h-3 w-3" />,
                      }[header.column.getIsSorted() as string] ?? null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={schemaColumns.length} className="px-3 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={schemaColumns.length} className="px-3 py-8 text-center text-muted-foreground">
                  No leads match your filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b hover:bg-muted/50 transition-colors",
                    !!row.original.contact_is_board_level && "opacity-75"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CellRenderer({ value, column }: { value: unknown; column: ColumnSchema }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">—</span>;
  }

  if (column.format === "currency" && typeof value === "number") {
    return <span className="tabular-nums">{formatCurrency(value)}</span>;
  }

  if (column.format === "date" || column.type === "date") {
    return <span className="tabular-nums">{formatDate(String(value))}</span>;
  }

  if (column.key === "form_type") {
    const vt = String(value);
    return (
      <Badge
        variant={vt === "D/A" ? "secondary" : "outline"}
        className={
          vt === "D/A"
            ? "text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
            : "text-[10px] px-1.5 py-0"
        }
      >
        Form {vt}
      </Badge>
    );
  }

  if (column.key === "contact_is_board_level" && value) {
    return <Badge variant="warning" className="text-[10px] px-1.5 py-0">Board</Badge>;
  }

  if (column.key === "is_likely_fund" && value) {
    return <Badge variant="warning" className="text-[10px] px-1.5 py-0">Fund</Badge>;
  }

  if (column.key === "is_amendment" && value) {
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Amend</Badge>;
  }

  return <span>{String(value)}</span>;
}
