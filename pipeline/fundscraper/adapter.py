"""Adapter: Form D obj() → dict matching the ORM models.

M11: relationship data now extracted from raw SEC XML since
edgartools 5.35.0's Person object doesn't expose it.
"""

from __future__ import annotations

import datetime
import json
import re
from typing import Any

from edgar import Filing as EdgarFiling
from edgar.offerings.formd import FormD


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    s = str(value).strip().replace(",", "").replace("$", "")
    if s.lower() in ("", "indefinite", "n/a", "none"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _safe_date(value: object) -> datetime.date | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return datetime.date.fromisoformat(s)
    except ValueError:
        return None


def _safe_int(value: object) -> int | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def _extract_relationships_from_xml(xml_str: str) -> dict[str, dict[str, str]]:
    """Parse relationship data from raw SEC XML.

    Returns {full_name: {relationship: str, clarification: str}}.
    """
    result: dict[str, dict[str, str]] = {}
    blocks = re.findall(r"<relatedPersonInfo>(.*?)</relatedPersonInfo>", xml_str, re.DOTALL)
    for block in blocks:
        fn = re.search(r"<firstName>(.*?)</firstName>", block)
        ln = re.search(r"<lastName>(.*?)</lastName>", block)
        if not fn or not ln:
            continue
        full_name = f"{fn.group(1).strip()} {ln.group(1).strip()}"

        rels = re.findall(r"<relationship>(.*?)</relationship>", block)
        clari = re.search(
            r"<relationshipClarification>(.*?)</relationshipClarification>",
            block,
            re.DOTALL,
        )
        relationship = "; ".join(r.strip() for r in rels if r.strip())
        clarification = clari.group(1).strip() if clari else ""

        result[full_name] = {
            "relationship": relationship,
            "clarification": clarification,
        }
    return result


def serialize_filing(edgar_filing: EdgarFiling) -> str:
    """Serialize an edgartools Filing to JSON for raw_json storage.

    Includes raw XML text so relationship data is preserved.
    """
    data: dict[str, Any] = {
        "accession_number": edgar_filing.accession_number,
        "cik": edgar_filing.cik,
        "company": edgar_filing.company,
        "form": edgar_filing.form,
        "filing_date": str(edgar_filing.filing_date),
    }
    try:
        obj = edgar_filing.obj()
        data["parsed"] = _formd_to_dict(obj)
        # Store raw XML for relationship extraction
        data["raw_xml"] = edgar_filing.xml()
    except Exception:
        pass
    return json.dumps(data, default=str)


def _formd_to_dict(fd: FormD) -> dict[str, Any]:
    return {
        "submission_type": fd.submission_type,
        "primary_issuer": {
            "entity_name": fd.primary_issuer.entity_name,
            "cik": fd.primary_issuer.cik,
            "entity_type": fd.primary_issuer.entity_type,
            "jurisdiction": fd.primary_issuer.jurisdiction,
            "year_of_incorporation": fd.primary_issuer.year_of_incorporation,
        },
        "offering_data": {
            "industry_group": fd.offering_data.industry_group.industry_group_type,
            "is_pooled_investment": fd.offering_data.is_pooled_investment,
            "date_of_first_sale": fd.offering_data.date_of_first_sale,
            "total_offering_amount": fd.offering_data.offering_sales_amounts.total_offering_amount,
            "total_amount_sold": fd.offering_data.offering_sales_amounts.total_amount_sold,
            "total_remaining": fd.offering_data.offering_sales_amounts.total_remaining,
            "minimum_investment": fd.offering_data.minimum_investment,
            "num_investors": fd.offering_data.investors.total_already_invested,
        },
        "related_persons": [
            {
                "first_name": rp.first_name,
                "last_name": rp.last_name,
                "city": rp.address.city,
                "state": rp.address.state_or_country,
            }
            for rp in fd.related_persons
        ],
    }


def filing_to_row(edgar_filing: EdgarFiling) -> dict[str, object]:
    return {
        "accession_number": edgar_filing.accession_number,
        "cik": str(edgar_filing.cik),
        "company_name": edgar_filing.company,
        "form_type": edgar_filing.form,
        "date_filed": edgar_filing.filing_date,
        "fetched_at": datetime.datetime.now(datetime.UTC),
        "raw_json": serialize_filing(edgar_filing),
        "parse_status": "ok",
    }


def formd_to_offering(accession_number: str, form_type: str, fd: FormD) -> dict[str, object]:
    od = fd.offering_data
    issuer = fd.primary_issuer
    return {
        "accession_number": accession_number,
        "issuer_name": issuer.entity_name,
        "entity_type": issuer.entity_type or None,
        "jurisdiction": issuer.jurisdiction or None,
        "year_of_incorporation": issuer.year_of_incorporation or None,
        "industry_group": od.industry_group.industry_group_type,
        "is_pooled_fund": od.is_pooled_investment or False,
        "total_offering_amount": _safe_float(od.offering_sales_amounts.total_offering_amount),
        "total_amount_sold": _safe_float(od.offering_sales_amounts.total_amount_sold),
        "total_remaining": _safe_float(od.offering_sales_amounts.total_remaining),
        "min_investment": _safe_float(od.minimum_investment),
        "num_investors": _safe_int(od.investors.total_already_invested),
        "date_first_sale": _safe_date(od.date_of_first_sale),
        "is_amendment": form_type == "D/A",
    }


def formd_to_related_persons(
    accession_number: str, fd: FormD, edgar_filing: EdgarFiling | None = None
) -> list[dict[str, object]]:
    """Map a parsed FormD to a list of `related_persons` row dicts.

    If *edgar_filing* is provided, extracts relationship data from raw XML.
    """
    # Extract relationships from raw XML if available
    rel_data: dict[str, dict[str, str]] = {}
    if edgar_filing is not None:
        try:
            xml_str = edgar_filing.xml()
            rel_data = _extract_relationships_from_xml(xml_str)
        except Exception:
            pass

    rows: list[dict[str, object]] = []
    for rp in fd.related_persons:
        full_name = f"{rp.first_name} {rp.last_name}".strip()
        rel_info = rel_data.get(full_name, {})
        rows.append(
            {
                "accession_number": accession_number,
                "name": full_name,
                "relationship": rel_info.get("relationship") or None,
                "city": rp.address.city or None,
                "state": rp.address.state_or_country or None,
            }
        )
    return rows


def formd_to_issuer(fd: FormD) -> dict[str, object]:
    pi = fd.primary_issuer
    return {
        "cik": pi.cik,
        "normalized_name": pi.entity_name,
    }
