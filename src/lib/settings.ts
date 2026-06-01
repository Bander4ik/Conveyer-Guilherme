import db from "./db";

/**
 * Keys the user can edit through the UI or via .env.
 * UI takes precedence over .env (env is only the fallback when the DB row is empty).
 */
export const SETTING_KEYS = [
  // ── Required API keys ─────────────────────────────────────────────
  "GOOGLE_API_KEY",          // Gemini — scene splitting
  "PEXELS_API_KEY",          // Pexels — stock b-roll
  "AI33PRO_API_KEY",         // ai33.pro — ElevenLabs voices proxy
  "GROQ_API_KEY",            // Groq Whisper — word-level transcription for single-shot voiceover mode

  "FFMPEG_PATH",             // absolute path to ffmpeg.exe if not in system PATH

  // ── Storage ───────────────────────────────────────────────────────
  "RUNS_OUTPUT_DIR",         // where run folders are written. Empty = default

  // ── Scene splitting (Gemini only) ─────────────────────────────────
  "SCENE_SPLIT_MODEL",       // e.g. gemini-flash-latest

  // ── Text-to-Speech (ai33.pro / ElevenLabs voices) ─────────────────
  "TTS_VOICE_ID",            // ElevenLabs voice id (path-segment in ai33pro URL)
  "TTS_MODEL",               // ElevenLabs model, e.g. eleven_multilingual_v2
  "TTS_SPEED",               // 0.5–2.0 playback tempo. <1 = slower/calmer voice (applied via ffmpeg, pitch-preserving)
  "TTS_MODE",                // single-shot (default) | per-scene. Single-shot synthesizes ONE continuous voiceover for the whole script then aligns scene boundaries via Groq Whisper word-timestamps — fixes mid-sentence pauses at scene boundaries.
  "MAX_CLIP_SECONDS",        // single-shot: max length of one b-roll clip (seconds). Longer scene ranges are split into equal sub-clips, each with its own Pexels asset. 0 = disabled (one clip per scene).

  // ── Stock footage (Pexels) ────────────────────────────────────────
  "STOCK_FOOTAGE_ORIENTATION", // landscape | portrait | square
  "STOCK_FOOTAGE_MAX_HEIGHT",  // 720 | 1080 | 2160 — caps file size
  "STOCK_FOOTAGE_MIN_DURATION", // seconds — skip stingers shorter than this
  "SCENE_PHOTO_RATIO",         // 0–100, % of scenes that use a still photo (ken-burns) vs a video clip
  "SCENE_MIX_MODE",            // random | alternating — how photo scenes are distributed
  "IMAGE_RATIO",             // 16:9 | 9:16 | 1:1 — read by FFmpeg assembly

  // ── Video assembly (FFmpeg) ───────────────────────────────────────
  "VIDEO_RESOLUTION",        // e.g. 1920x1080
  "VIDEO_FPS",               // 24 / 30 / 60
  "SCENE_DURATION_SECONDS",  // fallback duration when TTS length is unknown
  "TRANSITION_MIN",          // min crossfade length (s); each cut gets a random fade in [min,max]
  "TRANSITION_MAX",          // max crossfade length (s); max<=0 → hard cuts (no transitions)
  "SCENE_TAIL_SILENCE",      // silence appended to each clip's audio (seconds)

  // ── Performance / Concurrency ─────────────────────────────────────
  "TTS_CONCURRENCY",         // parallel TTS jobs
  "ANIMATION_CONCURRENCY",   // parallel Pexels jobs
  "ASSEMBLE_CONCURRENCY",    // parallel FFmpeg clip renders

  // ── Reliability ───────────────────────────────────────────────────
  "FAILURE_THRESHOLD_PERCENT", // 0–100. If more than this % of scenes fail, the run aborts.

  // ── Google Drive backup (optional) ────────────────────────────────
  "GDRIVE_CLIENT_ID",            // OAuth2 client id (Google Cloud Console)
  "GDRIVE_CLIENT_SECRET",        // OAuth2 client secret (masked in UI)
  "GDRIVE_REFRESH_TOKEN",        // set by the OAuth callback, not by the user
  "GDRIVE_CONNECTED_EMAIL",      // set by the OAuth callback — shows who is connected
  "GDRIVE_FINAL_VIDEOS_FOLDER_ID", // Drive folder id for final.mp4s. Empty = auto-create
  "GDRIVE_RUNS_FOLDER_ID",       // Drive folder id for per-run source assets. Empty = auto-create
  "GDRIVE_SYNC_ENABLED",         // "1" = auto-upload finished runs to Drive
] as const;

