"""Smoke test for EDGAR Form D ingestion — requires network and EDGAR_IDENTITY."""

from __future__ import annotations

import os
from datetime import date, timedelta

import pytest

from fundscraper.config import Config
from fundscraper.ingest import get_filings_for_date, init_edgar


def _has_creds() -> bool:
    return bool(os.environ.get("EDGAR_IDENTITY"))


def _is_ci() -> bool:
    return bool(os.environ.get("CI"))


pytestmark = pytest.mark.skipif(
    not _has_creds() or _is_ci(),
    reason="Requires EDGAR_IDENTITY env var and network access; skipped in CI",
)


@pytest.fixture(scope="module")
def config() -> Config:
    return Config()


@pytest.fixture(scope="module")
def _init_edgar(config: Config) -> None:
    init_edgar(config)


@pytest.mark.usefixtures("_init_edgar")
def test_get_filings_returns_non_empty() -> None:
    """Pull Form D filings for the most recent weekday — should return results."""
    # Use yesterday (or further back on weekends) since today's index may lag
    target = date.today()
    while target.weekday() >= 5:  # Saturday=5, Sunday=6
        target = target - timedelta(days=1)
    target = target - timedelta(days=1)  # one business day lag is normal

    date_str = target.isoformat()
    filings = get_filings_for_date(date_str)

    assert len(filings) > 0, (
        f"Expected at least one Form D filing on {date_str}, got 0. "
        "The index may not be posted yet — try an older date."
    )
