"""Orchestration: run one date end-to-end, idempotent."""

from __future__ import annotations

import datetime
import logging
from pathlib import Path

from edgar import Filing
from sqlalchemy.orm import Session

from fundscraper.adapter import (
    filing_to_row,
    formd_to_issuer,
    formd_to_offering,
    formd_to_related_persons,
)
from fundscraper.config import Config
from fundscraper.filters import classify_offering, detect_is_likely_fund
from fundscraper.ingest import fetch_form_d, init_edgar
from fundscraper.models import Filing as FilingModel
from fundscraper.models import Issuer, Offering, RelatedPerson, RunLog
from fundscraper.store import (
    create_engine_for_path,
    init_db,
    record_run,
    upsert_filing,
)

logger = logging.getLogger(__name__)

# DB paths already migrated in this process. `alembic upgrade head` is
# idempotent, so it only needs to run once per path — not once per date.
_db_initialized: set[Path] = set()


def run_date(
    date_str: str,
    config: Config | None = None,
    *,
    session: Session | None = None,
    engine_override: object = None,
) -> dict[str, int]:
    """Run the full pipeline for a single filing date.

    - Initializes edgartools identity
    - Fetches all Form D + D/A filings for *date_str*
    - Adapts and upserts filings, offerings, related_persons, issuers
    - Records a run_log entry

    Idempotent: running the same date twice produces identical DB state.

    Returns a summary dict with counts.
    """
    if config is None:
        config = Config()

    config.require_edgar_identity()
    init_edgar(config)

    run_date_obj = datetime.date.fromisoformat(date_str)
    started_at = datetime.datetime.now(datetime.UTC)

    # Use provided session or create engine + session
    close_session = False
    if session is None:
        engine = create_engine_for_path(config.db_path)
        if config.db_path not in _db_initialized:
            init_db(config.db_path)
            _db_initialized.add(config.db_path)
        session = Session(engine)
        close_session = True

    try:
        rows_before = (
            session.query(FilingModel)
            .filter(FilingModel.date_filed == run_date_obj)
            .count()
        )

        # Check idempotency: skip EDGAR pull if this date is already complete,
        # but only if run_log's claimed filings_stored matches the rows
        # actually in the DB — otherwise refetch to backfill the gap.
        existing_run = session.get(RunLog, run_date_obj)
        if existing_run is not None and existing_run.status == "complete":
            if rows_before == existing_run.filings_stored:
                logger.info("Date %s already complete in run_log — skipping EDGAR pull.", date_str)
                return {
                    "filings_seen": existing_run.filings_seen,
                    "filings_stored": existing_run.filings_stored,
                }
            logger.info(
                "run_log claims %s filings stored for %s but filings table has %s — refetching.",
                existing_run.filings_stored,
                date_str,
                rows_before,
            )

        filings = fetch_form_d(date_str)
        # EDGAR indexes occasionally list the same accession twice. Dedupe
        # before processing so filings_seen matches stored rows and we don't
        # refetch (or double-parse) duplicate entries.
        seen_accessions: set[str] = set()
        unique_filings: list[Filing] = []
        for filing in filings:
            accession = str(filing.accession_number)
            if accession not in seen_accessions:
                seen_accessions.add(accession)
                unique_filings.append(filing)
        filings = unique_filings
        filings_seen = len(filings)

        for edgar_filing in filings:
            try:
                # 1. Upsert filing row
                f_row = filing_to_row(edgar_filing)
                acc = str(f_row.pop("accession_number"))
                upsert_filing(session, acc, **f_row)

                # 2. Parse and store offering + related_persons + issuer
                try:
                    fd = edgar_filing.obj()
                except Exception:
                    session.query(FilingModel).filter_by(
                        accession_number=edgar_filing.accession_number
                    ).update({"parse_status": "error"})
                    continue

                # Offering data
                offering_row = formd_to_offering(
                    edgar_filing.accession_number, edgar_filing.form, fd
                )
                classification = classify_offering(
                    str(offering_row.get("industry_group"))
                    if offering_row.get("industry_group")
                    else None
                )
                offering_row["is_pooled_fund"] = bool(classification["is_pooled_fund"])

                # Related persons — delete old, insert new
                session.query(RelatedPerson).filter_by(
                    accession_number=edgar_filing.accession_number
                ).delete()
                rp_names: list[str] = []
                for rp_row in formd_to_related_persons(
                    edgar_filing.accession_number, fd, edgar_filing
                ):
                    session.add(RelatedPerson(**rp_row))
                    rp_names.append(str(rp_row["name"]))

                # Leak detection: must run after related persons are known
                offering_row["is_likely_fund"] = detect_is_likely_fund(
                    bool(offering_row["is_pooled_fund"]),
                    str(offering_row.get("issuer_name") or ""),
                    rp_names,
                )

                # Upsert offering
                existing_offering = session.get(Offering, edgar_filing.accession_number)
                if existing_offering is None:
                    session.add(Offering(**offering_row))
                else:
                    for k, v in offering_row.items():
                        setattr(existing_offering, k, v)

                # Issuer — upsert
                issuer_row = formd_to_issuer(fd)
                existing_issuer = session.get(Issuer, issuer_row["cik"])
                today = datetime.date.today()
                if existing_issuer is None:
                    session.add(
                        Issuer(
                            first_seen=today,
                            last_seen=today,
                            **issuer_row,
                        )
                    )
                else:
                    existing_issuer.normalized_name = str(issuer_row["normalized_name"])
                    existing_issuer.last_seen = today

            except Exception:
                logger.exception("Failed to process filing %s", edgar_filing.accession_number)
                continue

        session.flush()

        # Derive truthful stored counts from the DB, not in-memory counters:
        # upserts can double-count duplicate index entries without adding rows.
        rows_after = (
            session.query(FilingModel)
            .filter(FilingModel.date_filed == run_date_obj)
            .count()
        )
        filings_stored = rows_after
        status = "complete" if rows_after == filings_seen else "partial"

        # Record run_log
        record_run(
            session,
            run_date=run_date_obj,
            status=status,
            filings_seen=filings_seen,
            filings_stored=filings_stored,
            started_at=started_at,
            finished_at=datetime.datetime.now(datetime.UTC),
        )
        session.commit()

        return {
            "filings_seen": filings_seen,
            "filings_stored": filings_stored,
        }

    finally:
        if close_session:
            session.close()
