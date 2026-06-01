import fs from "node:fs";
import { getSetting } from "../settings";
import { log, type LogLevel } from "../logger";

/**
 * 69labs.vip API client — TTS ONLY, single key.
 *
 * The full 69labs platform also does images + videos and supports a multi-key
 * account pool, but Conveyer Guilherme only needs the TTS path: it uses 69labs
 * purely as an alternate gateway to the SAME ElevenLabs voices that ai33.pro
 * serves. So this is the slimmed-down client — one `LABS69_API_KEY`, the three
 * TTS calls (create → poll → download), and the rate-limit handling intact.
 *
 * A single API key (vk_...) is read from the `LABS69_API_KEY` setting. To stay
 * forgiving of a key pasted with stray newlines/commas we take the FIRST token.
 *
 * Docs:    https://69labs.vip/api-docs
 * OpenAPI: https://69labs.vip/api/docs/openapi.yaml
 */

const BASE = "https://69labs.vip/api/v1";
const POLL_INTERVAL_MS = 2500;
// A long single-shot narration can take a couple of minutes to synthesise.
// 8 min is enough headroom without keeping zombie polls alive forever.
const POLL_MAX_MS = 8 * 60 * 1000;

type JobKind = "tts";
type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "FINALIZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "CENSORED";

/**
 * Reads the single 69labs API key. The user pastes one `vk_...` key; we accept
 * a value pasted with stray newlines/commas/semicolons by taking the first
 * non-empty token.
 */
