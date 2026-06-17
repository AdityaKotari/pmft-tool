import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const count = db
      .prepare("SELECT COUNT(*) as n FROM filings")
      .get() as { n: number } | undefined;
    const range = db
      .prepare("SELECT MIN(date_filed) as first, MAX(date_filed) as last FROM filings")
      .get() as { first: string | null; last: string | null } | undefined;

    return NextResponse.json({
      ready: (count?.n ?? 0) > 0,
      filings_count: count?.n ?? 0,
      date_range:
        range?.first && range?.last
          ? { first: range.first, last: range.last }
          : null,
    });
  } catch {
    return NextResponse.json({
      ready: false,
      filings_count: 0,
      date_range: null,
    });
  }
}
