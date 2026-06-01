"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePersistedState } from "./_use-persisted-state";

// Rough estimate: TTS narration averages ~150 words per minute
const WORDS_PER_MINUTE = 150;

// Per-job time estimates (in seconds), empirically tuned from production runs
const AVG_TTS_SEC = 4;
const AVG_PEXELS_SEC = 6;
const AVG_CLIP_RENDER_SEC = 8;

interface StatsResp {
  keyConfigured: number;
  ttsConcurrency: number;
  animConcurrency: number;
  assembleConcurrency: number;
}

export default function NewRunPage() {
  const [title, setTitle] = usePersistedState("newrun.title", "");
  const [script, setScript] = usePersistedState("newrun.script", "");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<StatsResp | null>(null);

  const router = useRouter();

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const scriptStats = useMemo(() => {
    const text = script.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const seconds = (words / WORDS_PER_MINUTE) * 60;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return {
      words,
      chars,
      duration: words === 0 ? "—" : m > 0 ? `~${m} min ${s} s` : `~${s} s`,
      scenes: Math.max(1, Math.round(seconds / 5)),
    };
  }, [script]);

  const timeEstimate = useMemo(() => {
    if (!stats || scriptStats.scenes === 0) return null;
    const N = scriptStats.scenes;
    const ttsMin = (Math.ceil(N / stats.ttsConcurrency) * AVG_TTS_SEC) / 60;
    const animMin = (Math.ceil(N / stats.animConcurrency) * AVG_PEXELS_SEC) / 60;
    const phase1 = Math.max(ttsMin, animMin);
    const phase2 = (Math.ceil(N / stats.assembleConcurrency) * AVG_CLIP_RENDER_SEC) / 60;
    return { total: phase1 + phase2, phase1, phase2, ttsMin, animMin };
  }, [stats, scriptStats]);

  async function start() {
    setBusy(true);
    try {
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, script }),
      });
      if (!r.ok) {
        alert(`Error: ${await r.text()}`);
        return;
      }
      const data = (await r.json()) as { id: string };
      router.push(`/runs/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Video Conveyer</h1>
      <p className="muted" style={{ marginBottom: 24, fontSize: 14 }}>
        Paste a script — the system splits it into scenes, generates voiceover and matches Pexels
        stock footage per scene, then assembles the final MP4.
      </p>

      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div>
          <label className="label">Title (optional)</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Okinawa Longevity — Test 1"
          />
        </div>

        <div>
          <label className="label">Script</label>
          <textarea
            className="textarea"
            rows={14}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste the full narrator script here..."
          />
          <div
            style={{
              display: "flex",
              gap: 18,
              marginTop: 10,
              fontSize: 13,
              color: "var(--fg-muted)",
              flexWrap: "wrap",
            }}
          >
            <span>
              <strong style={{ color: "var(--fg)" }}>{scriptStats.words}</strong> words
            </span>
            <span>
              <strong style={{ color: "var(--fg)" }}>{scriptStats.chars}</strong> chars
            </span>
            <span>
              ≈ <strong style={{ color: "var(--accent-hover)" }}>{scriptStats.duration}</strong> final video
            </span>
            <span>
              ≈ <strong style={{ color: "var(--fg)" }}>{scriptStats.scenes}</strong> scenes
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={start} disabled={busy || !script.trim()}>
            {busy ? "Starting…" : "Run pipeline"}
          </button>
        </div>
      </div>

      {/* ─── Time estimate ───────────────────────────────────────────────── */}
      {timeEstimate && stats && scriptStats.words > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Estimated time</h2>
            <span
              style={{
                color: "var(--accent-hover)",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              ~{timeEstimate.total < 1 ? "<1" : Math.round(timeEstimate.total)} min
            </span>
          </div>
          <div style={{ color: "var(--fg-muted)", fontSize: 13, lineHeight: 1.8 }}>
            <div>
              <strong style={{ color: "var(--fg)" }}>Parallel generation</strong>
              {" (TTS + Pexels)"}: ~{Math.round(timeEstimate.phase1)} min
              <span className="faint" style={{ marginLeft: 8 }}>
                {stats.animConcurrency} Pexels / {stats.ttsConcurrency} TTS in parallel
              </span>
            </div>
            <div>
              <strong style={{ color: "var(--fg)" }}>FFmpeg assembly</strong>: ~
              {Math.round(timeEstimate.phase2 * 10) / 10} min
              <span className="faint" style={{ marginLeft: 8 }}>
                {stats.assembleConcurrency} clips at once
              </span>
            </div>
          </div>
          <div className="faint" style={{ fontSize: 11, marginTop: 9 }}>
            Rough numbers — real runs are usually 10–30% faster.
          </div>
        </div>
      )}

      {/* ─── How it works ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginBottom: 8 }}>What happens next</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 1.75, margin: 0, color: "var(--fg-muted)", fontSize: 13.5 }}>
          <li>Gemini splits the script into scenes, each with a visual prompt.</li>
          <li>Per scene, ai33pro narration (ElevenLabs voice) and a Pexels stock clip generate in parallel.</li>
          <li>FFmpeg stitches all clips together with crossfade transitions.</li>
        </ol>
        <p className="faint" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
          Live logs for every stage stream into the run page in real time.
        </p>
      </div>
    </div>
  );
}
