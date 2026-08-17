# Fundraises

Private-market fundraising signals from SEC Form D filings. A Next.js
dashboard over one SQLite file, fed by a Python pipeline that pulls EDGAR
data. Self-hosted, single user.

## Next.js warning

This repo ships a modified Next.js with breaking changes: APIs, conventions,
and file structure may all differ from upstream. Before writing any Next.js
code, read the relevant guide in `node_modules/next/dist/docs/`. Heed
deprecation notices.

## Commands

```bash
npm run dev                 # dev server on :3000
npm run build               # production build
npm run lint                # eslint (flat config)
npm run db:init             # run Alembic migrations, create data/fundraises.db
npm run db:backfill -- --from 2026-01-01 --to 2026-01-31

# Pipeline (from pipeline/)
uv sync                     # install the Python env
uv run pytest               # tests, offline via tests/fixtures/
uv run ruff check           # lint
uv run mypy fundscraper/    # types
uv run fundscraper --help   # run, init-db, backfill, export, summary, leads
uv run alembic revision --autogenerate -m "add X"
```

## Layout

```
src/
  app/api/          # REST routes over better-sqlite3
  app/dashboard/    # lead browser
  app/onboarding/   # first-run wizard (EDGAR identity, first backfill)
  components/       # data table, filter panel, backfill panel, ui primitives
  lib/              # db, query builder, schema
pipeline/
  fundscraper/      # edgartools ingestion, fund filtering, analysis, store
  migrations/       # Alembic versions
  tests/fixtures/   # offline test data
data/               # SQLite db (gitignored)
```

## Read and write paths

- Read: TS API routes query SQLite directly through better-sqlite3. No ORM,
  no cache.
- Write: `src/app/api/backfill/route.ts` spawns the Python CLI as a
  subprocess; it talks to EDGAR and writes rows. Backfills are idempotent:
  dates already in `run_log` are skipped.

## Environment

- `EDGAR_IDENTITY="Name email@example.com"`: required by the SEC for EDGAR
  access. Commands that touch EDGAR fail without it; read-only commands do
  not.
- `FUNDRAISES_DB`: db path. Relative paths resolve against the repo root.
- `FUNDSCRAPER_ACCESS_MODE`: `readonly` (default) or `readwrite`.
- The CLI loads the repo-root `.env` itself, missing vars only. Never commit
  a real identity or share one server-side.

## Conventions

- SQLite runs in WAL mode with a single writer. Backfills hold the write
  lock; API routes use a busy timeout. No second writer, no long
  transactions.
- edgartools is pinned exactly. It ships often and breaks APIs; do not bump
  without checking.
- A new filterable column needs five changes: an Alembic migration,
  population in `pipeline/fundscraper/adapter.py`, the column in
  `src/lib/schema.ts`, `FILTERABLE_*_COLUMNS` in
  `src/components/filter-panel.tsx`, and `ALLOWED_SORT_COLUMNS` in
  `src/lib/query-builder.ts`. The filter UI renders from `/api/schema`, so no
  other UI changes are needed.
- Pipeline tests run offline against fixtures; never add a test that needs
  EDGAR.
- No framework dependencies in Python; flag cost before adding an npm
  package.
