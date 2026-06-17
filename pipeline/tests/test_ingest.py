"""Unit tests for fetch_form_d — uses recorded fixture, no network."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from unittest.mock import patch

from edgar import Filing

from fundscraper.ingest import fetch_form_d

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> list[dict[str, object]]:
    path = FIXTURE_DIR / name
    return json.loads(path.read_text())  # type: ignore[no-any-return]


def _make_filing(record: dict[str, object]) -> Filing:
    """Build an edgartools Filing from fixture dict."""
    filing_date = (
        date.fromisoformat(str(record["filing_date"]))
        if record.get("filing_date")
        else date.today()
    )
    return Filing(
        cik=str(record["cik"]),
        company=str(record["company"]),
        form=str(record["form"]),
        filing_date=filing_date,
        accession_no=str(record["accession_number"]),
    )


class _FakeFilings:
    """Minimal iterable that mimics edgartools Filings for testing."""

    def __init__(self, filings: list[Filing]) -> None:
        self._filings = filings

    def __iter__(self):  # type: ignore[no-untyped-def]
        return iter(self._filings)

    def __len__(self) -> int:
        return len(self._filings)


def test_fetch_form_d_returns_list_of_filings() -> None:
    """Given a fixture date, returns Filing objects with expected count."""
    records = _load_fixture("form_d_2026-05-20.json")
    fake_filings = _FakeFilings([_make_filing(r) for r in records])

    with patch("fundscraper.ingest.get_filings", return_value=fake_filings) as mock:
        result = fetch_form_d("2026-05-20")

    mock.assert_called_once_with(filing_date="2026-05-20", form="D", amendments=True)

    assert len(result) == 10
    assert all(isinstance(f, Filing) for f in result)

    # Verify both D and D/A are present
    forms = {f.form for f in result}
    assert forms == {"D", "D/A"}

    # Spot-check first D and first D/A record
    d_filing = next(f for f in result if f.form == "D")
    assert d_filing.company == "101 East Court Street LLC"
    assert d_filing.cik == "2134361"
    assert d_filing.accession_number == "0002134361-26-000001"

    da_filing = next(f for f in result if f.form == "D/A")
    assert da_filing.company == "251 TOWN LANE A SERIES OF VUCP FUND LLC"
    assert da_filing.accession_number == "0002134701-26-000002"


def test_fetch_form_d_empty_when_index_unavailable() -> None:
    """Returns empty list when edgartools returns None (index not yet posted)."""
    with patch("fundscraper.ingest.get_filings", return_value=None):
        result = fetch_form_d("2026-05-31")
    assert result == []
