import fs from "node:fs";
import { getSetting } from "../settings";
import { log, type LogLevel } from "../logger";

/**
 * ai33.pro API client — TTS via ElevenLabs voices (cheaper proxy).
 *
 * Docs: https://ai33.pro/app/api-document (ElevenLabs + Common tabs)
 *
 * Flow is async:
 *   1. POST /v1/text-to-speech/{voice_id} → { success, task_id, ec_remain_credits }
 *   2. Poll  GET /v1/task/{task_id} until status === "done"
 *      Status values: "doing" (still working) | "done" (ready) | "error" (failed)
 *   3. Download the audio from `metadata.audio_url` in the done-task response
 *
 * Auth: header  `xi-api-key: $AI33PRO_API_KEY`  (ElevenLabs-compatible).
 */

const BASE = "https://api.ai33.pro/v1";
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_MS = 5 * 60 * 1000;

// Single fetch timeout. Bumped from 60s after observing legit ai33pro responses
// taking 30-90s under load (especially on POST). 120s gives reasonable headroom.
const DEFAULT_TIMEOUT_MS = 120_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

/** Status values per ai33pro docs (Common / GET Task). */
type TaskStatus = "doing" | "done" | "error" | string;

function getKey(): string {
  const k = getSetting("AI33PRO_API_KEY").trim();
  if (!k) throw new Error("AI33PRO_API_KEY is not set (Settings)");
  return k;
}

function authHeaders(): Record<string, string> {
  return {
    "xi-api-key": getKey(),
    "Content-Type": "application/json",
  };
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── POST: create a TTS task ─────────────────────────────────────────────────

interface CreateTtsTaskResponse {
  success?: boolean;
  task_id?: string;
  ec_remain_credits?: number;
  /** Some proxies put an error message at the top level on failure. */
  error?: string;
  message?: string;
}

export interface CreateTtsOptions {
  /** ElevenLabs voice id (path param). */
  voiceId: string;
  /** ElevenLabs model id. Default: eleven_multilingual_v2. */
  modelId?: string;
  /** Output format query param. Default: mp3_44100_128. */
  outputFormat?: string;
  /** Optional webhook URL — when set, ai33pro POSTs the result there instead of (or in addition to) polling. */
  receiveUrl?: string;
}

/**
 * Creates a TTS task. Returns the task_id ai33pro assigned.
 * Retries once on transient errors (network abort, 5xx).
 */
export async function createTtsTask(text: string, opts: CreateTtsOptions): Promise<string> {
  if (!opts.voiceId) throw new Error("ai33pro createTtsTask: voiceId is required");

  const outputFormat = opts.outputFormat || "mp3_44100_128";
  const url = `${BASE}/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;

  const body: Record<string, unknown> = {
    text,
    model_id: opts.modelId || "eleven_multilingual_v2",
    with_transcript: false,
  };
  if (opts.receiveUrl) body.receive_url = opts.receiveUrl;
  const bodyJson = JSON.stringify(body);

  const MAX_ATTEMPTS = 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, {
        method: "POST",
        headers: authHeaders(),
        body: bodyJson,
      });
      if (!resp.ok) {
        const txt = (await resp.text()).slice(0, 400);
        // 4xx errors aren't retryable (bad input). 5xx might be.
        if (resp.status < 500) {
          throw new Error(`ai33pro POST /text-to-speech HTTP ${resp.status}: ${txt}`);
        }
        lastErr = new Error(`ai33pro POST /text-to-speech HTTP ${resp.status}: ${txt}`);
      } else {
        const json = (await resp.json()) as CreateTtsTaskResponse;
        if (json.success === false || !json.task_id) {
          const msg = json.error || json.message || JSON.stringify(json).slice(0, 200);
          throw new Error(`ai33pro task create failed: ${msg}`);
        }
        return json.task_id;
      }
    } catch (e) {
      lastErr = e;
      // Don't retry on AbortError unless we have attempts left — but DO retry
      // network errors (ECONNRESET, fetch failed, etc.) since they're transient.
    }
    if (attempt < MAX_ATTEMPTS) await sleep(2000);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ── GET: poll a task until it finishes ──────────────────────────────────────

/**
 * GET Task response shape, per ai33pro docs.
 * The audio file URL lives inside `metadata.audio_url`.
 */
export interface TaskInfo {
  id: string;
  created_at: string;
  status: TaskStatus;
  error_message?: string | null;
  credit_cost?: number;
  progress?: number; // 0-100
  type?: string; // e.g. "tts"
  metadata?: {
    audio_url?: string;
    srt_url?: string;
    json_url?: string;
    /** Some task types use this instead (sound-effect, voice-isolate). */
    output_uri?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export async function getTask(taskId: string): Promise<TaskInfo> {
  const url = `${BASE}/task/${encodeURIComponent(taskId)}`;
  const resp = await fetchWithTimeout(url, { headers: authHeaders() });
  if (!resp.ok) {
    const txt = (await resp.text()).slice(0, 300);
    throw new Error(`ai33pro GET task HTTP ${resp.status}: ${txt}`);
  }
  return (await resp.json()) as TaskInfo;
}

/** Picks the audio URL out of a "done" task. Per docs: `metadata.audio_url` for TTS. */
function resolveAudioUrl(task: TaskInfo): string | null {
  return task.metadata?.audio_url || task.metadata?.output_uri || null;
}

export async function pollTask(taskId: string, runId: string, stage: string = "tts"): Promise<TaskInfo> {
  const startedAt = Date.now();
  let lastStatus: TaskStatus | null = null;

  while (true) {
    if (Date.now() - startedAt > POLL_MAX_MS) {
      throw new Error(`ai33pro polling timeout (${POLL_MAX_MS / 1000}s) — task ${taskId}`);
    }

    let task: TaskInfo;
    try {
      task = await getTask(taskId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(runId, "warn", `Poll error (will retry): ${msg.slice(0, 200)}`, { stage: stage as LogLevel });
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (task.status !== lastStatus) {
      lastStatus = task.status;
      log(runId, "debug", `Task ${taskId.slice(0, 8)}… status=${task.status}`, { stage: stage as LogLevel });
    }

    if (task.status === "done") return task;
    if (task.status === "error") {
      throw new Error(`ai33pro task ${taskId} error: ${task.error_message || "no error message"}`);
    }
    // Anything else (e.g. "doing") → keep polling.

    await sleep(POLL_INTERVAL_MS);
  }
}

// ── Download finished audio to disk ─────────────────────────────────────────

export async function downloadTask(task: TaskInfo, outPath: string): Promise<void> {
  const audioUrl = resolveAudioUrl(task);
  if (!audioUrl) {
    throw new Error(
      `ai33pro task done but metadata.audio_url is missing. ` +
        `metadata keys: ${task.metadata ? Object.keys(task.metadata).join(", ") : "(no metadata object)"}`
    );
  }

  // The signed download URL doesn't need the API key — it's an https file URL.
  const resp = await fetchWithTimeout(audioUrl, undefined, DOWNLOAD_TIMEOUT_MS);
  if (!resp.ok) {
    const txt = (await resp.text()).slice(0, 200);
    throw new Error(`ai33pro audio download HTTP ${resp.status}: ${txt}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.byteLength === 0) throw new Error("ai33pro download: empty file");
  fs.writeFileSync(outPath, buf);
}

// ── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
