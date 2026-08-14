"""DuckDB views and summary queries over the SQLite DB.

M9: lead exports include a lead_tier column, default to tier A only.
M10: two-band ranking (priced / just-opened), freshness flags, column order fixed.
M11: company-level dedup by CIK, primary contact selection using relationship data.
"""

from __future__ import annotations

import csv
import datetime
from pathlib import Path
from typing import Any, Protocol

import duckdb

from fundscraper.filters import (
    LeadTier,
    _is_non_natural_recipient,
    classify_lead_tier,
)


class Enricher(Protocol):
    def enrich(self, row: dict[str, Any]) -> dict[str, Any]: ...
    def fieldnames(self) -> list[str]: ...


class NoOpEnricher:
    def enrich(self, row: dict[str, Any]) -> dict[str, Any]:
        return row

    def fieldnames(self) -> list[str]:
        return []


_SUMMARY_QUERY = """
SELECT
    COUNT(*) AS total_filings,
    COUNT(DISTINCT f.cik) AS unique_issuers,
    SUM(CASE WHEN o.is_likely_fund THEN 1 ELSE 0 END) AS pooled_funds,
    SUM(CASE WHEN NOT o.is_likely_fund THEN 1 ELSE 0 END) AS operating_companies,
    ROUND(AVG(o.total_offering_amount), 0) AS avg_offering,
    ROUND(SUM(o.total_amount_sold), 0) AS total_raised
FROM fundscraper.filings f
JOIN fundscraper.offerings o ON o.accession_number = f.accession_number
WHERE f.parse_status = 'ok'
"""

_RAISES_BY_INDUSTRY = """
SELECT
    o.industry_group,
    COUNT(*) AS count,
    ROUND(SUM(o.total_amount_sold), 0) AS total_raised,
    ROUND(AVG(o.total_offering_amount), 0) AS avg_offering
FROM fundscraper.filings f
JOIN fundscraper.offerings o ON o.accession_number = f.accession_number
WHERE f.parse_status = 'ok'
  AND NOT o.is_likely_fund
GROUP BY o.industry_group
ORDER BY count DESC
"""

_RAISES_BY_STATE = """
SELECT
    COALESCE(NULLIF(TRIM(rp.state), ''), 'Unknown') AS state,
    COUNT(DISTINCT f.accession_number) AS filings,
    COUNT(*) AS persons,
    ROUND(SUM(o.total_amount_sold), 0) AS total_raised
FROM fundscraper.filings f
JOIN fundscraper.offerings o ON o.accession_number = f.accession_number
JOIN fundscraper.related_persons rp ON rp.accession_number = f.accession_number
WHERE f.parse_status = 'ok'
  AND NOT o.is_likely_fund
GROUP BY state
ORDER BY filings DESC
"""

_LEAD_EXPORT_QUERY = """
SELECT
    f.accession_number,
    f.company_name,
    f.form_type,
    f.date_filed,
    o.industry_group,
    o.total_amount_sold,
    o.total_offering_amount,
    o.date_first_sale,
    o.jurisdiction,
    rp.name AS person_name,
    rp.city AS person_city,
    rp.state AS person_state
FROM fundscraper.filings f
JOIN fundscraper.offerings o ON o.accession_number = f.accession_number
JOIN fundscraper.related_persons rp ON rp.accession_number = f.accession_number
WHERE f.parse_status = 'ok'
  AND NOT o.is_likely_fund
ORDER BY f.date_filed DESC, f.company_name, rp.name
"""

_CIK_QUERY = """
SELECT
    f.accession_number,
    f.cik,
    f.company_name,
    f.form_type,
    f.date_filed,
    o.industry_group,
    o.total_amount_sold,
    o.total_offering_amount,
    o.date_first_sale,
    o.jurisdiction,
    o.is_amendment,
    o.is_likely_fund,
    rp.name AS person_name,
    rp.city AS person_city,
    rp.state AS person_state,
    rp.relationship AS person_relationship
FROM fundscraper.filings f
JOIN fundscraper.offerings o ON o.accession_number = f.accession_number
JOIN fundscraper.related_persons rp ON rp.accession_number = f.accession_number
WHERE f.parse_status = 'ok'
  AND NOT o.is_likely_fund
ORDER BY f.date_filed DESC, f.company_name, rp.name
"""


