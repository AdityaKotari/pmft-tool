# How to run Fundraises

Step-by-step setup for a fresh machine.

## Prerequisites

- **Node.js 22+** — https://nodejs.org
- **Python 3.12+** — https://python.org
- **uv** (Python package manager) — `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Setup

### 1. Clone and install

```bash
git clone https://github.com/username/fundraises-oss
cd fundraises-oss
npm install
```

### 2. Install Python dependencies

```bash
cd pipeline
uv sync
cd ..
```

### 3. Set your EDGAR identity

The SEC requires a name and email to access EDGAR data. Edit `.env`:

```bash
EDGAR_IDENTITY="Your Name you@example.com"
```

Or set it as an environment variable:

```bash
export EDGAR_IDENTITY="Your Name you@example.com"
```

### 4. Initialize the database

```bash
npm run db:init
```

This runs Alembic migrations and creates `data/fundraises.db`.

### 5. Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

## Onboarding

The first time you open the app, you'll see a 3-step onboarding wizard:

1. **EDGAR Identity** — confirm your name and email
2. **Date range** — pick how far back to pull filings (we recommend 30 days to start)
3. **Progress** — watch the backfill run. It takes ~2 minutes for 30 days of data.

The backfill is **kill-safe.** If you close the tab or restart the server,
re-running the backfill skips dates already completed.

## Pulling more data later

Click **Date Range** in the top-right corner of the dashboard. The panel shows:

- **Coverage** — which dates have been pulled, any gaps
- **Quick actions** — Today, Last 7 days, Last 30 days
- **Custom range** — pick any from/to dates

Click "Fill gaps" to automatically backfill any missing dates.

## Running scheduled daily pulls

On macOS, use launchd. Create a plist at `~/Library/LaunchAgents/com.fundraises.daily.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.fundraises.daily</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/fundraises-oss/pipeline/.venv/bin/python</string>
        <string>-m</string>
        <string>fundscraper.cli</string>
        <string>run</string>
        <string>--date</string>
        <string>$(date +%Y-%m-%d)</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>EDGAR_IDENTITY</key>
        <string>Your Name you@example.com</string>
        <key>FUNDRAISES_DB</key>
        <string>/path/to/fundraises-oss/data/fundraises.db</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>7</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>StandardOutPath</key>
    <string>/tmp/fundraises-daily.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/fundraises-daily.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.fundraises.daily.plist
```

On Linux, use cron:

```cron
0 7 * * 1-5 cd /path/to/fundraises-oss/pipeline && FUNDRAISES_DB=/path/to/fundraises-oss/data/fundraises.db EDGAR_IDENTITY="Name email@x.com" .venv/bin/python -m fundscraper.cli run --date $(date +\%Y-\%m-\%d) >> /tmp/fundraises-daily.log 2>&1
```

## Docker

```bash
docker compose up
```

The SQLite database is persisted on a Docker volume. Set `EDGAR_IDENTITY`
in your environment or `.env` before starting.

## Troubleshooting

### "EDGAR_IDENTITY environment variable is required"

Set it in `.env` or export it. The format is `"Name email@example.com"`.

### Backfill hangs or shows 0 filings

- Check if SEC EDGAR is accessible: https://www.sec.gov/cgi-bin/browse-edgar
- Weekends and holidays have fewer (or zero) filings
- The backfill is idempotent — re-running is safe

### Database locked errors

SQLite in WAL mode handles concurrent reads fine but only one writer.
If you see "database is locked," wait for the backfill to finish.

### "No database found"

Run `npm run db:init` to create and migrate the database.
