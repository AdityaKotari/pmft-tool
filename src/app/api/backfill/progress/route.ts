import { getDb } from "@/lib/db";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const db = getDb();
      let stopped = false;

      const sendProgress = () => {
        if (stopped) return;

        try {
          const latest = db
            .prepare(
              `SELECT run_date, status, filings_seen, filings_stored
               FROM run_log
               ORDER BY run_date DESC
               LIMIT 1`
            )
            .get() as
            | {
                run_date: string;
                status: string;
                filings_seen: number;
                filings_stored: number;
              }
            | undefined;

          if (latest) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "progress",
                  current_date: latest.run_date,
                  status: latest.status,
                  filings_seen: latest.filings_seen,
                  filings_stored: latest.filings_stored,
                })}\n\n`
              )
            );

            // Check if backfill process is still running
            const fs = require("fs");
            const path = require("path");
            const pidFile = path.join(process.cwd(), "data", ".backfill-pid");
            let processRunning = false;
            try {
              const pid = fs.readFileSync(pidFile, "utf-8").trim();
              try {
                process.kill(Number(pid), 0);
                processRunning = true;
              } catch {
                // Process is dead
              }
            } catch {
              // No PID file
            }

            if (!processRunning) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "complete" })}\n\n`
                )
              );
              controller.close();
              stopped = true;
              clearInterval(interval);
              return;
            }
          }
        } catch {
          // DB might be locked during writes — skip this tick
        }
      };

      const interval = setInterval(sendProgress, 500);

      // Safety timeout: 30 minutes
      setTimeout(() => {
        stopped = true;
        clearInterval(interval);
        controller.close();
      }, 30 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
