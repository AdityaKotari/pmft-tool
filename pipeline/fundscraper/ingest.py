"""SEC EDGAR Form D ingestion via edgartools."""

from __future__ import annotations

from edgar import Filing, Filings, get_filings, set_identity

from fundscraper.config import Config


def init_edgar(config: Config) -> None:
    """Set the EDGAR identity — call once before any SEC access."""
    set_identity(config.edgar_identity)


def fetch_form_d(date: str) -> list[Filing]:
    """Pull all Form D and D/A filings for *date* (YYYY-MM-DD).

    Uses edgartools' get_filings with amendments=True so both D and D/A
    are included in a single call. Returns a list of Filing objects.
    """
    filings = get_filings(filing_date=date, form="D", amendments=True)
    if filings is None:
        return []
    return list(filings)


def get_filings_for_date(date: str, *, form: str = "D") -> Filings:
    """Pull all Form D filings (including amendments) for *date*.

    *date* is a single YYYY-MM-DD string or a range "YYYY-MM-DD:YYYY-MM-DD".
    Returns an edgartools Filings container (non-empty in normal operation).
    """
    filings = get_filings(filing_date=date, form=form, amendments=True)
    if filings is None:
        return Filings.empty()
    return filings
