import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  try {
    const summary = db
      .prepare(
        `SELECT
          COUNT(*) AS total_filings,
          COUNT(DISTINCT f.cik) AS unique_issuers,
          SUM(CASE WHEN o.is_likely_fund THEN 1 ELSE 0 END) AS likely_funds,
          SUM(CASE WHEN NOT o.is_likely_fund THEN 1 ELSE 0 END) AS operating_companies,
          ROUND(AVG(o.total_offering_amount), 0) AS avg_offering,
          ROUND(SUM(o.total_amount_sold), 0) AS total_raised
        FROM filings f
        JOIN offerings o ON o.accession_number = f.accession_number
        WHERE f.parse_status = 'ok'`
      )
      .get() as Record<string, number | null> | undefined;

    return NextResponse.json({
      total_filings: summary?.total_filings ?? 0,
      unique_issuers: summary?.unique_issuers ?? 0,
      likely_funds: summary?.likely_funds ?? 0,
      operating_companies: summary?.operating_companies ?? 0,
      avg_offering: summary?.avg_offering ?? 0,
      total_raised: summary?.total_raised ?? 0,
    });
  } catch {
    return NextResponse.json({
      total_filings: 0,
      unique_issuers: 0,
      likely_funds: 0,
      operating_companies: 0,
      avg_offering: 0,
      total_raised: 0,
    });
  }
}
