"""Pooled-fund exclusion, tech operating-company classification, and lead tiering.

The SEC Form D industry group taxonomy includes categories like
"Pooled Investment Fund" and "Other Banking and Financial Services"
that dominate the filing volume but are not operating companies.
This module flags those so analysis can exclude them.

M8 adds fund-leak heuristics: some funds self-classify under operating-company
industry groups (e.g. "Other Real Estate", "Other"). Entity-name signals and
recipient-naturalness checks catch these leaks.

M9 adds confidence-tiered lead classification and real-estate/O&G exclusion.
"""

from __future__ import annotations

import re
from typing import Literal

# ---------------------------------------------------------------------------
# Industry-group signals (M5)
# ---------------------------------------------------------------------------

POOLED_FUND_GROUPS: frozenset[str] = frozenset(
    {
        "Pooled Investment Fund",
        "Other Banking and Financial Services",
        "Investing",
        "Commercial Banking",
        "Insurance",
        "REITS and Finance",
    }
)

# Kept for backward compatibility — M5's tech-operating definition.
# M9 replaces this with tiered classification (TIER_A_GROUPS below).
TECH_OPERATING_GROUPS: frozenset[str] = frozenset(
    {
        "Other Technology",
        "Computers",
        "Telecommunications",
        "Biotechnology",
    }
)


# ---------------------------------------------------------------------------
# M9: Tiered lead classification
# ---------------------------------------------------------------------------

# Tier A (high): tech operating companies — fundable software/infra/ML startups.
TIER_A_GROUPS: frozenset[str] = frozenset(
    {
        "Other Technology",
        "Computers",
        "Telecommunications",
    }
)

# Tier B (medium): other genuine operating industries, not tech but real businesses.
TIER_B_GROUPS: frozenset[str] = frozenset(
    {
        "Biotechnology",
        "Manufacturing",
        "Business Services",
        "Retailing",
        "Restaurants",
        "Pharmaceuticals",
        "Hospitals and Physicians",
        "Other Health Care",
        "Agriculture",
        "Other Energy",
        "Construction",
        "Lodging and Conventions",
        "Tourism and Travel Services",
        "Other Travel",
    }
)

# Tier C (low): junk-drawer industry groups — nonspecific, needs manual review.
TIER_C_GROUPS: frozenset[str] = frozenset(
    {
        "Other",
    }
)

# Excluded by default from lead export: real estate and oil & gas groups.
# These are overwhelmingly investment vehicles, not operating companies.
# Recoverable via the --include-excluded flag.
EXCLUDED_GROUPS: frozenset[str] = frozenset(
    {
        "Other Real Estate",
        "Residential",
        "Commercial",
        "Oil and Gas",
    }
)

LeadTier = Literal["A", "B", "C", "excluded"]


# ---------------------------------------------------------------------------
# M8: Fund-leak heuristics
# ---------------------------------------------------------------------------

# Tokens that unambiguously signal a fund when found in an issuer name.
_STRONG_FUND_TOKENS = [
    r"\bfund\b",
    r"\bL\.?P\.?\b",
    r"\bSPV\b",
    r"\bREIT\b",
    r"\bpreferred\s+income\b",
]

# High-precision investment-vehicle tokens that never appear in operating startups.
_INVESTMENT_VEHICLE_TOKENS = [
    r"\bDST\b",
    r"\bQOF\b",
    r"\bFundCo\b",
    r"\bfeeder\b",
    r"\bEB-?5\b",
]

# Crowdfunding SPV pattern.
_CROWDFUNDING_SPV_RE = re.compile(
    r"a\s+series\s+of\s+(Capitalize|Wefunds|Wefunder)",
    re.IGNORECASE,
)

# Tokens that are suspicious but also appear in legit startup names.
# These only fire when combined with all-non-natural recipients.
_WEAK_FUND_TOKENS = [
    r"\bholdings\b",
    r"\bcapital\b",
    r"\bpartners\b",
    r"\btrust\b",
]

# Roman numerals II through X (word-bounded).
_ROMAN_NUMERAL_RE = re.compile(
    r"\b(?:X|IX|VIII|VII|VI|IV|V|III|II)\b",
    re.IGNORECASE,
)

