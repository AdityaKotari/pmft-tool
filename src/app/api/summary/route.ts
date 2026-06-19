import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  try {
    const s = db.prepare(`SELECT
      COUNT(*) AS total_filings,
      COUNT(DISTINCT f.cik) AS unique_issuers,
      SUM(CASE WHEN o.is_likely_fund THEN 1 ELSE 0 END) AS likely_funds,
      SUM(CASE WHEN NOT o.is_likely_fund THEN 1 ELSE 0 END) AS operating_companies,
      ROUND(AVG(o.total_offering_amount), 0) AS avg_offering,
      ROUND(SUM(o.total_amount_sold), 0) AS total_raised,
      SUM(CASE WHEN f.form_type = 'D/A' THEN 1 ELSE 0 END) AS amendments,
      SUM(CASE WHEN f.form_type = 'D' THEN 1 ELSE 0 END) AS new_filings
    FROM filings f JOIN offerings o ON o.accession_number = f.accession_number
    WHERE f.parse_status = 'ok'`).get() as Record<string, number | null> | undefined;

    // Median raise (only operating companies with positive amounts)
    const median = db.prepare(`SELECT o.total_amount_sold
      FROM filings f JOIN offerings o ON o.accession_number = f.accession_number
      WHERE f.parse_status = 'ok' AND NOT o.is_likely_fund AND o.total_amount_sold > 0
      ORDER BY o.total_amount_sold`).all() as { total_amount_sold: number }[];

    let medianRaise = 0;
    if (median.length > 0) {
      const mid = Math.floor(median.length / 2);
      medianRaise = median.length % 2 === 0
        ? Math.round((median[mid - 1].total_amount_sold + median[mid].total_amount_sold) / 2)
        : Math.round(median[mid].total_amount_sold);
    }

    // Date range
    const range = db.prepare(
      "SELECT MIN(date_filed) as first, MAX(date_filed) as last FROM filings WHERE parse_status = 'ok'"
    ).get() as { first: string | null; last: string | null } | undefined;

    return NextResponse.json({
      total_filings: s?.total_filings ?? 0,
      unique_issuers: s?.unique_issuers ?? 0,
      likely_funds: s?.likely_funds ?? 0,
      operating_companies: s?.operating_companies ?? 0,
      avg_offering: s?.avg_offering ?? 0,
      total_raised: s?.total_raised ?? 0,
      median_raise: medianRaise,
      amendments: s?.amendments ?? 0,
      new_filings: s?.new_filings ?? 0,
      first_date: range?.first ?? null,
      last_date: range?.last ?? null,
    });
  } catch {
    return NextResponse.json({
      total_filings: 0, unique_issuers: 0, likely_funds: 0,
      operating_companies: 0, avg_offering: 0, total_raised: 0,
      median_raise: 0, amendments: 0, new_filings: 0,
      first_date: null, last_date: null,
    });
  }
}
