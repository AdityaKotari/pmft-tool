"""Unit tests for the Form D adapter — uses recorded fixtures, no network."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

from fundscraper.adapter import (
    filing_to_row,
    formd_to_issuer,
    formd_to_offering,
    formd_to_related_persons,
    serialize_filing,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _load(label: str) -> Any:
    return json.loads((FIXTURE_DIR / f"formd_{label}.json").read_text())


def _mock_edgar_filing(fixture: dict[str, Any]) -> MagicMock:
    """Build a mock edgartools Filing from fixture data."""
    filing = MagicMock()
    filing.configure_mock(
        accession_number=fixture["accession_number"],
        cik=fixture["cik"],
        company=fixture["company"],
        form=fixture["form"],
        filing_date=fixture.get("filing_date"),
    )
    return filing


def _mock_formd(fixture: dict[str, Any]) -> MagicMock:
    """Build a mock FormD object from fixture data."""
    fd = MagicMock()
    fd.submission_type = fixture["submission_type"]

    issuer = MagicMock()
    pi: dict[str, Any] = fixture["primary_issuer"]
    issuer.entity_name = pi["entity_name"]
    issuer.cik = pi["cik"]
    issuer.entity_type = pi["entity_type"]
    issuer.jurisdiction = pi["jurisdiction"]
    issuer.year_of_incorporation = pi["year_of_incorporation"]
    fd.primary_issuer = issuer

    od = MagicMock()
    od_data: dict[str, Any] = fixture["offering_data"]
    od.industry_group = MagicMock()
    od.industry_group.industry_group_type = od_data["industry_group_type"]
    od.is_pooled_investment = od_data["is_pooled_investment"]
    od.date_of_first_sale = od_data["date_of_first_sale"]
    od.minimum_investment = od_data["minimum_investment"]
    od.offering_sales_amounts = MagicMock()
    od.offering_sales_amounts.total_offering_amount = od_data["total_offering_amount"]
    od.offering_sales_amounts.total_amount_sold = od_data["total_amount_sold"]
    od.offering_sales_amounts.total_remaining = od_data["total_remaining"]
    od.investors = MagicMock()
    od.investors.total_already_invested = od_data["total_already_invested"]
    fd.offering_data = od

    rps = []
    for rp_data in fixture.get("related_persons", []):
        rp = MagicMock()
        rp.first_name = rp_data["first_name"]
        rp.last_name = rp_data["last_name"]
        rp.address = MagicMock()
        rp.address.city = rp_data.get("city", "")
        rp.address.state_or_country = rp_data.get("state", "")
        rps.append(rp)
    fd.related_persons = rps

    return fd


class TestOperatingCompany:
    """Tests using the operating-company (non-pooled) fixture."""

    @staticmethod
    def load() -> Any:
        return _load("opco")

    def test_filing_to_row(self) -> None:
        fixture = self.load()
        mock_filing = _mock_edgar_filing(fixture)
        row = filing_to_row(mock_filing)
        assert row["accession_number"] == fixture["accession_number"]
        assert row["cik"] == fixture["cik"]
        assert row["company_name"] == fixture["company"]
        assert row["form_type"] == "D"
        assert row["parse_status"] == "ok"
        assert row["raw_json"] is not None

    def test_offering_not_pooled(self) -> None:
        fixture = self.load()
        fd = _mock_formd(fixture)
        row = formd_to_offering(fixture["accession_number"], fixture["form"], fd)
        assert row["is_pooled_fund"] is False
        assert row["is_amendment"] is False
        assert row["issuer_name"] == "555 Cypress Lake LP"
        assert row["industry_group"] == "Residential"
        assert row["total_offering_amount"] == 3_000_000
        assert row["total_amount_sold"] == 230_958
        assert row["min_investment"] == 10_000
        assert row["num_investors"] == 12
        assert row["jurisdiction"] == "TEXAS"

    def test_related_persons(self) -> None:
        fixture = self.load()
        fd = _mock_formd(fixture)
        rows = formd_to_related_persons(fixture["accession_number"], fd)
        assert len(rows) == 3
        assert rows[0]["name"] == "Ajai Sharma"
        assert rows[0]["city"] == "Kingwood"
        assert rows[0]["state"] == "TX"
        assert rows[0]["relationship"] is None  # not in edgartools model

    def test_issuer(self) -> None:
        fixture = self.load()
        fd = _mock_formd(fixture)
        row = formd_to_issuer(fd)
        assert row["cik"] == "0001853938"
        assert row["normalized_name"] == "555 Cypress Lake LP"


class TestFund:
    """Tests using the pooled-investment-fund fixture."""

    @staticmethod
    def load() -> Any:
        return _load("fund")

    def test_offering_is_pooled(self) -> None:
        fixture = self.load()
        fd = _mock_formd(fixture)
        row = formd_to_offering(fixture["accession_number"], fixture["form"], fd)
        assert row["is_pooled_fund"] is True
        assert row["industry_group"] == "Pooled Investment Fund"
        assert row["entity_type"] == "Limited Liability Company"


class TestAmendment:
    """Tests using the D/A amendment fixture."""

    @staticmethod
    def load() -> Any:
        return _load("amend")

    def test_offering_is_amendment(self) -> None:
        fixture = self.load()
        fd = _mock_formd(fixture)
        row = formd_to_offering(fixture["accession_number"], fixture["form"], fd)
        assert row["is_amendment"] is True

    def test_indefinite_amounts_become_null(self) -> None:
        fixture = self.load()
        fd = _mock_formd(fixture)
        row = formd_to_offering(fixture["accession_number"], fixture["form"], fd)
        assert row["total_offering_amount"] is None  # "Indefinite"
        assert row["total_amount_sold"] == 31_871_421
        assert row["total_remaining"] is None  # "Indefinite"


def test_serialize_filing_includes_expected_fields() -> None:
    fixture = _load("opco")
    mock_filing = _mock_edgar_filing(fixture)
    mock_filing.obj.return_value = _mock_formd(fixture)
    raw = serialize_filing(mock_filing)
    data = json.loads(raw)
    assert data["accession_number"] == fixture["accession_number"]
    assert "parsed" in data
    assert data["parsed"]["offering_data"]["industry_group"] == "Residential"
