import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  try {
    const rows = db
      .prepare(
        `SELECT run_date, status, filings_seen, filings_stored
         FROM run_log ORDER BY run_date`
      )
      .all() as { run_date: string; status: string; filings_seen: number; filings_stored: number }[];

    const dates = rows.map((r) => ({
      date: r.run_date,
      status: r.status,
      filings_seen: r.filings_seen,
      filings_stored: r.filings_stored,
    }));

    const firstDate = dates.length > 0 ? dates[0].date : null;
    const lastDate = dates.length > 0 ? dates[dates.length - 1].date : null;
    const complete = new Set(dates.filter((d) => d.status === "complete").map((d) => d.date));

    const gaps: string[] = [];
    if (firstDate && lastDate) {
      const start = new Date(firstDate);
      const end = new Date(lastDate);
      const cur = new Date(start);
      while (cur <= end) {
        const ds = cur.toISOString().split("T")[0];
        if (!complete.has(ds)) gaps.push(ds);
        cur.setDate(cur.getDate() + 1);
      }
    }

    return NextResponse.json({
      total_dates: dates.length,
      complete_dates: dates.filter((d) => d.status === "complete").length,
      partial_dates: dates.filter((d) => d.status === "partial").length,
      total_filings: dates.reduce((sum, d) => sum + d.filings_stored, 0),
      first_date: firstDate,
      last_date: lastDate,
      dates,
      gaps,
    });
  } catch {
    return NextResponse.json({
      total_dates: 0, complete_dates: 0, partial_dates: 0,
      total_filings: 0, first_date: null, last_date: null,
      dates: [], gaps: [],
    });
  }
}
