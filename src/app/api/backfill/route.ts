import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const PROJECT_ROOT = process.cwd();
const PIPELINE_DIR = path.join(PROJECT_ROOT, "pipeline");
const PYTHON_BIN = path.join(PIPELINE_DIR, ".venv", "bin", "python");

function loadEnvFile(): Record<string, string> {
  const envPath = path.join(PROJECT_ROOT, ".env");
  const env: Record<string, string> = {};
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    // .env file not found — OK
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

  const pidFile = path.join(PROJECT_ROOT, "data", ".backfill-pid");

  // Check if a backfill is already running
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

  // Load env from .env file manually
  const dotEnv = loadEnvFile();

  const child = spawn(
    PYTHON_BIN,
    [
      "-m",
      "fundscraper.cli",
      "backfill",
      "--from",
      from,
      "--to",
      to,
      "--json-progress",
    ],
    {
      cwd: PIPELINE_DIR,
      env: {
        // Clean environment: only pass what's needed
        PATH: process.env.PATH || "/usr/bin:/bin:/usr/local/bin",
        HOME: process.env.HOME || "",
        FUNDRAISES_DB: dbPath,
        EDGAR_IDENTITY: dotEnv.EDGAR_IDENTITY || "",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const logStream = fs.createWriteStream(logFile, { flags: "w" });
  child.stdout?.pipe(logStream);

  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[backfill stderr] ${data.toString().trim()}`);
  });

  child.on("error", (err) => {
    console.error("[backfill spawn error]", err);
  });

  child.on("exit", (code) => {
    console.log(`[backfill] process exited with code ${code}`);
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
