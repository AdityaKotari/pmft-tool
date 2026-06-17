"""CLI entry point via typer."""

from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path
from typing import Annotated

import duckdb
import typer

from fundscraper.analysis import (
    connect,
    deduped_leads,
    export_leads,
    export_leads_parquet,
    raises_by_industry,
    raises_by_state,
    run_summary,
    tier_distribution,
)
from fundscraper.config import Config
from fundscraper.filters import LeadTier, lead_tier_label
from fundscraper.pipeline import run_date

app = typer.Typer(no_args_is_help=True)
leads_app = typer.Typer(no_args_is_help=True)
app.add_typer(leads_app, name="leads", help="Lead export commands.")


@app.command()
def run(
    date: str = typer.Option(
        datetime.date.today().isoformat(),
        "--date",
        "-d",
        help="Date to fetch (YYYY-MM-DD). Defaults to today.",
    ),
) -> None:
    """Run the pipeline for a single date."""
    config = Config()
    result = run_date(date, config=config)
    typer.echo(
        f"Date: {date} | Seen: {result['filings_seen']} | Stored: {result['filings_stored']}"
    )


@app.command()
def init_db() -> None:
    """Create and migrate the database."""
    config = Config()
    from fundscraper.store import create_engine_for_path, init_db as _init_db

    create_engine_for_path(config.db_path)
    _init_db(config.db_path)
    typer.echo(f"Database initialized at {config.db_path}")


@app.command()
def export(
    output: str = typer.Option(
        ...,
        "--out",
        "-o",
        help="Output file path (.json).",
    ),
    format: str = typer.Option(
        "json",
        "--format",
        "-f",
        help="Output format (only 'json' supported).",
    ),
) -> None:
    """Export deduped tier-A leads as JSON for the fundraiser UI."""
    if format != "json":
        typer.echo("Only --format json is supported.", err=True)
        raise typer.Exit(1)

    config = Config()
    if not config.db_path.exists():
        typer.echo("No database found. Run 'fundscraper run' first.", err=True)
        raise typer.Exit(1)

    output_path = Path(output)
    con = connect(config.db_path)
    try:
        leads = deduped_leads(con, tiers={"A"})
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(leads, f, default=str)
        typer.echo(f"Exported {len(leads)} leads to {output_path}")
    finally:
        con.close()


@app.command()
def backfill(
    from_date: str = typer.Option(..., "--from", "-f", help="Start date (YYYY-MM-DD)."),
    to_date: str = typer.Option(..., "--to", "-t", help="End date (YYYY-MM-DD, inclusive)."),
    json_progress: Annotated[
        bool, typer.Option("--json-progress", help="Emit JSON progress lines to stdout")
    ] = False,
) -> None:
    """Run the pipeline over a date range (inclusive)."""
    config = Config()
    start = datetime.date.fromisoformat(from_date)
    end = datetime.date.fromisoformat(to_date)

    current = start
    while current <= end:
        date_str = current.isoformat()
        if json_progress:
            result = run_date(date_str, config=config)
            json.dump(
                {
                    "type": "progress",
                    "date": date_str,
                    "filings_seen": result["filings_seen"],
                    "filings_stored": result["filings_stored"],
                },
                sys.stdout,
            )
            sys.stdout.write("\n")
            sys.stdout.flush()
        else:
            typer.echo(f"Processing {date_str} ...")
            result = run_date(date_str, config=config)
            typer.echo(
                f"  {date_str}: seen={result['filings_seen']} stored={result['filings_stored']}"
            )
        current += datetime.timedelta(days=1)

    if json_progress:
        json.dump({"type": "complete"}, sys.stdout)
        sys.stdout.write("\n")
        sys.stdout.flush()
    else:
        typer.echo(f"Backfill complete: {from_date} → {to_date}")


