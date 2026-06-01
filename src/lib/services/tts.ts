import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getSetting } from "../settings";
import { log } from "../logger";
import type { Scene } from "./scene-split";
import { createTtsTask, pollTask, downloadTask } from "./ai33pro";
import { probeDurationSafe, applyAudioTempo, resolveFfmpegBinary } from "./video-assemble";

export interface TtsResult {
  /** Path to the mp3 file. */
  filePath: string;
  /** Audio duration in seconds, measured via ffprobe. */
  durationSec: number;
}

/**
 * Synthesizes one scene's narration via ai33.pro (ElevenLabs voices).
 * Async task pattern: POST → poll task_id → download audio.
 */
export async function synthesizeScene(
  runId: string,
  scene: Scene,
  outDir: string
): Promise<TtsResult> {
  const fileName = `scene_${String(scene.index).padStart(3, "0")}.mp3`;
  const filePath = path.join(outDir, fileName);

  const voiceId = (getSetting("TTS_VOICE_ID") || "").trim();
  if (!voiceId) {
    throw new Error(
      "No ai33pro voice set — paste an ElevenLabs voice id into /settings → TTS_VOICE_ID"
    );
  }
  const modelId = getSetting("TTS_MODEL") || "eleven_multilingual_v2";

  log(runId, "info", `TTS scene #${scene.index} (ai33pro / ${voiceId})`, {
    stage: "tts",
    data: { text: scene.text.slice(0, 80) },
  });

  const taskId = await createTtsTask(scene.text, { voiceId, modelId });
  log(
    runId,
    "debug",
    `ai33pro TTS task ${taskId.slice(0, 8)}… (${modelId} / ${voiceId})`,
    { stage: "tts" }
  );

  let task;
  try {
    task = await pollTask(taskId, runId, "tts");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg} — check the voice id "${voiceId}" and model "${modelId}" are valid for this ai33pro account.`
    );
  }
  await downloadTask(task, filePath);

  // Apply the voice-speed setting (pitch-preserving). <1 = slower/calmer.
  // Done here so the slowed file's length flows naturally into scene duration:
  // a slower voice also makes that scene linger longer on screen.
  const speed = parseFloat(getSetting("TTS_SPEED") || "1");
  if (Number.isFinite(speed) && Math.abs(speed - 1) > 0.01) {
    try {
      await applyAudioTempo(filePath, speed);
      log(runId, "debug", `Voice speed ${speed}× applied to scene #${scene.index}`, { stage: "tts" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(runId, "warn", `Voice-speed adjust failed (using original): ${msg.slice(0, 150)}`, { stage: "tts" });
    }
  }

  const durationSec = await probeDurationSafe(filePath);

  log(runId, "success", `TTS done: ${fileName} (${durationSec.toFixed(1)}s)`, {
    stage: "tts",
  });
  return { filePath, durationSec };
}

/**
 * Single-shot: synthesize the WHOLE concatenated script in ONE continuous
 * voiceover, written to `outPath`.
 *
 * Used by single-shot voiceover mode (tts-align.ts) so the narration flows as
 * one performance — no per-scene intonation arcs to stitch and no mid-sentence
 * pauses where one scene ends and the next begins.
 *
 * ai33pro / ElevenLabs has a per-request character limit, so a long script is
 * chunked at SENTENCE boundaries (never mid-sentence) with each chunk capped at
 * ~2500 chars, synthesised separately (same voice id → same timbre), then the
 * chunk mp3s are concatenated with ffmpeg's concat demuxer. Finally the global
 * TTS_SPEED is applied to the whole file BEFORE transcription, so the Whisper
 * word-timestamps match the audio that actually plays.
 */