function getKey(): string {
  const first = getSetting("LABS69_API_KEY")
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean)[0];
  if (!first) throw new Error("LABS69_API_KEY is not set (Settings)");
  return first;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getKey()}`,
    "Content-Type": "application/json",
  };
}

// Rate-limit handling. 69labs caps creation throughput per hour. Instead of
// failing the run when the cap hits, we retry every 10 minutes until it clears
// (honouring a shorter `Retry-After` header if present). The repeated 10-min
// log heartbeat lets the operator see the run is still alive.
//
// 429 = the documented "too many requests" status. 403 with a body matching
// "hourly|credit limit|concurrent" is what 69labs actually returns when the
// per-hour cap is reached — treated identically. Non-throttle errors propagate.
const RATE_LIMIT_MAX_RETRIES = 30; // 30 × 10 min = up to 5h total wait
const RATE_LIMIT_WAIT_MS = 10 * 60_000; // 10 min between retries

/**
 * POST helper. Transparently waits out HTTP 429 / 403-hourly-cap responses
 * instead of failing the run. Non-throttle errors propagate immediately.
 */
async function postJson<T>(
  path: string,
  body: unknown,
  ctx?: { runId: string; stage: string }
): Promise<T> {
  let rateRetry = 0;
  while (true) {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.ok) return (await r.json()) as T;

    // Throttle detection: 429 always; 403 only when body matches the 69labs
    // hourly-cap / concurrent-limit text. Reading the body once serves both
    // detection and the eventual error message.
    let throttle = false;
    let errText = "";
    if (r.status === 429) {
      throttle = true;
      errText = await r.text();
    } else if (r.status === 403) {
      errText = await r.text();
      if (/hourly|credit limit|concurrent/i.test(errText)) throttle = true;
    }

    if (throttle && rateRetry < RATE_LIMIT_MAX_RETRIES) {
      rateRetry++;
      const retryAfter = Number(r.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter * 1000 < RATE_LIMIT_WAIT_MS
          ? retryAfter * 1000
          : RATE_LIMIT_WAIT_MS;
      if (ctx) {
        const waitText =
          waitMs >= 60_000
            ? `${Math.round(waitMs / 60_000)} min`
            : `${Math.round(waitMs / 1000)}s`;
        log(
          ctx.runId,
          "warn",
          `69labs rate limit (${r.status}) — retrying in ${waitText} (attempt ${rateRetry}/${RATE_LIMIT_MAX_RETRIES})`,
          { stage: ctx.stage }
        );
      }
      await sleep(waitMs);
      continue;
    }

    throw new Error(
      `69labs POST ${path} ${r.status}: ${(errText || (await r.text())).slice(0, 400)}`
    );
  }
}

interface JobCreatedResponse {
  id: string;
  status?: JobStatus;
  queuePosition?: number | null;
}

// ── TTS ─────────────────────────────────────────────────────────────────────

/** TTS: create a job. Returns jobId. Supports elevenlabs / edgetts / voice-clone. */
export async function createTtsJob(opts: {
  text: string;
  voiceId: string;
  voiceProvider?: "elevenlabs" | "edgetts" | "voice-clone";
  modelId?: string;
  splitType?: "smart" | "paragraphs" | "max_length";
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    speed?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  autoPauseEnabled?: boolean;
  autoPauseDuration?: number;
  autoPauseFrequency?: number;
  /** Optional — enables rate-limit (429) wait logging into the run log. */
  runId?: string;
}): Promise<string> {
  const ctx = opts.runId ? { runId: opts.runId, stage: "tts" } : undefined;

  // Voice-clone uses a different endpoint.
  if (opts.voiceProvider === "voice-clone") {
    const resp = await postJson<JobCreatedResponse>(
      "/voice-clones/generate",
      { voiceCloneId: opts.voiceId, text: opts.text },
      ctx
    );
    return resp.id;
  }

  const body: Record<string, unknown> = {
    text: opts.text,
    voiceId: opts.voiceId,
    splitType: opts.splitType ?? "smart",
  };
  if (opts.voiceProvider) body.voiceProvider = opts.voiceProvider;
  if (opts.modelId) body.modelId = opts.modelId;
  if (opts.voiceSettings && Object.keys(opts.voiceSettings).length > 0) {
    body.voiceSettings = opts.voiceSettings;
  }
  if (opts.autoPauseEnabled) {
    body.autoPauseEnabled = true;
    if (opts.autoPauseDuration !== undefined) body.autoPauseDuration = opts.autoPauseDuration;
    if (opts.autoPauseFrequency !== undefined) body.autoPauseFrequency = opts.autoPauseFrequency;
  }
  const resp = await postJson<JobCreatedResponse>("/tts/generate", body, ctx);
  return resp.id;
}

// ── Polling / download ────────────────────────────────────────────────────────

/** Polls a job until COMPLETED or FAILED. */
export async function pollJob(
  kind: JobKind,
  jobId: string,
  runId: string,
  stage: string,
  level: LogLevel = "debug"
): Promise<void> {
  const start = Date.now();
  while (true) {
    const r = await fetch(`${BASE}/${kind}/status/${jobId}`, { headers: authHeaders() });
    if (!r.ok) {
      // A 429 on the status endpoint is transient — back off and keep polling
      // rather than failing the job.
      if (r.status === 429) {
        await sleep(POLL_INTERVAL_MS * 4);
        continue;
      }
      throw new Error(
        `69labs status ${kind}/${jobId} ${r.status}: ${(await r.text()).slice(0, 200)}`
      );
    }
    const json = (await r.json()) as { status: JobStatus; userMessage?: string | null };
    if (level !== "debug") {
      log(runId, level, `${kind} ${jobId.slice(0, 8)} → ${json.status}`, { stage });
    }
    if (json.status === "COMPLETED") return;
    if (json.status === "FAILED" || json.status === "CANCELLED" || json.status === "CENSORED") {
      throw new Error(
        `69labs ${kind} job ${jobId} ${json.status}${json.userMessage ? `: ${json.userMessage}` : ""}`
      );
    }
    if (Date.now() - start > POLL_MAX_MS) {
      throw new Error(`69labs ${kind} job ${jobId} exceeded ${POLL_MAX_MS / 1000}s polling timeout`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Downloads a completed job's output to `outPath`. */
export async function downloadJob(kind: JobKind, jobId: string, outPath: string): Promise<void> {
  const r = await fetch(`${BASE}/${kind}/download/${jobId}`, {
    headers: { Authorization: `Bearer ${getKey()}` },
    redirect: "follow",
  });
  if (!r.ok) {
    throw new Error(
      `69labs download ${kind}/${jobId} ${r.status}: ${(await r.text()).slice(0, 200)}`
    );
  }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
