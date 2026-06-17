"""Environment configuration for fundscraper."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Config:
    """Read-only config sourced from environment variables.

    Raises ValueError if EDGAR_IDENTITY is missing — the SEC requires it.
    """

    edgar_identity: str = field(default_factory=lambda: os.environ.get("EDGAR_IDENTITY", ""))
    db_path: Path = field(
        default_factory=lambda: Path(os.environ.get("FUNDRAISES_DB", str(Path(__file__).resolve().parent.parent.parent / "data" / "fundraises.db")))
    )
    access_mode: str = field(
        default_factory=lambda: os.environ.get("FUNDSCRAPER_ACCESS_MODE", "readonly")
    )

    def __post_init__(self) -> None:
        if self.access_mode not in ("readonly", "readwrite"):
            raise ValueError(
                f"FUNDSCRAPER_ACCESS_MODE must be 'readonly' or 'readwrite', "
                f"got '{self.access_mode}'"
            )

    def require_edgar_identity(self) -> None:
        """Raise if EDGAR_IDENTITY is not set.

        Called only by commands that access the SEC EDGAR system.
        Read-only commands (export, summary, leads) skip this check.
        """
        if not self.edgar_identity:
            raise ValueError(
                "EDGAR_IDENTITY environment variable is required. "
                "Set it to 'Name email@example.com' — the SEC requires this for access. "
                "See https://www.sec.gov/os/accessing-edgar-data"
            )
