# Contributing

## Setup

```bash
git clone https://github.com/username/fundraises-oss
cd fundraises-oss
npm install
cd pipeline && uv sync --group dev && cd ..
npm run db:init
```

## Code layout

| Path | Concern |
|---|---|
| `src/app/api/` | REST API routes (Next.js route handlers) |
| `src/app/dashboard/` | Lead browser page |
| `src/app/onboarding/` | First-run wizard |
| `src/components/` | React components (data table, filters, backfill panel) |
| `src/lib/db.ts` | better-sqlite3 singleton |
| `src/lib/query-builder.ts` | Dynamic SQL from FilterSpec |
| `src/lib/schema.ts` | Column definitions + filter presets |
| `src/lib/types.ts` | TypeScript interfaces |
| `pipeline/fundscraper/` | Python ingestion pipeline |
| `pipeline/fundscraper/models.py` | SQLAlchemy ORM models |
| `pipeline/fundscraper/adapter.py` | Form D → ORM row mapping |
| `pipeline/fundscraper/filters.py` | Fund detection heuristics |
| `pipeline/fundscraper/pipeline.py` | Per-date orchestration |
| `pipeline/fundscraper/ingest.py` | edgartools SEC access wrapper |
| `pipeline/fundscraper/store.py` | Engine, upsert helpers, Alembic init |
| `pipeline/fundscraper/cli.py` | Typer CLI (used by backfill subprocess) |

## Before committing

```bash
npx tsc --noEmit         # TypeScript
npm run build            # Next.js build
cd pipeline && uv run ruff check && uv run mypy fundscraper/ && uv run pytest
```

## Adding a column

1. Add the mapped field to `pipeline/fundscraper/models.py`
2. Generate migration: `cd pipeline && uv run alembic revision --autogenerate -m "add X"`
3. Apply: `uv run alembic upgrade head`
4. Update `pipeline/fundscraper/adapter.py` to populate it
5. Add to `src/lib/schema.ts` COLUMNS array
6. If filterable, add to `FILTERABLE_*_COLUMNS` in `src/components/filter-panel.tsx`
7. If queryable, add to `ALLOWED_SORT_COLUMNS` in `src/lib/query-builder.ts`
8. Update `README.md` schema section if needed

## Adding a filter preset

Add an entry to `PRESETS` in `src/lib/schema.ts`. The `filters` field is a
partial `FilterSpec` — the UI will pre-populate filters when that preset
is selected.

## Tests

### TypeScript
No test suite yet. API routes are testable with `node --test` or vitest.

### Python
```bash
cd pipeline && uv run pytest
```

Tests use tempfile SQLite databases — no network, no EDGAR_IDENTITY needed.
The smoke test (`test_ingest_smoke.py`) requires network and is skipped by default.
Run with `--run-network` if needed.

## Dependency policy

- edgartools is pinned to exact version (5.35.0). It ships often and breaks APIs.
- No framework dependencies in Python. Prefer stdlib.
- Flag cost before adding a new npm package.

## Data model

See `pipeline/fundscraper/models.py` for the SQLAlchemy ORM. The database
has five tables:

- `filings` — one row per EDGAR submission (accession number = PK)
- `offerings` — economic terms of the raise (1:1 with filings)
- `related_persons` — officers/directors listed on Form D
- `issuers` — CIK-level dedup
- `run_log` — per-date watermark for idempotent backfills
