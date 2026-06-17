"""Unit tests for fund filter / tech-operating classification (M5 + M8 + M9)."""

from __future__ import annotations

import pytest

from fundscraper.filters import (
    EXCLUDED_GROUPS,
    TIER_A_GROUPS,
    TIER_B_GROUPS,
    TIER_C_GROUPS,
    _all_recipients_non_natural,
    _is_non_natural_recipient,
    _issuer_name_has_fund_signal,
    classify_lead_tier,
    classify_offering,
    detect_is_likely_fund,
    is_pooled_fund,
    is_tech_operating,
    lead_tier_label,
)

# ---------------------------------------------------------------------------
# M5: industry-group signals
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("industry_group", "expected"),
    [
        ("Pooled Investment Fund", True),
        ("Other Banking and Financial Services", True),
        ("Investing", True),
        ("Commercial Banking", True),
        ("Insurance", True),
        ("REITS and Finance", True),
        ("Other Technology", False),
        ("Other", False),
        ("Residential", False),
        ("Oil and Gas", False),
        ("Biotechnology", False),
        (None, False),
    ],
)
def test_is_pooled_fund(industry_group: str | None, expected: bool) -> None:
    assert is_pooled_fund(industry_group) == expected


@pytest.mark.parametrize(
    ("industry_group", "pooled", "expected"),
    [
        ("Other Technology", False, True),
        ("Computers", False, True),
        ("Telecommunications", False, True),
        ("Biotechnology", False, True),
        ("Other Technology", True, False),
        ("Residential", False, False),
        ("Oil and Gas", False, False),
        ("Pooled Investment Fund", True, False),
        (None, False, False),
    ],
)
def test_is_tech_operating(industry_group: str | None, pooled: bool, expected: bool) -> None:
    assert is_tech_operating(industry_group, is_pooled_fund=pooled) == expected


def test_classify_offering_fund_filing() -> None:
    result = classify_offering("Pooled Investment Fund")
    assert result == {"is_pooled_fund": True, "is_tech_operating": False}


def test_classify_offering_tech_operating() -> None:
    result = classify_offering("Other Technology")
    assert result == {"is_pooled_fund": False, "is_tech_operating": True}


def test_classify_offering_other_real_estate() -> None:
    result = classify_offering("Residential")
    assert result == {"is_pooled_fund": False, "is_tech_operating": False}


def test_classify_offering_none() -> None:
    result = classify_offering(None)
    assert result == {"is_pooled_fund": False, "is_tech_operating": False}


# ---------------------------------------------------------------------------
# M8: fund-leak heuristics — name signal
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("issuer_name", "expected_strong", "expected_weak"),
    [
        ("Peachtree Credit Fund IV, LP", True, False),
        ("MCI Preferred Income Fund VIII, LLC", True, False),
        ("Acme SPV I LLC", True, False),
        ("Downtown REIT Holdings", True, True),
        ("Some Fund LP", True, False),
        ("Acme Ventures III LLC", True, False),
        ("Project X LP", True, False),
        ("Acme Holdings Inc.", False, True),
        ("Growth Capital Partners", False, True),
        ("River Trust LLC", False, True),
        ("Acme Software Inc.", False, False),
        ("Tech Startup Co.", False, False),
        (None, False, False),
        ("AlphaFund Inc", False, False),
        ("Wefunds LLC", False, False),
        ("ARCTRUST Exchange DST", True, False),
        ("Canyon QOF FundCo, LLC", True, False),
        ("Caliber HS Georgetown FundCo, LLC", True, False),
        ("SGGF FEEDER INVESTMENTS I INC.", True, False),
        ("Forney FM741 EB5 Fund, LP", True, False),
        ("PG EB-5 Sugar Lender, LLC", True, False),
        ("Atum Works I, a series of Capitalize Investments LLC", True, False),
        ("Pirouette Medical I, a series of Wefunds LLC", True, False),
        ("WCOH CBUS THIRD STREET EBFUND, LLC", False, False),
        ("Direct Digital Holdings, Inc.", False, True),
        ("Lighthouse Technology Holdings Inc.", False, True),
    ],
)
def test_issuer_name_has_fund_signal(
    issuer_name: str | None, expected_strong: bool, expected_weak: bool
) -> None:
    strong, weak = _issuer_name_has_fund_signal(issuer_name)
    assert strong == expected_strong, f"{issuer_name}: expected strong={expected_strong}"
    assert weak == expected_weak, f"{issuer_name}: expected weak={expected_weak}"


