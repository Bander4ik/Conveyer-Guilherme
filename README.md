# Conveyer — Complete Guide

**Turn a written script into a finished, ready-to-upload YouTube video — on your own computer.**

Conveyer takes your script and automatically:
1. Splits it into scenes (Google Gemini),
2. Records the **whole narration in one continuous take** with an ElevenLabs voice (via ai33.pro),
3. Lines the narration up to each scene using **Groq** (so sentences are never cut in half),
4. Pulls matching **real stock footage** — video clips and still photos with a smooth zoom — from **Pexels**,
5. Stitches it all into one MP4 with FFmpeg.

Everything runs **locally** on your machine. No monthly subscription — just a few cents of API usage per video (often free). Reference style: faceless documentary / storytelling channels.

> **New here? Just follow the steps in order — no coding needed.** It takes about 30 minutes the first time.

---

## Table of contents
- [What you need](#what-you-need)
- [Step 1 — Download Conveyer](#step-1--download-conveyer)
- [Step 2 — Install Node.js](#step-2--install-nodejs)
- [Step 3 — Install FFmpeg](#step-3--install-ffmpeg)
- [Step 4 — Install Conveyer](#step-4--install-conveyer)
- [Step 5 — Get your API keys](#step-5--get-your-api-keys)
- [Step 6 — Launch the app](#step-6--launch-the-app)
- [Step 7 — First-time settings](#step-7--first-time-settings)
- [Step 8 — Make your first video](#step-8--make-your-first-video)
- [Picking a voice](#picking-a-voice)
- [How the voiceover works](#how-the-voiceover-works)
- [Aspect ratio (16:9 vs Shorts)](#aspect-ratio-169-vs-shorts)
- [All settings explained](#all-settings-explained)
- [Where your videos are saved](#where-your-videos-are-saved)
- [Troubleshooting](#troubleshooting)
- [Costs](#costs)
- [Updating](#updating)

---

## What you need

- A computer: **Windows 10+**, **macOS 11+**, or modern Linux.
- About **30 minutes** for first-time setup.
- A reliable internet connection.
- ~**1 GB** of free disk space.
- **Four accounts** (Step 5) — three are free, one is cheap pay-as-you-go:
  - Google AI Studio — **free**
  - Pexels — **free**
  - Groq — **free**
  - ai33.pro — **cheap** (pay-as-you-go, ~$5 lasts a long time)

---

## Step 1 — Download Conveyer

On the GitHub page for this project:

1. Click the green **`< > Code`** button (top right of the file list).
2. Click **Download ZIP**.
3. Unzip it somewhere you'll remember, e.g. `C:\Conveyer\` (Windows) or `~/Documents/Conveyer/` (Mac).

You'll get a folder containing `install`, `start`, and `stop` files plus the app code.

> Prefer git? `git clone https://github.com/Bander4ik/Conveyer-Guilherme.git` — but the ZIP is easier if you're not technical.

---

## Step 2 — Install Node.js

Node.js is what the app runs on. You install it once and never touch it again.

1. Go to **https://nodejs.org/** and click the big green **LTS** button (version 20 or newer).
2. Run the installer — accept all defaults.
3. To check it worked: open a terminal (**Command Prompt** on Windows, **Terminal** on Mac) and type:
   ```
   node --version
   ```
   You should see something like `v20.18.0`. If it says "command not found", restart your computer.

---

## Step 3 — Install FFmpeg

FFmpeg is the engine that assembles the final video.

**Windows**
1. Go to **https://www.gyan.dev/ffmpeg/builds/** and download **`ffmpeg-release-essentials.7z`** (or the `.zip`).
2. Extract it to `C:\ffmpeg` so you end up with `C:\ffmpeg\bin\ffmpeg.exe`.
3. Remember that path — you may paste it into Conveyer's settings later.

**macOS**
1. Install Homebrew from **https://brew.sh** if you don't have it.
2. In Terminal, run: `brew install ffmpeg`

**Linux**
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Fedora: `sudo dnf install ffmpeg`

---

## Step 4 — Install Conveyer

Open the Conveyer folder and:

- **Windows:** double-click **`install.bat`**
- **macOS:** double-click **`install.command`** *(first time, right-click → Open → confirm, to get past Gatekeeper)*

A window opens and installs everything (2–5 minutes). When it says **"Done!"** you're ready.

---

## Step 5 — Get your API keys

This is the part people worry about, but it's just four quick sign-ups.

### 5a. Google Gemini — free (splits your script into scenes)
1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with any Google account → **Create API key**
3. Copy the key (it starts with `AIza...`)

### 5b. Pexels — free (the stock footage)
1. Go to **https://www.pexels.com/api/**
2. Sign up → **Get Started** → copy your key.
3. **For long videos (200+ scenes):** make 3–5 free Pexels accounts (different emails) and collect all the keys. Conveyer rotates between them so you never hit the hourly limit. (One key is fine for short videos.)

### 5c. ai33.pro — cheap (the voice)
1. Go to **https://ai33.pro** → sign up.
2. Buy a small credit pack (**$5 lasts a long time**).
3. Copy the API key from your dashboard.

> ai33.pro is a cheaper gateway to ElevenLabs voices — same quality, pay only for what you use.

### 5d. Groq — free (makes the voice smooth)
1. Go to **https://console.groq.com/keys** → sign up (free).
2. **Create API Key** → copy it.

> Groq listens to your finished narration and marks exactly where each scene's words are, so the voice flows naturally and sentences are never split between scenes. The free tier easily covers normal use.

---

## Step 6 — Launch the app

- **Windows:** double-click **`start.bat`**
- **macOS:** double-click **`start.command`**

A terminal window opens and your browser automatically goes to **http://localhost:3000**.

> ⚠️ **Keep that terminal window open** while you use Conveyer. Closing it stops the app. (You can minimize it.)

---

## Step 7 — First-time settings

1. In the app, click **Settings** (left sidebar).
2. Paste your four keys into the matching fields:
   - `GOOGLE_API_KEY`
   - `PEXELS_API_KEY` *(for multiple keys, paste one per line)*
   - `AI33PRO_API_KEY`
   - `GROQ_API_KEY`
3. **Windows only:** if FFmpeg isn't on your system PATH, paste `C:\ffmpeg\bin\ffmpeg.exe` into `FFMPEG_PATH`.
4. Under **Voice Over**, paste an **ElevenLabs voice ID** into `TTS_VOICE_ID` (see [Picking a voice](#picking-a-voice)). Leave **Voice mode** on **single-shot**.
5. Click **Save all changes**.

You only do this once — your settings are remembered.

---

## Step 8 — Make your first video

1. Click **New Run** in the sidebar.
2. Give it a **title** and paste your **script** (500–1500 words is the sweet spot for an 8–15 min video; short scripts work too).
3. Click **Run Pipeline**.
4. Watch the live log. When you see the green **`Pipeline complete`**, your video is ready on the page — download the MP4 and upload to YouTube.

> Want to test quickly? Paste ~70 words (≈30 seconds) of concrete, visual narration (e.g. about the ocean, a city, history) — Conveyer finds better footage when the wording is concrete.

---

## Picking a voice

A **voice ID** is the code at the end of a voice's page URL in the ElevenLabs voice library:
**https://elevenlabs.io/app/voice-library**

Some solid starting voices:

| Voice ID | Voice | Good for |
|---|---|---|
| `JBFqnCBsd6RMkjVDRZzb` | George — deep British male | documentary, mystery |
| `21m00Tcm4TlvDq8ikWAM` | Rachel — calm American female | explainers, lifestyle |
| `pNInz6obpgDQGcFmaJgB` | Adam — clear American narrator | news, top-10s |
| `EXAVITQu4vr4xnSDxMaL` | Sarah — warm, soft female | wellness, calm topics |

> Tip: try the same script with 2–3 voices to find your channel's signature sound.

---

## How the voiceover works

Conveyer uses **single-shot** voice mode by default. Instead of recording each scene separately (which made sentences sound chopped at scene changes), it records the **entire script in one continuous take**, then uses Groq to find the exact timing of every word and lines the visuals up to it.

Result: smooth, natural narration with the footage changing in sync — no mid-sentence breaks.

Two related controls in **Settings → Voice Over**:
- **Voice speed** — `0.9` for a calmer pace (and slower scene changes). Pitch stays natural.
- **Max seconds per b-roll clip** — for a long scene, Conveyer shows several different clips (this many seconds each) instead of stretching one. Default `7`.

> **"Pause between scenes" does nothing in single-shot mode** — there are no scene-by-scene gaps to pad. It only applies if you switch Voice mode to *per-scene*.

---

## Aspect ratio (16:9 vs Shorts)

The output frame shape is set by **`VIDEO_RESOLUTION`** in Settings:

| You want | Set `VIDEO_RESOLUTION` | Set `STOCK_FOOTAGE_ORIENTATION` |
|---|---|---|
| **Normal YouTube (16:9)** | `1920x1080` | `landscape` |
| **Shorts / TikTok / Reels (9:16)** | `1080x1920` | `portrait` |
| **Square (1:1)** | `1080x1080` | `square` |

Always set both to match. For normal videos, the defaults (`1920x1080` + `landscape`) are already correct — leave them.

---

## All settings explained

### Required API keys
| Setting | What it does |
|---|---|
| `GOOGLE_API_KEY` | Gemini — splits your script into scenes. |
| `PEXELS_API_KEY` | Pexels stock footage. Paste several keys (one per line) for long videos. |
| `AI33PRO_API_KEY` | The ElevenLabs voiceover (via ai33.pro). |
| `GROQ_API_KEY` | Free — powers the smooth single-shot voice timing. |

### Voice Over
| Setting | What it does | Default |
|---|---|---|
| `TTS_PROVIDER` | Which voice engine. `ai33pro` (default) or `69labs` — **both use the same ElevenLabs voices**, 69labs is just an alternate gateway. Switch to `69labs` if you have a 69labs key / prefer it. | ai33pro |
| `LABS69_API_KEY` | Your 69labs key (starts with `vk_`). **Only needed if `TTS_PROVIDER = 69labs`.** Get it from your 69labs dashboard. | — |
| `TTS_MODE` | `single-shot` (smooth, recommended, uses Groq) or `per-scene` (older, small pauses). | single-shot |
| `TTS_VOICE_ID` | ElevenLabs voice ID (works for both providers). | — |
| `TTS_MODEL` | `eleven_multilingual_v2` (best quality) or `eleven_turbo_v2_5` (faster/cheaper). | eleven_multilingual_v2 |
| `TTS_SPEED` | Narration speed. `1.0` normal, `0.9` calmer. Pitch stays natural. | 1.0 |
| `MAX_CLIP_SECONDS` | Max length of one b-roll clip in smooth mode; longer scenes get several clips. `0` = one clip per scene. | 7 |

> **Switching the voice engine:** the same `TTS_VOICE_ID` (an ElevenLabs voice) works on both `ai33pro` and `69labs`, so you can flip `TTS_PROVIDER` without changing your voice. Speed is handled correctly either way.
>
> **Auto-fallback:** you don't strictly have to set both. If the selected engine has no key but the other one does, Conveyer automatically uses the one that's configured — so whichever key you paste (ai33pro **or** 69labs), the voiceover just works. If you set both keys, `TTS_PROVIDER` decides.

### Stock footage (Pexels)
| Setting | What it does | Default |
|---|---|---|
| `STOCK_FOOTAGE_ORIENTATION` | `landscape` / `portrait` / `square`. | landscape |
| `STOCK_FOOTAGE_MAX_HEIGHT` | Caps clip resolution: `720` / `1080` / `2160`. | 1080 |
| `STOCK_FOOTAGE_MIN_DURATION` | Skip clips shorter than this (seconds). | 4 |
| `SCENE_PHOTO_RATIO` | % of scenes that use a still photo (with smooth zoom) vs a video. `0` = video only, `100` = photos only. | 40 |
| `SCENE_MIX_MODE` | `random` or `alternating` — how photo scenes are spread out. | random |

### Video & quality
| Setting | What it does | Default |
|---|---|---|
| `VIDEO_RESOLUTION` | Output size & shape (see [Aspect ratio](#aspect-ratio-169-vs-shorts)). | 1920x1080 |
| `VIDEO_FPS` | Frames per second. 24 cinematic / 30 standard / 60 (slower to render). | 30 |
| `TRANSITION_MIN` / `TRANSITION_MAX` | Crossfade length range between scenes (seconds). `0`/`0` = hard cuts. | 0.3 / 0.7 |
| `FFMPEG_PATH` | Full path to ffmpeg if it isn't on your system PATH (Windows). | — |
| `RUNS_OUTPUT_DIR` | Where finished videos are saved. Empty = default folder. | — |

### Performance & reliability
| Setting | What it does | Default |
|---|---|---|
| `ANIMATION_CONCURRENCY` | Parallel Pexels downloads. Rate limits are auto-handled; raise to 8–10 with multiple Pexels keys. | 5 |
| `ASSEMBLE_CONCURRENCY` | Parallel FFmpeg renders. Set to about half your CPU cores. | 4 |
| `FAILURE_THRESHOLD_PERCENT` | If more than this % of scenes fail, the run stops. Raise to 60–70 on shaky internet. | 25 |

### Google Drive backup (optional, advanced)
Auto-uploads finished videos to your Google Drive. Off by default; needs a one-time Google Cloud OAuth setup (`GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET`, then connect in Settings, then tick `GDRIVE_SYNC_ENABLED`). Skip unless you specifically want cloud backups.

---

## Where your videos are saved

By default, in your user folder (separate from the app, so updates never delete them):
- **Windows:** `C:\Users\<you>\.conveyer-guilherme\runs\<run title>\`
- **macOS/Linux:** `~/.conveyer-guilherme/runs/<run title>/`

> On Mac this folder is hidden (it starts with a dot). In Finder press **Cmd + Shift + .** to show it.

`final.mp4` is your finished video. You can change the location with `RUNS_OUTPUT_DIR` in Settings.

---

## Troubleshooting

**The voice sounds chopped / pauses mid-sentence**
Make sure **Voice mode = single-shot** and your `GROQ_API_KEY` is set. (Per-scene mode has small pauses by design.)

**A photo or video looks stretched/squished**
Check `VIDEO_RESOLUTION` is `1920x1080` (for 16:9). Photos are now cropped to fit, never stretched.

**Long video pauses for a while during footage download**
Normal — that's the Pexels hourly limit; Conveyer auto-pauses and resumes. Add more Pexels keys (one per line) to go faster.

**"ai33pro task error" / "Groq" error**
Out of ai33.pro credits, or a wrong/missing key. Check Settings and your ai33.pro / Groq dashboards.

**"FFmpeg not found"**
Paste the full path to `ffmpeg.exe` into `FFMPEG_PATH` in Settings.

**"Port 3000 already in use"**
Run `stop.bat` / `stop.command`, then start again.

> 🆘 **Hit an error not listed here?** Open the run page and click **⬇ Download full log**, then send that `.txt` file. The log shows exactly what went wrong.

---

## Costs

Per ~10-minute video, roughly:

| Service | Cost |
|---|---|
| Gemini (scene split) | free |
| Pexels (footage) | free |
| Groq (voice timing) | ~free (free tier) |
| ai33.pro (voice) | ~$0.05–0.10 (`eleven_turbo_v2_5` ≈ half) |

**Total: about $0.05–0.20 per video. No monthly fees.**

---

## Updating

1. Stop the app (close the terminal window).
2. Download the latest version (Download ZIP again, or `git pull`).
3. Replace the old folder with the new one. **Your settings and past videos are safe** — they live in `~/.conveyer-guilherme/`, outside the app folder.
4. Run `install` then `start` again. Everything comes back automatically.

---

*Local-only tool. Pexels content is licensed for commercial use. Don't share your API keys publicly. Found a bug? Click **⬇ Download full log** on the run page and send the file.*
