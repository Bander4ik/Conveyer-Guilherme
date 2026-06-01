"use client";
import { useEffect, useRef, useState, use } from "react";

interface LogEntry {
  id?: number;
  ts: string;
  level: "info" | "warn" | "error" | "success" | "debug";
  stage?: string;
  message: string;
  data?: unknown;
}
interface Run {
  id: string;
  title: string | null;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  output_path: string | null;
}
interface SceneAsset {
  index: number;
  audio?: { name: string; size: number };
  image?: { name: string; size: number };
  animation?: { name: string; size: number };
  clip?: { name: string; size: number };
}
interface AssetsResponse {
  runDir: string;
  scenes: SceneAsset[];
  finalExists: boolean;
  finalSize: number;
}

// Sliding window cap on the visible log buffer. A 1 000+ scene run can
// generate 10 000+ log rows; keeping every single one in React state pegs the
// browser (DOM rendering + reconciliation on each new SSE event). 500 is
// enough for the live-activity feed; the full history lives in run_logs.
const LOG_DISPLAY_CAP = 500;

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [assets, setAssets] = useState<AssetsResponse | null>(null);
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/runs/${id}/logs`);
    es.addEventListener("log", (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as LogEntry;
      setLogs((prev) => {
        const next = [...prev, e];
        return next.length > LOG_DISPLAY_CAP ? next.slice(-LOG_DISPLAY_CAP) : next;
      });
    });
    return () => es.close();
  }, [id]);

  useEffect(() => {
    let alive = true;
    async function tick() {
      const [runR, assetsR] = await Promise.all([
        fetch(`/api/runs/${id}`).then((r) => r.json()),
        fetch(`/api/runs/${id}/assets`).then((r) => r.json()),
      ]);
      if (!alive) return;
      setRun(runR.run as Run);
      setAssets(assetsR as AssetsResponse);
    }
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  useEffect(() => {
    tail.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  async function cancel() {
    if (!confirm("Stop this run? Already generated files stay on disk, but no new progress will be made.")) return;
    await fetch(`/api/runs/${id}/cancel`, { method: "POST" });
  }

  async function openFolder() {
    try {
      const r = await fetch(`/api/runs/${id}/open-folder`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        alert(`Failed to open folder: ${j.error}\n\nPath: ${j.runDir || ""}`);
        return;
      }
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    }
  }

  const fileUrl = (p: string, dl = false) =>
    `/api/runs/${id}/file?p=${encodeURIComponent(p)}${dl ? "&download=1" : ""}`;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ marginBottom: 2 }}>{run?.title || `Run ${id.slice(0, 8)}`}</h1>
          <div className="mono faint" style={{ fontSize: 11.5 }}>{id}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {(run?.status === "running" || run?.status === "pending") && (
            <button className="btn-danger btn-sm" onClick={cancel}>
              Stop
            </button>
          )}
          {run && <span className={`tag tag-${run.status}`}>{run.status}</span>}
        </div>
      </div>

      {/* ─── Final video ────────────────────────────────────────────────── */}
      {assets?.finalExists && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Final video</h2>
              <div className="faint" style={{ fontSize: 12 }}>
                {(assets.finalSize / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="btn" href={fileUrl("final.mp4", true)}>
                Download MP4
              </a>
              <button className="btn-secondary" onClick={openFolder}>
                Open folder
              </button>
            </div>
          </div>
          <video
            controls
            style={{ width: "100%", maxHeight: 480, borderRadius: "var(--r-sm)", background: "#000" }}
            src={fileUrl("final.mp4")}
          />
        </div>
      )}

      {/* ─── Logs ───────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontWeight: 650,
            fontSize: 13,
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span>Live logs</span>
          <a
            className="btn-secondary btn-sm"
            href={`/api/runs/${id}/logfile`}
            title="Download the COMPLETE log as a text file (the view above only shows the latest lines). Send this file if you hit an error."
          >
            ⬇ Download full log
          </a>
        </div>
        <div
          className="mono"
          style={{
            background: "var(--bg-deep)",
            maxHeight: 420,
            overflowY: "auto",
            fontSize: 11.5,
            padding: "10px 16px",
            lineHeight: 1.7,
          }}
        >
          {logs.length === 0 && <div className="faint">Waiting for logs…</div>}
          {logs.map((l, i) => (
            <div key={l.id ?? i}>
              <span className="faint">{new Date(l.ts).toLocaleTimeString()}</span>{" "}
              {l.stage && <span style={{ color: "var(--accent-hover)" }}>[{l.stage}]</span>}{" "}
              <span style={{ color: levelColor(l.level), fontWeight: 600 }}>{l.level.toUpperCase()}</span>{" "}
              <span style={{ color: "var(--fg-muted)" }}>{l.message}</span>
            </div>
          ))}
          <div ref={tail} />
        </div>
      </div>

      {/* ─── Scene assets ───────────────────────────────────────────────── */}
      {assets && assets.scenes.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Scene assets · {assets.scenes.length}</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 10,
            }}
          >
            {assets.scenes.map((s) => (
              <div key={s.index} className="card-inset" style={{ padding: 10 }}>
                <div style={{ fontWeight: 650, fontSize: 12.5, marginBottom: 7 }}>Scene #{s.index}</div>
                {s.image && (
                  <a href={fileUrl(`images/${s.image.name}`, true)} title="Download image">
                    <img
                      src={fileUrl(`images/${s.image.name}`)}
                      alt={`scene ${s.index}`}
                      style={{ width: "100%", borderRadius: 6, display: "block" }}
                    />
                  </a>
                )}
                {s.audio && (
                  <audio
                    controls
                    src={fileUrl(`audio/${s.audio.name}`)}
                    style={{ width: "100%", marginTop: 7 }}
                  />
                )}
                <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                  {s.audio && (
                    <a href={fileUrl(`audio/${s.audio.name}`, true)} className="btn-ghost btn-sm">
                      mp3
                    </a>
                  )}
                  {s.animation && (
                    <a href={fileUrl(`animations/${s.animation.name}`, true)} className="btn-ghost btn-sm">
                      clip
                    </a>
                  )}
                  {s.clip && (
                    <a href={fileUrl(`clips/${s.clip.name}`, true)} className="btn-ghost btn-sm">
                      rendered
                    </a>
                  )}
                  {s.image && (
                    <a href={fileUrl(`images/${s.image.name}`, true)} className="btn-ghost btn-sm">
                      img
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function levelColor(l: LogEntry["level"]) {
  switch (l) {
    case "error":
      return "var(--danger)";
    case "warn":
      return "var(--warning)";
    case "success":
      return "var(--success)";
    case "debug":
      return "var(--fg-faint)";
    default:
      return "var(--accent-hover)";
  }
}
