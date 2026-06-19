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
          const rows = db
            .prepare(
              `SELECT run_date, status, filings_seen, filings_stored
               FROM run_log ORDER BY run_date`
            )
            .all() as {
            run_date: string;
            status: string;
            filings_seen: number;
            filings_stored: number;
          }[];

          if (rows.length === 0) return;

          const latest = rows[rows.length - 1];
          const runningTotal = rows.reduce(
            (sum, r) => sum + r.filings_stored,
            0
          );
          const completeCount = rows.filter(
            (r) => r.status === "complete"
          ).length;

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "progress",
                current_date: latest.run_date,
                status: latest.status,
                filings_seen: latest.filings_seen,
                filings_stored: latest.filings_stored,
                running_total: runningTotal,
                dates_processed: completeCount,
              })}\n\n`
            )
          );

          // Check if process is still alive
          const fs = require("fs");
          const path = require("path");
          const pidFile = path.join(
            process.cwd(),
            "data",
            ".backfill-pid"
          );
          let alive = false;
          try {
            const pid = fs.readFileSync(pidFile, "utf-8").trim();
            try {
              process.kill(Number(pid), 0);
              alive = true;
            } catch {
              // dead
            }
          } catch {
            // no pid file
          }

          if (!alive && rows.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  total_filings: runningTotal,
                  dates_processed: rows.length,
                })}\n\n`
              )
            );
            controller.close();
            stopped = true;
            clearInterval(interval);
          }
        } catch {
          // DB locked — skip tick
        }
      };

      const interval = setInterval(sendProgress, 500);
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
