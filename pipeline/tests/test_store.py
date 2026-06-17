"""Round-trip tests for store — in-memory SQLite, no network."""

import datetime
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from fundscraper.models import Filing, RunLog
from fundscraper.store import create_engine_for_path, record_run, upsert_filing


@pytest.fixture
def engine() -> Generator[Engine]:
    """In-memory SQLite engine with all tables created."""
    eng = create_engine_for_path(Path(":memory:"))
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine: Engine) -> Generator[Session]:
    """Session bound to the in-memory engine."""
    with Session(engine) as sess:
        yield sess
        sess.rollback()


def test_upsert_filing_idempotent(session: Session) -> None:
    """Insert the same filing twice → exactly one row."""
    now = datetime.datetime.now(datetime.UTC)
    today = datetime.date.today()

    # First insert
    filing1 = upsert_filing(
        session,
        accession_number="0001234567-26-000001",
        cik="0001234567",
        company_name="Test Corp",
        form_type="D",
        date_filed=today,
        fetched_at=now,
        parse_status="ok",
    )
    session.commit()

    # Second insert with updated fields
    filing2 = upsert_filing(
        session,
        accession_number="0001234567-26-000001",
        cik="0001234567",
        company_name="Test Corp Updated",
        form_type="D/A",
        date_filed=today,
        fetched_at=now,
        parse_status="ok",
    )
    session.commit()

    # Should be the same object
    assert filing1.accession_number == filing2.accession_number

    # Exactly one row in DB
    count = session.query(Filing).filter_by(accession_number="0001234567-26-000001").count()
    assert count == 1

    # First upsert retried: should still be one row
    filing3 = upsert_filing(
        session,
        accession_number="0001234567-26-000001",
        cik="0001234567",
        company_name="Test Corp Final",
        form_type="D/A",
        date_filed=today,
        fetched_at=now,
        parse_status="ok",
    )
    session.commit()

    count = session.query(Filing).filter_by(accession_number="0001234567-26-000001").count()
    assert count == 1
    # Verify updated field took effect
    assert filing3.company_name == "Test Corp Final"


def test_record_run(session: Session) -> None:
    """Record a run_log entry and verify it persists."""
    today = datetime.date.today()
    now = datetime.datetime.now(datetime.UTC)

    entry = record_run(
        session,
        run_date=today,
        status="complete",
        filings_seen=100,
        filings_stored=95,
        started_at=now,
        finished_at=now,
    )
    session.commit()

    assert entry.run_date == today
    assert entry.status == "complete"
    assert entry.filings_seen == 100
    assert entry.filings_stored == 95

    # Fetch back from DB
    loaded = session.get(RunLog, today)
    assert loaded is not None
    assert loaded.status == "complete"
    assert loaded.filings_seen == 100


def test_round_trip_filing_and_run_log(session: Session) -> None:
    """Full round trip: insert filing twice (idempotent) + record_run."""
    now = datetime.datetime.now(datetime.UTC)
    today = datetime.date.today()
    acc = "0009876543-26-000001"

    # Insert filing twice → idempotent
    upsert_filing(
        session,
        accession_number=acc,
        cik="0009876543",
        company_name="Round Trip Inc",
        form_type="D",
        date_filed=today,
        fetched_at=now,
        parse_status="ok",
    )
    upsert_filing(
        session,
        accession_number=acc,
        cik="0009876543",
        company_name="Round Trip Inc",
        form_type="D",
        date_filed=today,
        fetched_at=now,
        parse_status="ok",
    )
    session.commit()

    # Record the run
    record_run(
        session,
        run_date=today,
        status="complete",
        filings_seen=1,
        filings_stored=1,
        started_at=now,
        finished_at=now,
    )
    session.commit()

    # Assertions
    assert session.query(Filing).count() == 1
    assert session.query(RunLog).count() == 1

    filing = session.get(Filing, acc)
    assert filing is not None
    assert filing.company_name == "Round Trip Inc"

    run_log = session.get(RunLog, today)
    assert run_log is not None
    assert run_log.status == "complete"
    assert run_log.filings_seen == 1
    assert run_log.filings_stored == 1