def connect(db_path: Path) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL sqlite_scanner; LOAD sqlite_scanner;")
    con.execute(f"ATTACH '{db_path}' AS fundscraper (TYPE SQLITE, READ_ONLY);")
    return con


def run_summary(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    result = con.execute(_SUMMARY_QUERY).fetchone()
    if result is None:
        return {}
    return dict(
        zip(
            [
                "total_filings",
                "unique_issuers",
                "pooled_funds",
                "operating_companies",
                "avg_offering",
                "total_raised",
            ],
            result,
            strict=True,
        )
    )


def raises_by_industry(con: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    rows = con.execute(_RAISES_BY_INDUSTRY).fetchall()
    cols = ["industry_group", "count", "total_raised", "avg_offering"]
    return [dict(zip(cols, row, strict=True)) for row in rows]


def raises_by_state(con: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    rows = con.execute(_RAISES_BY_STATE).fetchall()
    cols = ["state", "filings", "persons", "total_raised"]
    return [dict(zip(cols, row, strict=True)) for row in rows]


_STALE_DAYS = 365


def _freshness_flags(form_type: str, date_filed: str, date_first_sale: str | None) -> str:
    if form_type != "D/A":
        return "new"
    if date_first_sale:
        try:
            dfs = datetime.date.fromisoformat(str(date_first_sale))
            age = (datetime.date.today() - dfs).days
            if age > _STALE_DAYS:
                return "stale"
        except ValueError:
            pass
    return "amend"


def _rank_key(row: dict[str, Any]) -> tuple[int, float, str]:
    sold = row.get("total_amount_sold")
    sold_val = 0.0 if sold is None else float(sold)
    if sold_val <= 0:
        return (1, 0.0, str(row.get("date_filed", "")))
    return (0, -sold_val, str(row.get("company_name", "")))


def export_leads(
    con: duckdb.DuckDBPyConnection,
    output_path: Path,
    *,
    enricher: Enricher | None = None,
    tiers: set[LeadTier] | None = None,
) -> int:
    if enricher is None:
        enricher = NoOpEnricher()
    if tiers is None:
        tiers = {"A"}

    rows = con.execute(_LEAD_EXPORT_QUERY).fetchall()
    base_cols = [
        "accession_number",
        "company_name",
        "form_type",
        "date_filed",
        "industry_group",
        "total_amount_sold",
        "total_offering_amount",
        "date_first_sale",
        "jurisdiction",
        "person_name",
        "person_city",
        "person_state",
    ]

    export_rows: list[dict[str, Any]] = []
    for row in rows:
        d = dict(zip(base_cols, row, strict=True))
        tier = classify_lead_tier(str(d.get("industry_group") or ""))
        if tier not in tiers:
            continue
        d["lead_tier"] = tier
        d["freshness"] = _freshness_flags(
            str(d.get("form_type", "")),
            str(d.get("date_filed", "")),
            str(d.get("date_first_sale") or ""),
        )
        d = enricher.enrich(d)
        export_rows.append(d)

    export_rows.sort(key=_rank_key)

    fieldnames = base_cols + ["lead_tier", "freshness"] + enricher.fieldnames()

    written = 0
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for d in export_rows:
            writer.writerow(d)
            written += 1

    return written


def deduped_leads_json(
    con: duckdb.DuckDBPyConnection,
    *,
    tiers: set[LeadTier] | None = None,
) -> list[dict[str, Any]]:
    """Return deduped leads as a list of dicts suitable for JSON serialization.

    Reuses deduped_leads() internally and remaps fields to the fundraise-ui contract:
      company_name, cik, industry_group, lead_tier, total_amount_sold,
      total_offering_amount, state, date_filed, date_first_sale, form_type,
      is_amendment, primary_contact_name, primary_contact_relationship,
      contact_is_board_level
    """
    leads = deduped_leads(con, tiers=tiers)
    result: list[dict[str, Any]] = []
    for lead in leads:
        contact_type = str(lead.get("contact_type", ""))
        contact_rel = "Executive Officer"
        if contact_type == "director":
            contact_rel = "Director"
        elif contact_type == "executive_ceo":
            contact_rel = "Executive Officer"
        elif contact_type in ("contact", "entity", "none"):
            contact_rel = contact_type if contact_type != "none" else ""

        result.append(
            {
                "company_name": lead.get("company_name", ""),
                "cik": lead.get("cik", ""),
                "industry_group": lead.get("industry_group"),
                "lead_tier": lead.get("lead_tier", ""),
                "total_amount_sold": lead.get("total_amount_sold"),
                "total_offering_amount": lead.get("total_offering_amount"),
                "state": lead.get("contact_state"),
                "date_filed": str(lead.get("date_filed", "")) if lead.get("date_filed") else None,
                "date_first_sale": str(lead.get("date_first_sale", ""))
                if lead.get("date_first_sale")
                else None,
                "form_type": lead.get("form_type", ""),
                "is_amendment": bool(lead.get("is_amendment", False)),
                "primary_contact_name": lead.get("primary_contact", ""),
                "primary_contact_relationship": contact_rel,
                "contact_is_board_level": contact_type == "director",
            }
        )
    return result


def export_leads_parquet(
    con: duckdb.DuckDBPyConnection,
    output_path: Path,
) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY ({_LEAD_EXPORT_QUERY}) TO '{output_path}' (FORMAT PARQUET);")
    result = con.execute(f"SELECT COUNT(*) FROM ({_LEAD_EXPORT_QUERY}) AS t").fetchone()
    if result is None:
        return 0
    return int(result[0])


def tier_distribution(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    rows = con.execute(_LEAD_EXPORT_QUERY).fetchall()
    counts: dict[str, int] = {"A": 0, "B": 0, "C": 0, "excluded": 0}
    for row in rows:
        ig = str(row[4]) if row[4] else ""
        tier = classify_lead_tier(ig)
        counts[tier] += 1
    return counts


def ranked_lead_summary(
    con: duckdb.DuckDBPyConnection,
    *,
    tiers: set[LeadTier] | None = None,
    top_n: int = 20,
) -> dict[str, object]:
    if tiers is None:
        tiers = {"A"}
    rows = con.execute(_LEAD_EXPORT_QUERY).fetchall()
    base_cols = [
        "accession_number",
        "company_name",
        "form_type",
        "date_filed",
        "industry_group",
        "total_amount_sold",
        "total_offering_amount",
        "date_first_sale",
        "jurisdiction",
        "person_name",
        "person_city",
        "person_state",
    ]
    priced: list[dict[str, Any]] = []
    just_opened: list[dict[str, Any]] = []
    for row in rows:
        d = dict(zip(base_cols, row, strict=True))
        tier = classify_lead_tier(str(d.get("industry_group") or ""))
        if tier not in tiers:
            continue
        d["lead_tier"] = tier
        d["freshness"] = _freshness_flags(
            str(d.get("form_type", "")),
            str(d.get("date_filed", "")),
            str(d.get("date_first_sale") or ""),
        )
        sold = d.get("total_amount_sold")
        sold_val = float(sold) if sold is not None else 0.0
        if sold_val > 0:
            priced.append(d)
        else:
            just_opened.append(d)
    priced.sort(key=lambda d: -float(d.get("total_amount_sold", 0)))
    just_opened.sort(key=lambda d: str(d.get("date_filed", "")), reverse=True)
    return {
        "priced": priced[:top_n],
        "just_opened": just_opened[:top_n],
        "priced_total": len(priced),
        "just_opened_total": len(just_opened),
    }


# ---------------------------------------------------------------------------
# M11: Company-level dedup + primary contact selection
# ---------------------------------------------------------------------------


def _pick_primary_contact(
    related_persons: list[dict[str, Any]],
) -> dict[str, str]:
    """Pick the best human contact using relationship data from SEC XML.

    Ranking:
    1. Executive Officer whose clarification contains CEO/Founder/President/Chief.
    2. Executive Officer (any).
    3. Director-only (only if no execs exist) — flagged as board-level.
    4. First human (fallback).
    5. Entity (last resort).
    """
    humans = [
        p
        for p in related_persons
        if p.get("person_name") and not _is_non_natural_recipient(str(p["person_name"]))
    ]

    if not humans:
        if related_persons:
            p = related_persons[0]
            return {
                "name": str(p.get("person_name", "")),
                "city": str(p.get("person_city", "") or ""),
                "state": str(p.get("person_state", "") or ""),
                "contact_type": "entity",
            }
        return {"name": "", "city": "", "state": "", "contact_type": "none"}

    def _rel(p: dict[str, Any]) -> str:
        return str(p.get("person_relationship", "") or "").lower()

    # Exec officers with senior title in clarification
    ceo_keywords = ("ceo", "founder", "president", "chief")
    ceo_execs = [
        p
        for p in humans
        if "executive officer" in _rel(p) and any(k in _rel(p) for k in ceo_keywords)
    ]
    if ceo_execs:
        p = ceo_execs[0]
        return {
            "name": str(p.get("person_name", "")),
            "city": str(p.get("person_city", "") or ""),
            "state": str(p.get("person_state", "") or ""),
            "contact_type": "executive_ceo",
        }

    # Executive Officer + Director (CEO/founder pattern — both roles)
    exec_dirs = [p for p in humans if "executive officer" in _rel(p) and "director" in _rel(p)]
    if exec_dirs:
        p = exec_dirs[0]
        return {
            "name": str(p.get("person_name", "")),
            "city": str(p.get("person_city", "") or ""),
            "state": str(p.get("person_state", "") or ""),
            "contact_type": "executive",
        }

    # Any Executive Officer (exec-only, not also director)
    execs = [p for p in humans if "executive officer" in _rel(p)]
    if execs:
        p = execs[0]
        return {
            "name": str(p.get("person_name", "")),
            "city": str(p.get("person_city", "") or ""),
            "state": str(p.get("person_state", "") or ""),
            "contact_type": "executive",
        }

    # Director-only — flag it
    directors = [p for p in humans if "director" in _rel(p)]
    if directors:
        p = directors[0]
        return {
            "name": str(p.get("person_name", "")),
            "city": str(p.get("person_city", "") or ""),
            "state": str(p.get("person_state", "") or ""),
            "contact_type": "director",
        }

    # Fallback: first human
    p = humans[0]
    return {
        "name": str(p.get("person_name", "")),
        "city": str(p.get("person_city", "") or ""),
        "state": str(p.get("person_state", "") or ""),
        "contact_type": "contact",
    }


def deduped_leads(
    con: duckdb.DuckDBPyConnection,
    *,
    tiers: set[LeadTier] | None = None,
) -> list[dict[str, Any]]:
    """Return one row per company (dedup by CIK, latest filing), ranked."""
    if tiers is None:
        tiers = {"A"}

    rows = con.execute(_CIK_QUERY).fetchall()
    cik_cols = [
        "accession_number",
        "cik",
        "company_name",
        "form_type",
        "date_filed",
        "industry_group",
        "total_amount_sold",
        "total_offering_amount",
        "date_first_sale",
        "jurisdiction",
        "is_amendment",
        "is_likely_fund",
        "person_name",
        "person_city",
        "person_state",
        "person_relationship",
    ]

    companies: dict[str, dict[str, Any]] = {}

    for row in rows:
        d = dict(zip(cik_cols, row, strict=True))
        cik = str(d["cik"])
        tier = classify_lead_tier(str(d.get("industry_group") or ""))
        if tier not in tiers:
            continue

        if cik not in companies:
            companies[cik] = {
                "cik": cik,
                "company_name": d["company_name"],
                "industry_group": d["industry_group"],
                "lead_tier": tier,
                "form_type": d["form_type"],
                "date_filed": d["date_filed"],
                "total_amount_sold": d["total_amount_sold"],
                "total_offering_amount": d["total_offering_amount"],
                "date_first_sale": d["date_first_sale"],
                "jurisdiction": d["jurisdiction"],
                "is_amendment": bool(d.get("is_amendment", False)),
                "is_likely_fund": bool(d.get("is_likely_fund", False)),
                "persons": [],
            }

        companies[cik]["persons"].append(
            {
                "person_name": d["person_name"],
                "person_city": d["person_city"],
                "person_state": d["person_state"],
                "person_relationship": d.get("person_relationship") or "",
            }
        )

    result: list[dict[str, Any]] = []
    for _cik, co in companies.items():
        contact = _pick_primary_contact(co["persons"])
        co["primary_contact"] = contact["name"]
        co["contact_city"] = contact["city"]
        co["contact_state"] = contact["state"]
        co["contact_type"] = contact["contact_type"]
        co["all_persons"] = co["persons"]
        del co["persons"]
        result.append(co)

    def _dedup_sort_key(co: dict[str, Any]) -> tuple[int, float, str]:
        sold = co.get("total_amount_sold")
        sold_val = 0.0 if sold is None else float(sold)
        if sold_val > 0:
            return (0, -sold_val, str(co.get("company_name", "")))
        return (1, 0.0, str(co.get("date_filed", "")))

    result.sort(key=_dedup_sort_key)
    return result
