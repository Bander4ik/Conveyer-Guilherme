# CLAUDE.md — project context for Claude Code

This file is auto-loaded by Claude Code. It gives you (Claude) the full picture
of **Conveyer Guilherme** so you can confidently answer questions and make
changes.

---

## What this is

A **local web app** for making faceless-YouTube videos with **real Pexels b-roll**
synced to a script. Runs entirely on the user's machine (Next.js dev server +
local SQLite + local FFmpeg) — no hosted backend, no cloud.

There is **one mode**: paste a script → Gemini splits it into scenes → each
scene gets one Pexels stock clip + ai33pro voiceover → FFmpeg assembles the
final MP4. That's the whole product.

**Target user**: Guilherme — a single channel operator. The app is intentionally
minimal: no channel profiles, no presets, no AI video gen, no standalone TTS
tool. Just the pipeline — plus an OPTIONAL Google Drive backup of finished runs.

**Reference channel for style**: https://youtube.com/@eliyodersecrets — mix of
real stock footage with voiceover narration.

---

## Origin / fork lineage

Forked from **Conveyer Hum** (which uses Grok AI-video). Conveyer Guilherme
replaces the AI video generation step with **Pexels stock footage**, and was
then aggressively stripped of everything not needed for that single use case.

If you ever need to compare against the parent: `C:\Users\cupak\CascadeProjects\Conveyer Hum\`.

---

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript** · **Tailwind 4**
- **better-sqlite3** — local DB at `~/.conveyer-guilherme/guilherme.db`
- **fluent-ffmpeg** — video assembly (needs system FFmpeg)
- Node ≥ 20. Dev server: `npm run dev` on port 3000.

No other runtime deps — `@anthropic-ai/sdk`, `googleapis`, `zod`, `clsx`,
`tailwind-merge` were all removed during the slim-down.

---

## Pipeline — end to end

Entry point: `POST /api/runs` → inserts a `runs` row → calls `runPipeline()` in
the background → redirects the UI to `/runs/[id]` which streams logs via SSE.

`src/lib/pipeline.ts` `runPipeline(runId, script)`:

1. **Scene split** — `splitScript()` in `services/scene-split.ts`. Single-shot
   call to Gemini. Returns `Scene[]`, each with `text`, `visual_prompt`,
   `duration_hint_sec`.
2. **Per scene, in parallel** (concurrency-limited via `plimit.ts`):
   - `synthesizeScene()` (`services/tts.ts`) → narration MP3 via MiniMax through
     the 69labs gateway.
   - `animateScene()` (`services/img2vid.ts`) → ~5–15s stock clip via
     `stock-footage.ts` (Pexels API).
3. **Per-scene render** — `services/video-assemble.ts` combines narration + clip
   into one MP4 per scene, matching durations (trim / stretch / pad).
4. **Final assembly** — FFmpeg xfade-concatenates all scene clips → `final.mp4`.

Every stage writes to `run_logs` via `logger.ts`; the run page streams them over
Server-Sent Events (`/api/runs/[id]/logs`).

---

## Key external services

| Service | Used for | Notes |
|---|---|---|
| **Google Gemini** | scene split | `GOOGLE_API_KEY`. Free tier is fine. |
| **Pexels** | stock b-roll | `PEXELS_API_KEY`. Free: 200 req/hr, 20 000/month. |
| **69labs.vip** | MiniMax TTS | `LABS69_API_KEY`. Single key, no multi-account pool. |

---

## File map

```
src/
├── app/
│   ├── layout.tsx              Root layout — renders <Sidebar/> + content
│   ├── _sidebar.tsx            3 items: New Run · History · Settings
│   ├── globals.css             Design tokens + component classes
│   ├── page.tsx                / — paste script + Run Pipeline
│   ├── runs/page.tsx           /runs — history list
│   ├── runs/[id]/page.tsx      /runs/[id] — logs (SSE) + final video + assets
│   ├── settings/page.tsx       /settings — single page, all groups
│   ├── settings/_groups.ts     Settings form schema (single source of truth)
│   ├── settings/_group-card.tsx  Renders one settings group
│   └── api/
│       ├── runs/route.ts             POST create run, GET list
│       ├── runs/[id]/route.ts        GET one run
│       ├── runs/[id]/logs/route.ts   SSE log stream
│       ├── runs/[id]/assets/route.ts GET scene assets on disk
│       ├── runs/[id]/cancel/route.ts POST cancel
│       ├── runs/[id]/file/route.ts   GET serve a run file
│       ├── runs/[id]/open-folder/route.ts  POST open run folder in OS
│       ├── preview/scenes/route.ts   POST scene-split preview (no run created)
│       ├── settings/route.ts         GET/POST settings
│       └── stats/route.ts            GET concurrency stats
└── lib/
    ├── db.ts                   SQLite open + schema
    ├── settings.ts             SETTING_KEYS, DEFAULTS, get/set helpers
    ├── prompts.ts              Global scene_split prompt CRUD
    ├── pipeline.ts             runPipeline orchestrator
    ├── run-paths.ts            DATA_DIR + per-run folder paths
    ├── logger.ts               writes run_logs
    ├── plimit.ts               tiny concurrency limiter
    ├── cancellation.ts         cooperative run cancellation
    ├── init.ts                 ensureInit — seeds defaults
    └── services/
        ├── scene-split.ts      script → Scene[] via Gemini (single-shot)
        ├── tts.ts              MiniMax via 69labs only
        ├── labs69.ts           69labs client (TTS only, single key)
        ├── img2vid.ts          Thin wrapper around stock-footage
        ├── stock-footage.ts    Pexels client (search + download)
        └── video-assemble.ts   FFmpeg per-scene render + final xfade
