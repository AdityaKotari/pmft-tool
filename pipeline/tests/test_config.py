"""Unit tests for config — no network required."""

from __future__ import annotations

from pathlib import Path

import pytest

from fundscraper.config import Config


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
    monkeypatch.setenv("EDGAR_IDENTITY", "Test User test@test.com")
    cfg = Config()
    assert cfg.db_path == Path("data/fundscraper.db")
    assert cfg.access_mode == "readonly"


def test_config_custom_db_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FUNDSCRAPER_DB", "/tmp/test.db")
    monkeypatch.setenv("EDGAR_IDENTITY", "Test User test@test.com")
    cfg = Config()
    assert cfg.db_path == Path("/tmp/test.db")


def test_config_invalid_access_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FUNDSCRAPER_ACCESS_MODE", "invalid")
    monkeypatch.setenv("EDGAR_IDENTITY", "Test User test@test.com")
    with pytest.raises(ValueError, match="FUNDSCRAPER_ACCESS_MODE"):
        Config()