@app.command()
def summary() -> None:
    """Print analysis summary (recent raises by industry, state, amounts)."""
    config = Config()
    if not config.db_path.exists():
        typer.echo("No database found. Run 'fundscraper run' first.")
        raise typer.Exit(1)

    con = connect(config.db_path)
    try:
        stats = run_summary(con)
        typer.echo("=== Overall ===")
        typer.echo(f"  Total filings:       {stats.get('total_filings', 0)}")
        typer.echo(f"  Unique issuers:      {stats.get('unique_issuers', 0)}")
        typer.echo(f"  Pooled funds:        {stats.get('pooled_funds', 0)}")
        typer.echo(f"  Operating companies: {stats.get('operating_companies', 0)}")
        typer.echo(f"  Avg offering:        ${stats.get('avg_offering', 0):,.0f}")
        typer.echo(f"  Total raised:        ${stats.get('total_raised', 0):,.0f}")

        typer.echo("\n=== Raises by Industry (operating cos only) ===")
        for row in raises_by_industry(con):
            typer.echo(
                f"  {row['industry_group']:<35} {row['count']:>4}  "
                f"${row['total_raised']:>12,}  "
                f"avg ${row['avg_offering']:>10,}"
            )

        typer.echo("\n=== Raises by State ===")
        for row in raises_by_state(con):
            typer.echo(
                f"  {row['state']:<10} {row['filings']:>4} filings  "
                f"{row['persons']:>4} persons  "
                f"${row['total_raised']:>12,}"
            )
    finally:
        con.close()


@leads_app.command("export")
def leads_export(
    output: str = typer.Option(
        "data/leads.csv",
        "--output",
        "-o",
        help="Output file path (.csv or .parquet).",
    ),
    include_tier_b: bool = typer.Option(
        False,
        "--include-tier-b",
        help="Include tier B (biotech, manufacturing, etc.).",
    ),
    include_tier_c: bool = typer.Option(
        False,
        "--include-tier-c",
        help="Include tier C (Other industry group).",
    ),
    include_excluded: bool = typer.Option(
        False,
        "--include-excluded",
        help="Include excluded groups (real estate, oil & gas).",
    ),
    deduped: bool = typer.Option(
        False,
        "--deduped",
        "-d",
        help="Dedup by CIK — one row per company with primary contact.",
    ),
) -> None:
    """Export operating-company leads with related persons.

    Defaults to tier A only (tech operating companies).
    """
    config = Config()
    if not config.db_path.exists():
        typer.echo("No database found. Run 'fundscraper run' first.")
        raise typer.Exit(1)

    tiers: set[LeadTier] = {"A"}
    if include_tier_b:
        tiers.add("B")
    if include_tier_c:
        tiers.add("C")
    if include_excluded:
        tiers.add("excluded")

    output_path = Path(output)
    con = connect(config.db_path)
    try:
        if deduped:
            _export_deduped(con, output_path, tiers)
        elif output_path.suffix == ".parquet":
            _ = export_leads_parquet(con, output_path)
            typer.echo(f"Exported to {output_path}")
        else:
            written = export_leads(con, output_path, tiers=tiers)
            typer.echo(f"Exported {written} rows to {output_path}")
    finally:
        con.close()


@leads_app.command("tiers")
def leads_tiers() -> None:
    """Show tier distribution of operating-company leads."""
    config = Config()
    if not config.db_path.exists():
        typer.echo("No database found. Run 'fundscraper run' first.")
        raise typer.Exit(1)

    con = connect(config.db_path)
    try:
        dist = tier_distribution(con)
        total = sum(dist.values())
        typer.echo(f"\nLead tier distribution ({total} total operating-company person rows):\n")
        for tier_key in ("A", "B", "C", "excluded"):
            count = dist[tier_key]
            pct = (count / total * 100) if total else 0
            label = lead_tier_label(tier_key)
            typer.echo(f"  {label:<35} {count:>5}  ({pct:5.1f}%)")
        typer.echo()
    finally:
        con.close()


def _export_deduped(
    con: duckdb.DuckDBPyConnection,
    output_path: Path,
    tiers: set[LeadTier],
) -> None:
    import csv

    leads = deduped_leads(con, tiers=tiers)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "company_name",
        "lead_tier",
        "industry_group",
        "form_type",
        "date_filed",
        "total_amount_sold",
        "total_offering_amount",
        "date_first_sale",
        "jurisdiction",
        "is_amendment",
        "primary_contact",
        "contact_type",
        "contact_city",
        "contact_state",
        "cik",
    ]
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(leads)
    typer.echo(f"Exported {len(leads)} companies to {output_path}")
