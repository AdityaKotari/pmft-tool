"""Integration tests for pipeline — in-memory SQLite, mocked EDGAR."""

from __future__ import annotations

import datetime
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from fundscraper.config import Config
from fundscraper.models import Filing, RunLog
from fundscraper.pipeline import run_date
from fundscraper.store import create_engine_for_path


def _mock_filing(accession_number: str, form: str = "D") -> MagicMock:
    """Create a mock edgartools Filing that returns a plausible FormD obj()."""
    filing = MagicMock()
    filing.accession_number = accession_number
    filing.cik = "0001234567"
    filing.company = f"Test Corp {accession_number[-3:]}"
    filing.form = form
    filing.filing_date = datetime.date(2026, 6, 2)

    fd = MagicMock()
    fd.submission_type = form
    # primary_issuer
    fd.primary_issuer = MagicMock()
    fd.primary_issuer.entity_name = filing.company
    fd.primary_issuer.cik = filing.cik
    fd.primary_issuer.entity_type = "Corporation"
    fd.primary_issuer.jurisdiction = "DELAWARE"
    fd.primary_issuer.year_of_incorporation = "2025"
    # offering_data
    fd.offering_data = MagicMock()
    fd.offering_data.industry_group = MagicMock()
    fd.offering_data.industry_group.industry_group_type = "Other Technology"
    fd.offering_data.is_pooled_investment = False
    fd.offering_data.date_of_first_sale = "2026-06-01"
    fd.offering_data.minimum_investment = "10000"
    fd.offering_data.offering_sales_amounts = MagicMock()
    fd.offering_data.offering_sales_amounts.total_offering_amount = "5000000"
    fd.offering_data.offering_sales_amounts.total_amount_sold = "2500000"
    fd.offering_data.offering_sales_amounts.total_remaining = "2500000"
    fd.offering_data.investors = MagicMock()
    fd.offering_data.investors.total_already_invested = "5"
    # related_persons
    rp = MagicMock()
    rp.first_name = "Jane"
    rp.last_name = "Doe"
    rp.address = MagicMock()
    rp.address.city = "New York"
    rp.address.state_or_country = "NY"
    fd.related_persons = [rp]

    filing.obj.return_value = fd
    return filing


@pytest.fixture
def engine() -> Generator[Engine]:
    """In-memory engine for pipeline tests."""
    eng = create_engine_for_path(Path(":memory:"))
    yield eng
    eng.dispose()


def test_run_date_idempotent(engine: Engine) -> None:
    """Running the same date twice produces identical DB state."""
    mock_filings = [
        _mock_filing("0000000001-26-000001", "D"),
        _mock_filing("0000000001-26-000002", "D/A"),
    ]

    session = Session(engine)
    config = Config(edgar_identity="test@test.com")

    with (
        patch("fundscraper.pipeline.fetch_form_d", return_value=mock_filings),
        patch("fundscraper.pipeline.init_edgar"),
    ):
        # First run
        result1 = run_date(
            "2026-06-02",
            config=config,
            session=session,
        )
        assert result1["filings_seen"] == 2
        assert result1["filings_stored"] == 2

        # Second run — same filings
        result2 = run_date(
            "2026-06-02",
            config=config,
            session=session,
        )
        assert result2["filings_seen"] == 2
        assert result2["filings_stored"] == 2

    # Verify DB state
    assert session.query(Filing).count() == 2
    from fundscraper.models import RelatedPerson

    assert session.query(RelatedPerson).count() == 2
    run_log = session.get(RunLog, datetime.date(2026, 6, 2))
    assert run_log is not None
    assert run_log.status == "complete"
    assert run_log.filings_seen == 2
    assert run_log.filings_stored == 2
    session.close()


def test_backfill_three_day_range(engine: Engine) -> None:
    """Backfill over 3 days populates 3 run_log rows."""
    session = Session(engine)
    config = Config(edgar_identity="test@test.com")

    def _filings_for_date(date_str: str) -> list[MagicMock]:
        day = int(date_str[-2:])
        return [_mock_filing(f"0000000001-26-0000{day:02d}", "D")]

    with (
        patch("fundscraper.pipeline.fetch_form_d", side_effect=_filings_for_date),
        patch("fundscraper.pipeline.init_edgar"),
    ):
        for d in ["2026-06-01", "2026-06-02", "2026-06-03"]:
            result = run_date(d, config=config, session=session)
            assert result["filings_seen"] == 1
            assert result["filings_stored"] == 1

    # 3 run_log rows
    logs = session.query(RunLog).order_by(RunLog.run_date).all()
    assert len(logs) == 3
    assert [log.run_date for log in logs] == [
        datetime.date(2026, 6, 1),
        datetime.date(2026, 6, 2),
        datetime.date(2026, 6, 3),
    ]
    for log in logs:
        assert log.status == "complete"
        assert log.filings_seen == 1
        assert log.filings_stored == 1

    # 3 unique filings
    assert session.query(Filing).count() == 3
    session.close()
