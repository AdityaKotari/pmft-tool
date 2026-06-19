import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  try {
    const signals = db.prepare(`WITH paired AS (
      SELECT f.accession_number, f.cik, f.company_name, f.form_type, f.date_filed,
        o.total_amount_sold, o.total_offering_amount,
        LAG(o.total_amount_sold) OVER (PARTITION BY f.cik ORDER BY f.date_filed, f.form_type) AS prev_sold,
        LAG(o.total_offering_amount) OVER (PARTITION BY f.cik ORDER BY f.date_filed, f.form_type) AS prev_offering,
        LAG(f.form_type) OVER (PARTITION BY f.cik ORDER BY f.date_filed, f.form_type) AS prev_form
      FROM filings f JOIN offerings o ON o.accession_number = f.accession_number
      WHERE f.parse_status = 'ok'
    )
    SELECT accession_number, form_type, total_amount_sold, total_offering_amount,
      prev_sold, prev_offering,
      CASE WHEN form_type = 'D/A' AND prev_form = 'D' THEN 'amended'
           WHEN form_type = 'D' AND prev_form IS NULL THEN 'new'
           WHEN form_type = 'D/A' THEN 'amended' END AS signal,
      CASE WHEN form_type = 'D/A' AND total_amount_sold IS NOT NULL AND prev_sold IS NOT NULL AND total_amount_sold != prev_sold AND total_amount_sold > prev_sold THEN 'sold_increased'
           WHEN form_type = 'D/A' AND total_amount_sold IS NOT NULL AND prev_sold IS NOT NULL AND total_amount_sold != prev_sold AND total_amount_sold < prev_sold THEN 'sold_decreased'
           WHEN form_type = 'D/A' AND total_offering_amount IS NOT NULL AND prev_offering IS NOT NULL AND total_offering_amount != prev_offering THEN 'target_changed'
           ELSE NULL END AS change_type,
      CASE WHEN form_type = 'D/A' AND total_amount_sold IS NOT NULL AND prev_sold IS NOT NULL
           THEN ROUND(total_amount_sold - prev_sold, 0) END AS sold_delta,
      CASE WHEN form_type = 'D/A' AND total_offering_amount IS NOT NULL AND prev_offering IS NOT NULL
           THEN ROUND(total_offering_amount - prev_offering, 0) END AS offering_delta
    FROM paired WHERE signal IS NOT NULL ORDER BY date_filed DESC`
    ).all() as Record<string, unknown>[];
    return NextResponse.json({ signals });
  } catch (err) {
    console.error("amendments error:", err);
    return NextResponse.json({ signals: [] });
  }
}
