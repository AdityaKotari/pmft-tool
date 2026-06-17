"""Database engine, sessions, upsert logic, and run_log watermark."""

import datetime
import os
import subprocess
from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from fundscraper.models import Base, Filing, RunLog


def create_engine_for_path(db_path: Path) -> Engine:
    """Create a SQLAlchemy engine for *db_path* (SQLite, WAL mode).

    For in-memory databases, creates tables via Base.metadata.create_all.
    For file-based databases, the caller must run alembic upgrade head
    after engine creation.
    """
    dirname = db_path.parent
    if not dirname.exists():
        dirname.mkdir(parents=True, exist_ok=True)

    is_memory = str(db_path) == ":memory:"
    db_url = "sqlite+pysqlite:///:memory:" if is_memory else f"sqlite+pysqlite:///{db_path}"
    engine = create_engine(db_url, echo=False)

    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.commit()

    if is_memory:
        Base.metadata.create_all(bind=engine)

    return engine


def init_db(db_path: Path) -> None:
    """Run alembic upgrade head against *db_path*.

    Does nothing for in-memory databases (tables are created by create_engine_for_path).
    """
    if str(db_path) == ":memory:":
        return

    env = os.environ.copy()
    env["FUNDSCRAPER_DB"] = str(db_path)
    subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=Path(__file__).resolve().parent.parent,
        env=env,
        check=True,
        capture_output=True,
    )


def upsert_filing(session: Session, accession_number: str, **fields: object) -> Filing:
    """Insert or update a filing by accession_number. Returns the Filing."""
    filing = session.get(Filing, accession_number)
    if filing is None:
        filing = Filing(accession_number=accession_number, **fields)
        session.add(filing)
    else:
        for key, value in fields.items():
            if hasattr(filing, key):
                setattr(filing, key, value)
    session.flush()
    return filing


def record_run(
    session: Session,
    run_date: datetime.date,
    *,
    status: str = "complete",
    filings_seen: int = 0,
    filings_stored: int = 0,
    started_at: datetime.datetime | None = None,
    finished_at: datetime.datetime | None = None,
) -> RunLog:
    """Record (or update) a run_log entry for *run_date*."""
    existing = session.get(RunLog, run_date)
    if existing is None:
        entry = RunLog(
            run_date=run_date,
            status=status,
            filings_seen=filings_seen,
            filings_stored=filings_stored,
            started_at=started_at,
            finished_at=finished_at,
        )
        session.add(entry)
        session.flush()
        return entry

    existing.status = status
    existing.filings_seen = filings_seen
    existing.filings_stored = filings_stored
    if started_at is not None:
        existing.started_at = started_at
    if finished_at is not None:
        existing.finished_at = finished_at
    session.flush()
    return existing