/** Keys whose values are secrets and should be masked when sent to the UI. */
function isSecretKey(key: string): boolean {
  return key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET");
}

export type SettingKey = (typeof SETTING_KEYS)[number];

const getStmt = db.prepare("SELECT value FROM settings WHERE key = ?");
const upsertStmt = db.prepare(
  "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
);

export function getSetting(key: SettingKey): string {
  const row = getStmt.get(key) as { value: string } | undefined;
  if (row && row.value !== "") return row.value;
  return process.env[key] ?? "";
}

export function setSetting(key: SettingKey, value: string) {
  upsertStmt.run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SETTING_KEYS) out[k] = getSetting(k);
  return out;
}

/** Safe version — masks secret keys/tokens/secrets. */
export function getMaskedSettings(): Record<string, string> {
  const all = getAllSettings();
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (isSecretKey(k)) {
      masked[k] = v ? `${v.slice(0, 4)}…${v.slice(-4)}` : "";
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

export const DEFAULTS: Record<SettingKey, string> = {
  // Required API keys — empty by default, user must provide
  GOOGLE_API_KEY: "",
  PEXELS_API_KEY: "",
  AI33PRO_API_KEY: "",
  GROQ_API_KEY: "",

  FFMPEG_PATH: "",

  // Storage — empty = use default (DATA_DIR/runs)
  RUNS_OUTPUT_DIR: "",

  // Scene split — Gemini only
  SCENE_SPLIT_MODEL: "gemini-flash-latest",

  // TTS — ai33.pro with ElevenLabs voices. Default voice left empty so the
  // user picks one in /settings (any ElevenLabs voice id works).
  TTS_VOICE_ID: "",
  TTS_MODEL: "eleven_multilingual_v2",
  TTS_SPEED: "1.0",
  // single-shot = one continuous voiceover for the whole script (no mid-sentence
  // pauses at scene cuts). per-scene = legacy one-TTS-call-per-scene flow.
  TTS_MODE: "single-shot",
  // Cap a single b-roll clip at 7s; longer scene audio ranges are split into
  // equal sub-clips so the visuals keep changing. 0 disables the split.
  MAX_CLIP_SECONDS: "7",

  // Stock footage (Pexels) — defaults match a typical long-form 16:9 channel.
  STOCK_FOOTAGE_ORIENTATION: "landscape",
  STOCK_FOOTAGE_MAX_HEIGHT: "1080",
  STOCK_FOOTAGE_MIN_DURATION: "4",
  // 40% of scenes use a still photo with ken-burns zoom — adds visual variety
  // and helps when Pexels has a strong photo for a query but weak video.
  SCENE_PHOTO_RATIO: "40",
  SCENE_MIX_MODE: "random",
  IMAGE_RATIO: "16:9",

  // Video assembly
  VIDEO_RESOLUTION: "1920x1080",
  VIDEO_FPS: "30",
  SCENE_DURATION_SECONDS: "5",
  TRANSITION_MIN: "0.3",
  TRANSITION_MAX: "0.7",
  SCENE_TAIL_SILENCE: "0.4",

  // Performance
  TTS_CONCURRENCY: "3",
  ANIMATION_CONCURRENCY: "5",
  ASSEMBLE_CONCURRENCY: "4",

  // Reliability
  FAILURE_THRESHOLD_PERCENT: "25",

  // Google Drive backup — all empty by default (feature off until configured).
  GDRIVE_CLIENT_ID: "",
  GDRIVE_CLIENT_SECRET: "",
  GDRIVE_REFRESH_TOKEN: "",
  GDRIVE_CONNECTED_EMAIL: "",
  GDRIVE_FINAL_VIDEOS_FOLDER_ID: "",
  GDRIVE_RUNS_FOLDER_ID: "",
  GDRIVE_SYNC_ENABLED: "",
};

/** Write defaults for any keys that aren't already in the DB. */
export function seedDefaults() {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    const row = getStmt.get(k) as { value: string } | undefined;
    if (!row) upsertStmt.run(k, v);
  }
}