_STRONG_FUND_RE = re.compile("|".join(_STRONG_FUND_TOKENS), re.IGNORECASE)
_INVESTMENT_VEHICLE_RE = re.compile("|".join(_INVESTMENT_VEHICLE_TOKENS), re.IGNORECASE)
_WEAK_FUND_RE = re.compile("|".join(_WEAK_FUND_TOKENS), re.IGNORECASE)

_ENTITY_RECIPIENT_RE = re.compile(
    r"(?:LLC|L\.?P\.?|Inc\b|Ltd|GP|Trust|Fund|Capital|Partners|Holdings|Corp\.?)$",
    re.IGNORECASE,
)


def _issuer_name_has_fund_signal(issuer_name: str | None) -> tuple[bool, bool]:
    """Return (has_strong, has_weak) fund signals for an issuer name."""
    if not issuer_name:
        return (False, False)
    strong = (
        bool(_STRONG_FUND_RE.search(issuer_name))
        or bool(_ROMAN_NUMERAL_RE.search(issuer_name))
        or bool(_INVESTMENT_VEHICLE_RE.search(issuer_name))
        or bool(_CROWDFUNDING_SPV_RE.search(issuer_name))
    )
    weak = bool(_WEAK_FUND_RE.search(issuer_name))
    return (strong, weak)


def _is_non_natural_recipient(name: str) -> bool:
    """Return True if the related person name appears to be a business entity."""
    if not name:
        return False
    return bool(_ENTITY_RECIPIENT_RE.search(name))


def _all_recipients_non_natural(related_person_names: list[str]) -> bool:
    """Return True if every related person for a filing is an entity, not a human."""
    if not related_person_names:
        return False
    return all(_is_non_natural_recipient(name) for name in related_person_names)


def detect_is_likely_fund(
    is_pooled_fund: bool,
    issuer_name: str | None,
    related_person_names: list[str],
) -> bool:
    """Return True if the filing is almost certainly a fund or SPV."""
    if is_pooled_fund:
        return True
    strong, weak = _issuer_name_has_fund_signal(issuer_name)
    return strong or (weak and _all_recipients_non_natural(related_person_names))


# ---------------------------------------------------------------------------
# M9: Lead tier classification
# ---------------------------------------------------------------------------


def classify_lead_tier(industry_group: str | None) -> LeadTier:
    """Assign a confidence tier to an operating company based on industry group.

    Returns:
        "A" — high-confidence tech operating company (software/infra/ML).
        "B" — medium: other genuine industry (biotech, manufacturing, etc.).
        "C" — low: garbage-drawer "Other" group, needs manual review.
        "excluded" — real estate or oil & gas, excluded from default export.
    """
    if industry_group is None:
        return "excluded"
    if industry_group in EXCLUDED_GROUPS:
        return "excluded"
    if industry_group in TIER_A_GROUPS:
        return "A"
    if industry_group in TIER_B_GROUPS:
        return "B"
    if industry_group in TIER_C_GROUPS:
        return "C"
    # Unknown industry groups — excluded by default (conservative).
    return "excluded"


def lead_tier_label(tier: LeadTier) -> str:
    """Human-readable label for a lead tier."""
    return {
        "A": "Tier A — Tech (high)",
        "B": "Tier B — Operating (medium)",
        "C": "Tier C — Other (low)",
        "excluded": "Excluded (RE / O&G)",
    }.get(tier, tier)


# ---------------------------------------------------------------------------
# Public API (M5 compatibility preserved)
# ---------------------------------------------------------------------------


def is_pooled_fund(industry_group: str | None) -> bool:
    """Return True if *industry_group* indicates a pooled investment vehicle."""
    if industry_group is None:
        return False
    return industry_group in POOLED_FUND_GROUPS


def is_tech_operating(industry_group: str | None, *, is_pooled_fund: bool) -> bool:
    """Return True if the offering is a tech operating company candidate."""
    if industry_group is None:
        return False
    if is_pooled_fund:
        return False
    return industry_group in TECH_OPERATING_GROUPS


def classify_offering(industry_group: str | None) -> dict[str, bool]:
    """Return {is_pooled_fund, is_tech_operating} for an industry_group string."""
    pooled = is_pooled_fund(industry_group)
    return {
        "is_pooled_fund": pooled,
        "is_tech_operating": is_tech_operating(industry_group, is_pooled_fund=pooled),
    }
