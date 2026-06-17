import type { FilterSpec } from "./types";

interface QueryResult {
  sql: string;
  params: unknown[];
}

interface BuiltQueries {
  dataQuery: QueryResult;
  countQuery: QueryResult;
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  company_name: "f.company_name",
  industry_group: "o.industry_group",
  total_amount_sold: "COALESCE(o.total_amount_sold, 0)",
  total_offering_amount: "COALESCE(o.total_offering_amount, 0)",
  state: "rp.state",
  date_filed: "f.date_filed",
  date_first_sale: "o.date_first_sale",
  form_type: "f.form_type",
  jurisdiction: "o.jurisdiction",
  entity_type: "o.entity_type",
  num_investors: "COALESCE(o.num_investors, 0)",
  min_investment: "COALESCE(o.min_investment, 0)",
  primary_contact_name: "rp.name",
  primary_contact_relationship: "rp.relationship",
  contact_city: "rp.city",
  contact_state: "rp.state",
  is_likely_fund: "o.is_likely_fund",
  is_amendment: "o.is_amendment",
  cik: "f.cik",
  contact_is_board_level: "CASE WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%director%' AND LOWER(COALESCE(rp.relationship, '')) NOT LIKE '%executive officer%' THEN 1 ELSE 0 END",
};

export function buildLeadQuery(f: FilterSpec): BuiltQueries {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const inClause = (col: string, vals: unknown[] | undefined) => {
    if (!vals || vals.length === 0) return;
    const ph = vals.map(() => "?").join(", ");
    conditions.push(`${col} IN (${ph})`);
    params.push(...vals);
  };

  const range = (col: string, min: number | undefined, max: number | undefined) => {
    if (min !== undefined) {
      conditions.push(`${col} >= ?`);
      params.push(min);
    }
    if (max !== undefined) {
      conditions.push(`${col} <= ?`);
      params.push(max);
    }
  };

  const dateRange = (col: string, from: string | undefined, to: string | undefined) => {
    if (from) {
      conditions.push(`${col} >= ?`);
      params.push(from);
    }
    if (to) {
      conditions.push(`${col} <= ?`);
      params.push(to);
    }
  };

  inClause("o.industry_group", f.industry_groups);
  inClause("rp.state", f.states);
  inClause("o.jurisdiction", f.jurisdictions);
  inClause("o.entity_type", f.entity_types);
  inClause("f.form_type", f.form_types);

  if (f.exclude_funds !== false) {
    conditions.push("o.is_likely_fund = ?");
    params.push(0);
  }

  if (f.hide_board_contacts) {
    conditions.push(
      "NOT (LOWER(COALESCE(rp.relationship, '')) LIKE '%director%' AND LOWER(COALESCE(rp.relationship, '')) NOT LIKE '%executive officer%')"
    );
  }

  range("o.total_amount_sold", f.amount_sold_min, f.amount_sold_max);
  range("o.total_offering_amount", f.offering_amount_min, f.offering_amount_max);
  range("o.num_investors", f.num_investors_min, f.num_investors_max);

  dateRange("f.date_filed", f.date_filed_from, f.date_filed_to);
  dateRange("o.date_first_sale", f.date_first_sale_from, f.date_first_sale_to);

  if (f.search?.trim()) {
    conditions.push(
      "(LOWER(f.company_name) LIKE ? OR LOWER(rp.name) LIKE ? OR LOWER(f.cik) LIKE ?)"
    );
    const q = `%${f.search.trim().toLowerCase()}%`;
    params.push(q, q, q);
  }

  conditions.push("f.parse_status = 'ok'");

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sortKey = f.sort_by ?? "total_amount_sold";
  const sortCol = ALLOWED_SORT_COLUMNS[sortKey] ?? "COALESCE(o.total_amount_sold, 0)";
  const sortDir = f.sort_dir === "asc" ? "ASC" : "DESC";
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, f.page_size ?? 50));
  const offset = (page - 1) * pageSize;

  const baseFrom = `
    FROM filings f
    JOIN offerings o ON o.accession_number = f.accession_number
    JOIN (
      SELECT
        rp.accession_number,
        rp.name,
        rp.relationship,
        rp.city,
        rp.state,
        ROW_NUMBER() OVER (
          PARTITION BY rp.accession_number
          ORDER BY
            CASE
              WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%executive officer%' THEN 0
              WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%director%' THEN 1
              WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%promoter%' THEN 2
              ELSE 3
            END,
            rp.name
        ) AS rn
      FROM related_persons rp
    ) rp ON rp.accession_number = f.accession_number AND rp.rn = 1
    ${where}
  `;

  const countQuery = {
    sql: `SELECT COUNT(*) as total ${baseFrom}`,
    params: [...params],
  };

  const dataQuery = {
    sql: `
      SELECT
        f.accession_number,
        f.cik,
        f.company_name,
        f.form_type,
        f.date_filed,
        o.industry_group,
        o.entity_type,
        o.jurisdiction,
        o.total_amount_sold,
        o.total_offering_amount,
        o.total_remaining,
        o.num_investors,
        o.min_investment,
        o.date_first_sale,
        o.is_amendment,
        o.is_likely_fund,
        rp.name AS primary_contact_name,
        rp.relationship AS primary_contact_relationship,
        rp.city AS contact_city,
        rp.state AS contact_state,
        CASE
          WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%executive officer%director%'
            OR LOWER(COALESCE(rp.relationship, '')) LIKE '%director%executive officer%'
            THEN 'executive'
          WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%executive officer%'
            THEN 'executive'
          WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%director%'
            THEN 'director'
          WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%promoter%'
            THEN 'promoter'
          ELSE 'other'
        END AS contact_type,
        CASE
          WHEN LOWER(COALESCE(rp.relationship, '')) LIKE '%director%'
            AND LOWER(COALESCE(rp.relationship, '')) NOT LIKE '%executive officer%'
            THEN 1 ELSE 0
        END AS contact_is_board_level
      ${baseFrom}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `,
    params: [...params, pageSize, offset],
  };

  return { dataQuery, countQuery };
}
