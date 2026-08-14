import { NextResponse } from "next/server";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

const PROJECT_ROOT = process.cwd();
const PIPELINE_DIR = path.join(PROJECT_ROOT, "pipeline");
const PYTHON_BIN = path.join(PIPELINE_DIR, ".venv", "bin", "python");

function loadEnvFile(): Record<string, string> {
  // Process env wins — in Docker the identity arrives via `--env-file`/
  // compose env_file and there is no .env file on disk.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }

  // .env file fills in anything not already set.
  const envPath = path.join(PROJECT_ROOT, ".env");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in env)) env[key] = value;
    }
  } catch {
    // .env not found — OK
  }
  return env;
}

export async function POST(req: Request) {
  let body: { from?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { from, to } = body;
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to dates are required" },
      { status: 400 }
    );
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: "dates must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "from date must be on or before to date" },
      { status: 400 }
    );
  }

  // Fail fast with an actionable error instead of a stuck progress spinner.
  if (!fs.existsSync(PYTHON_BIN)) {
    return NextResponse.json(
      { error: "Pipeline venv not found. Run `npm run pipeline:setup` first." },
      { status: 500 }
    );
  }

  const pidFile = path.join(PROJECT_ROOT, "data", ".backfill-pid");

  try {
    const existingPid = fs.readFileSync(pidFile, "utf-8");
    try {
      process.kill(Number(existingPid), 0);
      return NextResponse.json(
        { error: "A backfill is already in progress" },
        { status: 409 }
      );
    } catch {
      fs.unlinkSync(pidFile);
    }
  } catch {
    // No PID file — OK
  }

  const dbPath = path.join(PROJECT_ROOT, "data", "fundraises.db");
  const logFile = path.join(PROJECT_ROOT, "data", ".backfill-log");
  const dotEnv = loadEnvFile();

  const child: ChildProcess = spawn(PYTHON_BIN, [
    "-m",
    "fundscraper.cli",
    "backfill",
    "--from",
    from,
    "--to",
    to,
    "--json-progress",
  ], {
    cwd: PIPELINE_DIR,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/local/bin",
      HOME: process.env.HOME ?? "",
      FUNDRAISES_DB: dbPath,
      // docker --env-file/compose pass values with literal quotes — strip them.
      EDGAR_IDENTITY: (dotEnv.EDGAR_IDENTITY ?? "").replace(/^["']|["']$/g, ""),
      NODE_ENV: process.env.NODE_ENV ?? "development",
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logStream = fs.createWriteStream(logFile, { flags: "w" });
  if (child.stdout) {
    child.stdout.pipe(logStream);
  }

  if (child.stderr) {
    child.stderr.on("data", (data: Buffer) => {
      console.error(`[backfill stderr] ${data.toString().trim()}`);
    });
  }

  child.on("error", (err: Error) => {
    console.error("[backfill spawn error]", err);
    // Don't leave a stale PID file that blocks future backfills.
    try {
      fs.unlinkSync(pidFile);
    } catch {
      // Already gone
    }
  });

  child.on("exit", (code: number | null) => {
    console.log(`[backfill] process exited with code ${code}`);
    logStream.end();
  });

  fs.writeFileSync(pidFile, String(child.pid));

  child.unref();

  return NextResponse.json({
    status: "started",
    from,
    to,
  });
}

export async function GET() {
  const pidFile = path.join(PROJECT_ROOT, "data", ".backfill-pid");

  try {
    const pid = fs.readFileSync(pidFile, "utf-8");
    try {
      process.kill(Number(pid), 0);
      return NextResponse.json({ status: "running" });
    } catch {
      return NextResponse.json({ status: "finished" });
    }
  } catch {
    return NextResponse.json({ status: "not_started" });
  }
}
