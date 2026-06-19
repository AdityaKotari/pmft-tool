# What's impressive about this project

- **Backfills 1,500+ SEC filings from scratch** — full ingestion pipeline with
  idempotent date-watermarked state, kill-safe resume, and SSE progress streaming

- **Detects amendments automatically** — Form D/A filings are paired with
  originals via CIK windowing; surfaced as inline badges: New, Sold ↑$4.3M,
  Target Changed, Amended

- **Zero-hardcoded filters** — every column, enum value, and filter preset is
  data-driven from `/api/schema`. Adding a new filterable field requires zero UI
  code changes

- **Python ingestion, TypeScript reads** — battle-tested `edgartools` pipeline
  (600+ lines of SEC XML parsing, fund detection, contact ranking) runs as a
  detached subprocess; TypeScript API routes query SQLite directly via
  `better-sqlite3` for instant reads

- **Single SQLite database as system of record** — no Postgres, no Redis, no
  ETL. DuckDB attaches to the same file for analytical queries. One file, zero
  infra

- **Fund leak detection** — pooled investment funds self-classify under
  operating-company industry groups. Multi-layer heuristics catch them:
  industry-group flags, entity-name regex (Fund, LP, SPV, REIT), recipient
  naturalness checks, crowdfunding SPV patterns

- **Contact ranking from raw SEC XML** — `edgartools` dropped the `relationship`
  attribute in 5.35.0. Contact selection now extracts officer/director tags
  directly from XML with a priority ranking: CEO/Founder → Executive Officer →
  Director → fallback

- **Median, not average** — summary cards show Median Company Raise instead of
  average, which gets destroyed by $5B mega-fund outliers

- **Onboarding wizard** — 3-step flow (identity → date range → live progress)
  replaces README-driven CLI setup. New users are guided to a working dashboard
  in under 2 minutes

- **Filter presets, not hardcoded tiers** — "Technology" is just a named
  FilterSpec. Users can switch to Biotech, All Operating Companies, or
  Everything. No code change needed for new sectors

- **Dynamic data table** — columns, sort order, visibility, and filter controls
  are all rendered from a schema endpoint. TanStack Table with server-side
  pagination and sorting

- **Open-source ready** — MIT license, one-command setup (`npm install && cd pipeline && uv sync && npm run dev`), Docker Compose for production, launchd/cron scheduling guides

- **All network access isolated to one Python module** — `ingest.py` is the only
  file that touches the internet. Every other module is pure data transformation.
  Tests use committed fixtures, no network needed

- **No framework sprawl** — 4 Python deps (edgartools, SQLAlchemy, Alembic,
  Typer), 1 native Node dep (better-sqlite3). No ORM in TypeScript, no state
  library, no CSS framework beyond Tailwind