# ---------------------------------------------------------------------------
# M8: fund-leak heuristics — recipient naturalness
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("John Smith", False),
        ("Jane Doe", False),
        ("Brian Waldman", False),
        ("Acme Management LLC", True),
        ("PCF IV General Partner, LLC", True),
        ("Peachtree Hotel Group II, LLC", True),
        ("MCI Holdings LLC", True),
        ("Megatel Capital Investment LLC", True),
        ("Some Corp.", True),
        ("N/A PCF IV General Partner, LLC", True),
        ("", False),
        ("Inc", True),
        ("Acme Inc", True),
        ("Acme Ltd", True),
        ("Acme GP", True),
    ],
)
def test_is_non_natural_recipient(name: str, expected: bool) -> None:
    assert _is_non_natural_recipient(name) == expected


def test_all_recipients_non_natural_empty() -> None:
    assert _all_recipients_non_natural([]) is False


def test_all_recipients_non_natural_all_entities() -> None:
    assert _all_recipients_non_natural(["Acme LLC", "Beta Corp.", "Gamma GP"]) is True


def test_all_recipients_non_natural_has_human() -> None:
    assert _all_recipients_non_natural(["Acme LLC", "John Smith"]) is False


# ---------------------------------------------------------------------------
# M8: combined detect_is_likely_fund
# ---------------------------------------------------------------------------


def test_detect_likely_fund_pooled_industry() -> None:
    assert detect_is_likely_fund(True, "Any Name LLC", ["John Smith"]) is True


def test_detect_likely_fund_strong_name() -> None:
    assert detect_is_likely_fund(False, "Peachtree Credit Fund IV, LP", ["Brian Waldman"]) is True


def test_detect_likely_fund_weak_name_with_humans() -> None:
    assert detect_is_likely_fund(False, "Acme Capital Partners", ["John Smith"]) is False


def test_detect_likely_fund_weak_name_no_humans() -> None:
    assert detect_is_likely_fund(False, "Acme Holdings LLC", ["Acme Management LLC"]) is True


def test_detect_likely_fund_startup() -> None:
    assert detect_is_likely_fund(False, "Acme Software Inc.", ["John Smith", "Jane Doe"]) is False


def test_detect_likely_fund_roman_numeral() -> None:
    assert detect_is_likely_fund(False, "Acme Ventures III LLC", ["John Smith"]) is True


def test_detect_likely_fund_spv() -> None:
    assert detect_is_likely_fund(False, "Tech SPV I LLC", ["John Smith", "Jane Doe"]) is True


def test_detect_likely_fund_mci() -> None:
    assert (
        detect_is_likely_fund(
            False,
            "MCI Preferred Income Fund VIII, LLC",
            ["Arash Afzalipour", "Armin Afzalipour", "MCI Holdings LLC"],
        )
        is True
    )


# ---------------------------------------------------------------------------
# M9: Lead tier classification
# ---------------------------------------------------------------------------


def test_tier_groups_no_overlap() -> None:
    assert TIER_A_GROUPS.isdisjoint(TIER_B_GROUPS)
    assert TIER_A_GROUPS.isdisjoint(TIER_C_GROUPS)
    assert TIER_B_GROUPS.isdisjoint(TIER_C_GROUPS)
    assert TIER_A_GROUPS.isdisjoint(EXCLUDED_GROUPS)
    assert TIER_B_GROUPS.isdisjoint(EXCLUDED_GROUPS)
    assert TIER_C_GROUPS.isdisjoint(EXCLUDED_GROUPS)


def test_biotechnology_not_in_tier_a() -> None:
    assert "Biotechnology" not in TIER_A_GROUPS
    assert "Biotechnology" in TIER_B_GROUPS


@pytest.mark.parametrize(
    ("industry_group", "expected_tier"),
    [
        ("Other Technology", "A"),
        ("Computers", "A"),
        ("Telecommunications", "A"),
        ("Biotechnology", "B"),
        ("Manufacturing", "B"),
        ("Business Services", "B"),
        ("Retailing", "B"),
        ("Other", "C"),
        ("Other Real Estate", "excluded"),
        ("Residential", "excluded"),
        ("Commercial", "excluded"),
        ("Oil and Gas", "excluded"),
        (None, "excluded"),
        ("Some Unknown Group", "excluded"),
    ],
)
def test_classify_lead_tier(industry_group: str | None, expected_tier: str) -> None:
    assert classify_lead_tier(industry_group) == expected_tier


def test_lead_tier_label() -> None:
    assert lead_tier_label("A") == "Tier A — Tech (high)"
    assert lead_tier_label("B") == "Tier B — Operating (medium)"
    assert lead_tier_label("C") == "Tier C — Other (low)"
    assert lead_tier_label("excluded") == "Excluded (RE / O&G)"
