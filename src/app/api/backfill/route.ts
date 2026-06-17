import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

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

  const pipelineDir = path.join(process.cwd(), "pipeline");
  const pidFile = path.join(process.cwd(), "data", ".backfill-pid");
  const fs = await import("fs/promises");

  // Check if a backfill is already running
  try {
    const existingPid = await fs.readFile(pidFile, "utf-8");
    try {
      process.kill(Number(existingPid), 0);
      return NextResponse.json(
        { error: "A backfill is already in progress" },
        { status: 409 }
      );
    } catch {
      await fs.unlink(pidFile).catch(() => {});
    }
  } catch {
    // No PID file — OK
  }

  const dbPath =
    process.env.FUNDRAISES_DB ||
    path.join(process.cwd(), "data", "fundraises.db");

  const child = spawn(
    "uv",
    [
      "run",
      "fundscraper",
      "backfill",
      "--from",
      from,
      "--to",
      to,
      "--json-progress",
    ],
    {
      cwd: pipelineDir,
      env: {
        ...process.env,
        FUNDRAISES_DB: dbPath,
        EDGAR_IDENTITY: process.env.EDGAR_IDENTITY || "",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  // Pipe stdout to a log file
  const logFile = path.join(process.cwd(), "data", ".backfill-log");
  const { createWriteStream } = await import("fs");
  const logStream = createWriteStream(logFile, { flags: "w" });
  child.stdout?.pipe(logStream);

  // Pipe stderr for debugging
  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[backfill stderr] ${data.toString()}`);
  });

  await fs.writeFile(pidFile, String(child.pid));

  child.unref();

  return NextResponse.json({
    status: "started",
    from,
    to,
  });
}

export async function GET() {
  const pidFile = path.join(process.cwd(), "data", ".backfill-pid");
  const fs = await import("fs/promises");

  try {
    const pid = await fs.readFile(pidFile, "utf-8");
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