scripts/
└── fix-native-binaries.mjs     postinstall — restores Windows .node binaries
```

---

## Data model (`guilherme.db`)

- **settings** — `key` → `value`. All config. See `SETTING_KEYS` in `settings.ts`.
- **prompts** — currently one row: `scene_split` (the global Gemini prompt).
- **runs** — one row per run. Columns: `id`, `title`, `folder_name`, `status`,
  `script`, `config_json`, `created_at`, `updated_at`, `output_path`.
- **run_logs** — append-only log lines streamed to the run page.

The DB lives outside the project tree (`~/.conveyer-guilherme/`) so code updates
never touch user data — alongside `runs/` (pipeline output). The `data/runs`
junction inside the project points to the active runs root for convenience.

---

## Settings (19 keys)

Required:
- `GOOGLE_API_KEY`, `PEXELS_API_KEY`, `LABS69_API_KEY`

Storage:
- `RUNS_OUTPUT_DIR`, `FFMPEG_PATH`

Scene split:
- `SCENE_SPLIT_MODEL` (Gemini only)

TTS (MiniMax only):
- `TTS_VOICE_ID`, `TTS_MODEL`, `TTS_SPEED`

Stock footage:
- `STOCK_FOOTAGE_ORIENTATION`, `STOCK_FOOTAGE_MAX_HEIGHT`,
  `STOCK_FOOTAGE_MIN_DURATION`, `IMAGE_RATIO`

FFmpeg assembly:
- `VIDEO_RESOLUTION`, `VIDEO_FPS`, `SCENE_DURATION_SECONDS`,
  `TRANSITION_DURATION`, `SCENE_TAIL_SILENCE`

Performance:
- `TTS_CONCURRENCY`, `ANIMATION_CONCURRENCY`, `ASSEMBLE_CONCURRENCY`

Reliability:
- `FAILURE_THRESHOLD_PERCENT`

That's it. No channel overrides, no per-run preset snapshots, no multi-provider
TTS switch, no animation-ratio / distribution mode, no xfade chunking.

---

## Conventions & gotchas

- **TypeScript must stay clean**: run `npx tsc --noEmit` before committing.
- **Settings form is schema-driven** — add a field by editing `_groups.ts`, and
  add the key to `SETTING_KEYS` + `DEFAULTS` in `settings.ts`.
- UI uses the design tokens / component classes in `globals.css` — prefer
  `var(--…)` and `.btn` / `.card` / `.input` over hardcoded colors.
- The project path can contain spaces (`Conveyer Guilherme`) — always use `path.join`.
- Secrets are masked in the UI (`abcd…wxyz`); the save handler skips any value
  still containing `…` so it doesn't overwrite the real key.
- **Pexels visual queries**: Gemini's `visual_prompt` is verbose AI prose. The
  `visualPromptToQuery()` helper trims it to ~10 keywords before Pexels search.
  Quality of stock matches depends heavily on this — see Phase 2a in the roadmap.

---

## Roadmap (not built yet)

- **Phase 2a** — Gemini extracts 2–3 keywords from `visual_prompt` before
  Pexels search (instead of the first 10 words). Big quality win.
- **Phase 2b** — Pexels **photo** support: still images + FFmpeg ken-burns
  (the `video-assemble.ts` ken-burns branch is already wired, just needs the
  photo-fetch path). Lets us mix b-roll video with still photos like
  @eliyodersecrets does.
- **Phase 2c** — Replace MiniMax with **ai33pro** TTS (ElevenLabs voices via
  cheaper proxy). API is async: `POST /v1/text-to-speech/{voice_id}` →
  `task_id` → poll or webhook. Need the `Common/GET Task` endpoint shape from
  Vlad before wiring it up.
- **Phase 3** — Per-scene clip review UI (let user swap a bad Pexels pick
  before final assembly).

---

## How to verify a change

1. `npx tsc --noEmit` — must be 0 errors.
2. `npm run dev`, open `http://localhost:3000`, exercise the changed page.
3. For pipeline changes, run a short (~30s, 5 scenes) script end-to-end and
   watch the logs at `/runs/[id]`.

---

## What this is NOT

If you're looking at a feature request from Guilherme that sounds like one of
these, push back — it's been deliberately removed:

- **AI video generation** (Grok, Veo, Kling, Replicate, fal). Stock-only.
- **Google Drive library / reuse** (AI clip-matching). REMOVED — but plain
  Drive BACKUP of finished runs is supported (services/gdrive.ts +
  run-upload.ts, gated by `GDRIVE_SYNC_ENABLED`; uploads to `Conveyer/Final
  Videos/` + `Conveyer/Runs/<run>/`). It uploads after a successful run only.
- **Channel profiles / prompt presets**. One global config.
- **Standalone TTS tool**. Voiceover only happens inside the pipeline.
- **Multiple TTS providers**. ai33pro (ElevenLabs voices) only.
- **Anthropic Claude scene-split**. Gemini only.
- **Re-assembly mode**. No clip library to assemble from. (But
  `rebuildSceneAssetsFromDisk()` in run-upload.ts can rebuild scene assets from
  a run folder — useful if a re-sync/resume is ever wired up.)

## Long-video assembly (IMPORTANT — don't regress)

`video-assemble.ts` uses **hierarchical chunked xfade** (`concatWithCrossfadeChunked`,
`MAX_CLIPS_PER_PASS = 50`). This is REQUIRED: a monolithic ffmpeg xfade with
hundreds of inputs crashes with `code 221: Resource temporarily unavailable`
(EAGAIN) — it blows the per-process FD/thread limit. A 691-scene video hit this.
Do NOT "simplify" it back to a single ffmpeg call.
- **Multi-account 69labs key pool**. One key.

If Guilherme needs one of these later, we add it then. Don't pre-build.