export async function synthesizeFullScript(
  runId: string,
  text: string,
  outPath: string,
  _options: Record<string, never> = {}
): Promise<TtsResult> {
  const voiceId = (getSetting("TTS_VOICE_ID") || "").trim();
  if (!voiceId) {
    throw new Error(
      "No ai33pro voice set — paste an ElevenLabs voice id into /settings → TTS_VOICE_ID"
    );
  }
  const modelId = getSetting("TTS_MODEL") || "eleven_multilingual_v2";

  log(runId, "info", `TTS full script (ai33pro / ${voiceId}, ${text.length} chars)`, {
    stage: "tts",
  });

  // ai33pro/ElevenLabs reject very long requests. Chunk at sentence boundaries
  // (. ! ? … and their unicode variants), each chunk ≤ MAX_CHARS. A single
  // sentence longer than the cap is sent whole rather than split mid-sentence.
  const MAX_CHARS = 2500;
  const chunks = chunkAtSentences(text, MAX_CHARS);

  if (chunks.length === 1) {
    // One call — synthesise straight to outPath.
    await ttsChunkToFile(runId, chunks[0], outPath, voiceId, modelId, 1, 1);
  } else {
    log(runId, "info", `Long script — chunking into ${chunks.length} TTS calls (sentence-aligned)`, {
      stage: "tts",
    });

    const chunkPaths: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = outPath.replace(/\.mp3$/i, `__chunk${String(i).padStart(2, "0")}.mp3`);
      await ttsChunkToFile(runId, chunks[i], chunkPath, voiceId, modelId, i + 1, chunks.length);
      chunkPaths.push(chunkPath);
    }

    // Concat the chunk mp3s into outPath with ffmpeg's concat demuxer (stream
    // copy — no re-encode, so it's instant and lossless).
    concatMp3s(chunkPaths, outPath);

    // Clean up chunk + list files.
    for (const p of chunkPaths) {
      try { fs.unlinkSync(p); } catch {}
    }
  }

  // Apply the voice-speed setting to the WHOLE continuous file BEFORE it gets
  // transcribed. atempo is pitch-preserving. Done here (not per chunk) so the
  // final timeline the Whisper timestamps describe is exactly what plays.
  const speed = parseFloat(getSetting("TTS_SPEED") || "1");
  if (Number.isFinite(speed) && Math.abs(speed - 1) > 0.01) {
    try {
      await applyAudioTempo(outPath, speed);
      log(runId, "debug", `Voice speed ${speed}× applied to full script`, { stage: "tts" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(runId, "warn", `Voice-speed adjust failed (using original): ${msg.slice(0, 150)}`, { stage: "tts" });
    }
  }

  const durationSec = await probeDurationSafe(outPath);
  log(
    runId,
    "success",
    `TTS full script done: ${path.basename(outPath)} (${durationSec.toFixed(1)}s)`,
    { stage: "tts" }
  );
  return { filePath: outPath, durationSec };
}

/**
 * Splits `text` into chunks of at most `maxChars`, breaking only on sentence
 * boundaries. If a single sentence exceeds `maxChars` it is emitted whole (we
 * never cut mid-sentence — that's the whole point of single-shot synthesis).
 */
function chunkAtSentences(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  // Match a run of non-terminator chars followed by one or more sentence
  // enders (. ! ? … and the full-width variants) plus trailing whitespace.
  const sentences = trimmed.match(/[^.!?…。！？]+[.!?…。！？]+[\s]*|[^.!?…。！？]+$/g) ?? [trimmed];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > maxChars) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length > 0 ? chunks : [trimmed];
}

/** Synthesise one chunk of the full script to `outPath` via ai33pro. */
async function ttsChunkToFile(
  runId: string,
  chunkText: string,
  outPath: string,
  voiceId: string,
  modelId: string,
  idx: number,
  total: number
): Promise<void> {
  log(runId, "info", `TTS chunk ${idx}/${total} (${chunkText.length} chars)`, { stage: "tts" });
  const taskId = await createTtsTask(chunkText, { voiceId, modelId });
  let task;
  try {
    task = await pollTask(taskId, runId, "tts");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg} — check the voice id "${voiceId}" and model "${modelId}" are valid for this ai33pro account.`
    );
  }
  await downloadTask(task, outPath);
}

/**
 * Concatenates several mp3 files into `outPath` using ffmpeg's concat demuxer
 * with stream copy (no re-encode). Mirrors the per-scene concatSimple approach
 * but for audio-only files.
 */
function concatMp3s(chunkPaths: string[], outPath: string): void {
  const listPath = outPath.replace(/\.mp3$/i, `__concat.txt`);
  // Escape backslashes (Windows paths) and single quotes for ffmpeg's
  // concat-demuxer line syntax `file '...'`.
  const listLines = chunkPaths
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listLines + "\n", "utf-8");

  const bin = resolveFfmpegBinary();
  const r = spawnSync(
    bin,
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath],
    { stdio: "pipe" }
  );
  try { fs.unlinkSync(listPath); } catch {}
  if (r.status !== 0) {
    throw new Error(
      `ffmpeg mp3 concat failed (rc=${r.status}): ${r.stderr?.toString().slice(-300)}`
    );
  }
}
