# Private Market Fundraising Signals

Discover companies raising capital from SEC Form D filings. Backfill, filter, and
track amendments — all from a single SQLite database.

## Quick start

```bash
git clone https://github.com/username/fundraises-oss
cd fundraises-oss

# 1. Install dependencies
npm install
cd pipeline && uv sync && cd ..

# 2. Initialize the database
npm run db:init

# 3. Start the dev server
npm run dev
```

Open **http://localhost:3000**. The onboarding wizard walks you through
setting your EDGAR identity and running your first backfill.

## What it does

- **Pulls SEC Form D filings** (private capital raises) via `edgartools`
- **Filters out pooled investment funds** (the majority of Form D volume)
  using industry-group flags and entity-name heuristics
- **Tracks amendments** — detects when companies update their raise
  amounts, offering targets, or contacts in Form D/A filings
- **Exports leads** with primary contacts (officers/directors) ranked by
  role seniority

## Architecture

```
fundraises-oss/
├── src/
│   ├── app/                    # Next.js 16 App Router
│   │   ├── api/                # REST API routes (better-sqlite3)
│   │   ├── dashboard/          # Lead browser with dynamic filters
│   │   └── onboarding/         # First-run wizard
│   ├── components/             # React components
│   └── lib/                    # DB, query builder, types, schema
├── pipeline/                   # Python ingestion pipeline
│   ├── fundscraper/            # EDGAR access, parsing, fund detection
│   ├── migrations/             # Alembic schema migrations
│   └── tests/                  # pytest suite (no network needed)
└── data/                       # SQLite DB (gitignored)
```

**Read path:** TypeScript → `better-sqlite3` → SQLite. Instant queries.

**Write path:** TypeScript spawns Python subprocess → `edgartools` → SEC EDGAR.
Backfills are idempotent (dates already in `run_log` are skipped).

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | DB status, filing count, date range |
| `GET /api/schema` | Available columns, filter presets, enum values |
| `GET /api/leads` | Paginated, filtered, sorted leads |
| `GET /api/summary` | Aggregate stats (total raised, median, amendments) |
| `GET /api/amendments` | Per-filing signals (new, amended, amount changed) |
| `POST /api/backfill` | Start a backfill for a date range |
| `GET /api/backfill/progress` | SSE stream of backfill progress |
| `GET /api/backfill/coverage` | Date coverage, gaps, history |

## Filter presets

Filters are named presets — not hardcoded tiers. The default preset is
**Technology** (software, infrastructure, telecom). Switch to:

- **Biotech & Pharma** — biotech and pharmaceutical companies
- **All Operating Companies** — everything except funds/REITs/SPVs
- **Everything** — no filters, includes investment vehicles

The filter UI renders dynamically from the `/api/schema` columns, so
adding new filterable fields requires no UI code changes.

## Development

```bash
npm run dev        # Next.js dev server on :3000
npm run build      # Production build
npm run db:init    # Initialize/migrate the database
npm run db:backfill -- --from 2026-01-01 --to 2026-01-31  # CLI backfill

# Pipeline tests (no EDGAR access needed)
cd pipeline && uv run pytest
```

## Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind v4, TanStack Table
- **Backend:** Next.js API routes, better-sqlite3
- **Pipeline:** Python 3.12+, edgartools 5.35.0, SQLAlchemy 2.0, Alembic, DuckDB
- **Database:** SQLite (WAL mode, single file)

## Data quality

- **Contacts** are officers/directors listed on Form D — not vetted
  fundraising contacts. Form D does not include email or phone.
- **Amounts** use the latest filing per company. Amendments are tracked
  separately. Pooled investment funds, REITs, and SPVs are excluded
  from operating-company totals.
- **Industry groups** come from the SEC's own taxonomy ("Other
  Technology," "Biotechnology," etc.) and are not enriched.

## Known limits

- Form D gives a person's name + city/state, NO email — enrichment
  needed for contact info
- A filing proves a capital raise, not hiring or visa sponsorship
- edgartools is pinned to 5.35.0 (releases frequently, APIs break)

## License

MIT
