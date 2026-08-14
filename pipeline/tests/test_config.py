"""Unit tests for config — no network required."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from fundscraper.config import REPO_ROOT, Config, load_env_file


def test_config_fails_when_identity_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EDGAR_IDENTITY", raising=False)
    cfg = Config()  # Config creation no longer requires EDGAR_IDENTITY
    with pytest.raises(ValueError, match="EDGAR_IDENTITY"):
        cfg.require_edgar_identity()


def test_config_reads_identity_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGAR_IDENTITY", "Test User test@test.com")
    cfg = Config()
    assert cfg.edgar_identity == "Test User test@test.com"


def test_config_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FUNDRAISES_DB", raising=False)
    monkeypatch.setenv("EDGAR_IDENTITY", "Test User test@test.com")
    cfg = Config()
    # Relative paths resolve against the repo root, not the cwd.
    assert cfg.db_path == REPO_ROOT / "data" / "fundraises.db"
    assert cfg.access_mode == "readonly"


def test_config_relative_db_path_resolves_to_repo_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FUNDRAISES_DB", "data/custom.db")
    cfg = Config()
    assert cfg.db_path == REPO_ROOT / "data" / "custom.db"


def test_config_custom_db_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FUNDRAISES_DB", "/tmp/test.db")
    monkeypatch.setenv("EDGAR_IDENTITY", "Test User test@test.com")
    cfg = Config()
    assert cfg.db_path == Path("/tmp/test.db")


def test_load_env_file_fills_missing_vars_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        'EDGAR_IDENTITY="Test User test@test.com"\n'
        'FUNDRAISES_DB=data/fundraises.db\n'
        "# a comment\n"
    )
    monkeypatch.setenv("FUNDRAISES_DB", "/already/set.db")
    monkeypatch.delenv("EDGAR_IDENTITY", raising=False)

    load_env_file(env_file)

    # Existing env vars win.
    assert os.environ["FUNDRAISES_DB"] == "/already/set.db"
    # Missing vars are filled from the file.
    assert os.environ["EDGAR_IDENTITY"] == "Test User test@test.com"


def test_config_invalid_access_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FUNDSCRAPER_ACCESS_MODE", "invalid")
    monkeypatch.setenv("EDGAR_IDENTITY", "Test User test@test.com")
    with pytest.raises(ValueError, match="FUNDSCRAPER_ACCESS_MODE"):
        Config()
