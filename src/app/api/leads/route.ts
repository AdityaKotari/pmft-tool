import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildLeadQuery } from "@/lib/query-builder";
import type { FilterSpec } from "@/lib/types";

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = req.nextUrl;

  const filters: FilterSpec = {
    industry_groups: url.searchParams.getAll("industry_group").filter(Boolean),
    states: url.searchParams.getAll("state").filter(Boolean),
    jurisdictions: url.searchParams.getAll("jurisdiction").filter(Boolean),
    entity_types: url.searchParams.getAll("entity_type").filter(Boolean),
    form_types: url.searchParams.getAll("form_type").filter(Boolean),
    exclude_funds: url.searchParams.get("exclude_funds") !== "false",
    hide_board_contacts: url.searchParams.get("hide_board_contacts") === "true",
    amount_sold_min: url.searchParams.get("amount_sold_min")
      ? Number(url.searchParams.get("amount_sold_min"))
      : undefined,
    amount_sold_max: url.searchParams.get("amount_sold_max")
      ? Number(url.searchParams.get("amount_sold_max"))
      : undefined,
    offering_amount_min: url.searchParams.get("offering_amount_min")
      ? Number(url.searchParams.get("offering_amount_min"))
      : undefined,
    offering_amount_max: url.searchParams.get("offering_amount_max")
      ? Number(url.searchParams.get("offering_amount_max"))
      : undefined,
    date_filed_from: url.searchParams.get("date_filed_from") || undefined,
    date_filed_to: url.searchParams.get("date_filed_to") || undefined,
    date_first_sale_from: url.searchParams.get("date_first_sale_from") || undefined,
    date_first_sale_to: url.searchParams.get("date_first_sale_to") || undefined,
    search: url.searchParams.get("search") || undefined,
    sort_by: url.searchParams.get("sort_by") || "total_amount_sold",
    sort_dir:
      (url.searchParams.get("sort_dir") as "asc" | "desc") || "desc",
    page: Number(url.searchParams.get("page")) || 1,
    page_size: Number(url.searchParams.get("page_size")) || 50,
  };

  try {
    const { dataQuery, countQuery } = buildLeadQuery(filters);

    const countResult = db
      .prepare(countQuery.sql)
      .get(...countQuery.params) as { total: number } | undefined;
    const rows = db.prepare(dataQuery.sql).all(...dataQuery.params);

    return NextResponse.json({
      rows,
      total: countResult?.total ?? 0,
      page: filters.page,
      page_size: filters.page_size,
      total_pages: Math.ceil(
        (countResult?.total ?? 0) / (filters.page_size ?? 50)
      ),
    });
  } catch (err) {
    console.error("Leads query error:", err);
    return NextResponse.json(
      { error: "Failed to query leads" },
      { status: 500 }
    );
  }
}
