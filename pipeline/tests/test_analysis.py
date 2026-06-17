"""Tests for DuckDB analysis and lead export — uses temp SQLite DB, no network."""

from __future__ import annotations

import csv
import datetime
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest

from fundscraper.analysis import (
    NoOpEnricher,
    connect,
    export_leads,
    raises_by_industry,
    raises_by_state,
    run_summary,
    tier_distribution,
)
from fundscraper.models import (
    Base,
    Filing,
    Issuer,
    Offering,
    RelatedPerson,
)
from fundscraper.store import create_engine_for_path


@pytest.fixture
def populated_db_path() -> Generator[Path]:
    """Create a temp SQLite DB with known filings and offerings."""
    from sqlalchemy.orm import Session

    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    db_path_obj = Path(db_path)
    engine = create_engine_for_path(db_path_obj)

    Base.metadata.create_all(bind=engine)

    with Session(engine) as session:
        today = datetime.date(2026, 6, 2)
        now = datetime.datetime.now(datetime.UTC)

        # Filing 1: tech operating company (tier A), D
        f1 = Filing(
            accession_number="ACC-001",
            cik="1111111",
            company_name="TechCo Inc",
            form_type="D",
            date_filed=today,
            fetched_at=now,
            parse_status="ok",
        )
        o1 = Offering(
            accession_number="ACC-001",
            issuer_name="TechCo Inc",
            industry_group="Other Technology",
            is_pooled_fund=False,
            is_likely_fund=False,
            total_offering_amount=5_000_000,
            total_amount_sold=3_000_000,
            jurisdiction="DELAWARE",
            date_first_sale=today,
            is_amendment=False,
        )
        rp1 = RelatedPerson(accession_number="ACC-001", name="Alice CEO", city="Austin", state="TX")
        i1 = Issuer(cik="1111111", normalized_name="TechCo Inc", first_seen=today, last_seen=today)
        session.add_all([f1, o1, rp1, i1])

        # Filing 2: pooled fund (should be excluded by is_likely_fund)
        f2 = Filing(
            accession_number="ACC-002",
            cik="2222222",
            company_name="MoneyPool Fund",
            form_type="D",
            date_filed=today,
            fetched_at=now,
            parse_status="ok",
        )
        o2 = Offering(
            accession_number="ACC-002",
            issuer_name="MoneyPool Fund",
            industry_group="Pooled Investment Fund",
            is_pooled_fund=True,
            is_likely_fund=True,
            total_offering_amount=50_000_000,
            total_amount_sold=20_000_000,
            jurisdiction="CAYMAN",
            is_amendment=False,
        )
        rp2 = RelatedPerson(
            accession_number="ACC-002", name="Bob Banker", city="New York", state="NY"
        )
        session.add_all([f2, o2, rp2])

        # Filing 3: biotech (tier B), two related persons
        f3 = Filing(
            accession_number="ACC-003",
            cik="3333333",
            company_name="BioHealth Labs",
            form_type="D",
            date_filed=today,
            fetched_at=now,
            parse_status="ok",
        )
        o3 = Offering(
            accession_number="ACC-003",
            issuer_name="BioHealth Labs",
            industry_group="Biotechnology",
            is_pooled_fund=False,
            is_likely_fund=False,
            total_offering_amount=15_000_000,
            total_amount_sold=10_000_000,
            jurisdiction="CALIFORNIA",
            is_amendment=False,
        )
        rp3a = RelatedPerson(accession_number="ACC-003", name="Carol CSO", city="SF", state="CA")
        rp3b = RelatedPerson(accession_number="ACC-003", name="Dan CTO", city="SF", state="CA")
        session.add_all([f3, o3, rp3a, rp3b])

        # Filing 4: real estate (excluded by tier), one related person
        f4 = Filing(
            accession_number="ACC-004",
            cik="4444444",
            company_name="RE HoldCo LLC",
            form_type="D",
            date_filed=today,
            fetched_at=now,
            parse_status="ok",
        )
        o4 = Offering(
            accession_number="ACC-004",
            issuer_name="RE HoldCo LLC",
            industry_group="Other Real Estate",
            is_pooled_fund=False,
            is_likely_fund=False,
            total_offering_amount=2_000_000,
            total_amount_sold=1_000_000,
            jurisdiction="FLORIDA",
            is_amendment=False,
        )
        rp4 = RelatedPerson(
            accession_number="ACC-004", name="Eve Investor", city="Miami", state="FL"
        )
        session.add_all([f4, o4, rp4])

        session.commit()

    yield db_path_obj

    engine.dispose()
    db_path_obj.unlink(missing_ok=True)


