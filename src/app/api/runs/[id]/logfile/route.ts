import { getLogs } from "@/lib/logger";
import { ensureInit } from "@/lib/init";

/**
 * Downloads the COMPLETE run log as a plain-text file.
 *
 * The live run page only shows the most recent ~500 lines (so the browser
 * doesn't choke on 10 000-line runs). This endpoint returns EVERYTHING from
 * the run_logs table, formatted for reading, as a downloadable .txt — so a
 * full log can always be sent for diagnosis no matter how long the run was.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureInit();
  const { id } = await ctx.params;

  const entries = getLogs(id);

  const lines = entries.map((e) => {
    // Local HH:MM:SS to match what the user sees on the page.
    let time = e.ts;
    try {
      time = new Date(e.ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {}
    const stage = e.stage ? `[${e.stage}]` : "";
    const level = e.level.toUpperCase().padEnd(7);
    let line = `${time} ${stage} ${level} ${e.message}`;
    if (e.data !== undefined && e.data !== null) {
      try {
        line += `  ${JSON.stringify(e.data)}`;
      } catch {}
    }
    return line;
  });

  const header = [
    `Conveyer run log`,
    `Run ID: ${id}`,
    `Total log lines: ${entries.length}`,
    `Exported: ${new Date().toISOString()}`,
    `${"=".repeat(60)}`,
    "",
  ].join("\n");

  const body = header + lines.join("\n") + "\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="conveyer-log-${id.slice(0, 8)}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
