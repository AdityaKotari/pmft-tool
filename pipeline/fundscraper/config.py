"""Environment configuration for fundscraper."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Repo root — relative DB paths are resolved against this, not the cwd, so
# CLI runs from pipeline/ (or anywhere else) always hit the same database.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def resolve_db_path(raw: str | None) -> Path:
    """Resolve a FUNDRAISES_DB value against the repo root if relative."""
    path = Path(raw or "data/fundraises.db")
    return path if path.is_absolute() else REPO_ROOT / path


def load_env_file(env_path: Path | None = None) -> None:
    """Load repo-root .env into os.environ — never overriding existing vars.

    Lets the documented flow (edit .env, run `npm run db:backfill`) work
    without exporting EDGAR_IDENTITY in the shell.
    """
    env_path = env_path or REPO_ROOT / ".env"
    try:
        content = env_path.read_text()
    except OSError:
        return
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass
class Config:
    """Read-only config sourced from environment variables.

    Raises ValueError if EDGAR_IDENTITY is missing — the SEC requires it.
    """

    edgar_identity: str = field(default_factory=lambda: os.environ.get("EDGAR_IDENTITY", ""))
    db_path: Path = field(
        default_factory=lambda: resolve_db_path(os.environ.get("FUNDRAISES_DB"))
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