def test_run_summary(populated_db_path: Path) -> None:
    con = connect(populated_db_path)
    try:
        stats = run_summary(con)
        assert stats["total_filings"] == 4
        assert stats["unique_issuers"] == 4
        assert stats["pooled_funds"] == 1  # MoneyPool Fund
        assert stats["operating_companies"] == 3  # TechCo, BioHealth, RE HoldCo
        assert stats["avg_offering"] == pytest.approx(
            (5_000_000 + 50_000_000 + 15_000_000 + 2_000_000) / 4
        )
        assert stats["total_raised"] == 3_000_000 + 20_000_000 + 10_000_000 + 1_000_000
    finally:
        con.close()


def test_raises_by_industry_opcos_only(populated_db_path: Path) -> None:
    con = connect(populated_db_path)
    try:
        rows = raises_by_industry(con)
        industries = {r["industry_group"] for r in rows}
        assert "Pooled Investment Fund" not in industries
        assert "Other Technology" in industries or "Biotechnology" in industries
    finally:
        con.close()


def test_raises_by_state(populated_db_path: Path) -> None:
    con = connect(populated_db_path)
    try:
        rows = raises_by_state(con)
        states = {r["state"] for r in rows}
        assert "TX" in states
        assert "CA" in states
        assert "FL" in states
        assert "NY" not in states  # pooled fund excluded
    finally:
        con.close()


def test_export_leads_csv_default_tier_a(populated_db_path: Path) -> None:
    output = populated_db_path.parent / "test_leads_tier_a.csv"
    con = connect(populated_db_path)
    try:
        written = export_leads(con, output, enricher=NoOpEnricher())
        assert written == 1  # TechCo only (tier A)
        rows = list(csv.DictReader(output.read_text().splitlines()))
        assert rows[0]["company_name"] == "TechCo Inc"
        assert rows[0]["lead_tier"] == "A"
    finally:
        con.close()
        output.unlink(missing_ok=True)


def test_export_leads_csv_tier_a_and_b(populated_db_path: Path) -> None:
    output = populated_db_path.parent / "test_leads_tier_ab.csv"
    con = connect(populated_db_path)
    try:
        written = export_leads(con, output, enricher=NoOpEnricher(), tiers={"A", "B"})
        assert written == 3  # TechCo (1) + BioHealth (2)
        rows = list(csv.DictReader(output.read_text().splitlines()))
        companies = {r["company_name"] for r in rows}
        assert companies == {"TechCo Inc", "BioHealth Labs"}
        tiers = {r["lead_tier"] for r in rows}
        assert tiers == {"A", "B"}
    finally:
        con.close()
        output.unlink(missing_ok=True)


def test_tier_distribution(populated_db_path: Path) -> None:
    con = connect(populated_db_path)
    try:
        dist = tier_distribution(con)
        assert dist["A"] == 1  # TechCo
        assert dist["B"] == 2  # BioHealth (2 persons)
        assert dist["C"] == 0
        assert dist["excluded"] == 1  # RE HoldCo
    finally:
        con.close()


def test_noop_enricher_passthrough() -> None:
    e = NoOpEnricher()
    row = {"company_name": "Test"}
    assert e.enrich(row) is row
    assert e.fieldnames() == []
