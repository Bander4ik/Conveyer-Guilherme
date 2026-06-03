/**
 * Single source of truth for the settings form schema.
 *
 * Only settings relevant to the Pexels b-roll + ai33pro TTS pipeline are
 * surfaced here.
 */

export interface Field {
  key: string;
  label?: string;
  desc: string;
  examples?: string;
  required?: boolean;
  multiline?: boolean;
}

export interface Group {
  title: string;
  subtitle?: string;
  required?: boolean;
  fields: Field[];
}

export const ALL_GROUPS: Group[] = [
  {
    title: "Required API Keys",
    subtitle: "The bare minimum to run the pipeline. (Your VOICE key — ai33.pro or 69labs — lives in the Voice Over section below; set whichever one you have.)",
    required: true,
    fields: [
      {
        key: "GOOGLE_API_KEY",
        desc: "Powers scene splitting — Gemini reads your script and breaks it into individual scenes with visual prompts.",
        examples: "Get it free at https://aistudio.google.com/app/apikey (Create API key)",
        required: true,
      },
      {
        key: "PEXELS_API_KEY",
        desc: "Pexels API key — the source of all b-roll. Free tier: 200 requests/hour, 20 000/month per key.\n\nPRO TIP: You can paste MULTIPLE Pexels keys (one per line, or comma-separated) from different free accounts. The app rotates through them — when one hits its hourly limit, it switches to the next. With 5 keys you get 1000 req/hour, enough for huge videos (700+ scenes) in one shot. When ALL keys are exhausted, the app auto-waits on the one whose window refreshes soonest, then resumes — no manual restart needed.",
        examples: "Single key: pasted on one line  ·  Multiple keys: one per line (paste, Enter, paste, Enter, ...)",
        required: true,
        multiline: true,
      },
      {
        key: "GROQ_API_KEY",
        label: "Groq API key (smooth voice)",
        desc: "Used by the smooth single-shot voiceover mode. The app records the whole narration in one take, then asks Groq to listen back and mark exactly where each scene's words land — so a sentence that spans two scenes is never cut in half. The FREE tier covers normal use (it's only used once per video, on a tiny downsampled copy of the audio). Leave empty only if you switch Voice mode to 'per-scene'.",
        examples: "Get it free at https://console.groq.com/keys (Create API Key)",
        required: true,
      },
    ],
  },
  {
    title: "Storage Location",
    subtitle: "Where the generated audio and final videos are saved on disk.",
    fields: [
      {
        key: "RUNS_OUTPUT_DIR",
        desc: "Absolute folder path for run outputs. Leave empty to use the default location inside your user profile (~/.conveyer-guilherme/runs).",
        examples: "Mac: /Users/you/Documents/Conveyer-Runs  ·  Windows: D:\\YouTube\\Conveyer-Runs",
      },
      {
        key: "FFMPEG_PATH",
        desc: "Absolute path to the FFmpeg binary. Only needed if FFmpeg is not in your system PATH.",
        examples: "Mac: /opt/homebrew/bin/ffmpeg  ·  Windows: C:\\ffmpeg\\bin\\ffmpeg.exe  ·  Leave empty if `ffmpeg` works in your terminal",
      },
    ],
  },
  {
    title: "Script Breakdown (Gemini)",
    subtitle: "Which Gemini model splits your script into scenes.",
    fields: [
      {
        key: "SCENE_SPLIT_MODEL",
        desc: "Specific Gemini model id. The `-latest` alias auto-tracks the current stable Flash.",
        examples: "gemini-flash-latest, gemini-2.5-flash, gemini-2.5-pro",
      },
    ],
  },
  {
    title: "Voice Over — engine: ai33.pro OR 69labs (ElevenLabs voices)",
    subtitle: "Pick the voice engine and paste its key here. ai33.pro and 69labs serve the SAME ElevenLabs voices — they're just two gateways, so use whichever you have. The run log prints which engine is actually live (e.g. \"Voice engine: 69labs\") so you always see what's being used.",
    fields: [
      {
        key: "TTS_PROVIDER",
        label: "Voice engine — ai33.pro or 69labs",
        desc: "Which service generates the voice. Both use the SAME ElevenLabs voice you pick below.\n\n• 'ai33pro' (default) — via the ai33.pro proxy. Uses the ai33.pro key below.\n\n• '69labs' — the same ElevenLabs voice through the 69labs gateway. Uses the 69labs key below.\n\nVoice id / model / speed apply to BOTH — no need to change them when you switch. SMART: you don't even have to set this exactly right — if you only fill ONE of the two keys below, the app uses that engine automatically. Whichever engine ends up active is printed in the run log.",
        examples: "ai33pro (default)  ·  69labs",
      },
      {
        key: "AI33PRO_API_KEY",
        label: "ai33.pro key (for the ai33pro engine)",
        desc: "ai33.pro API key — cheaper ElevenLabs-voice proxy. Fill this if Voice engine = ai33pro. Set at least one of this / the 69labs key below.",
        examples: "Get it from your ai33.pro dashboard → API Key",
      },
      {
        key: "LABS69_API_KEY",
        label: "69labs key (for the 69labs engine)",
        desc: "69labs API key — same ElevenLabs voices through the 69labs gateway. Fill this if Voice engine = 69labs. The key starts with `vk_`. Set at least one of this / the ai33.pro key above.",
        examples: "vk_xxxxxxxxxxxxxxxx — from https://69labs.vip dashboard → API",
      },
      {
        key: "TTS_MODE",
        label: "Voice mode",
        desc: "How the narration is recorded.\n\n• 'single-shot' (recommended) records the WHOLE script in one continuous take, so the voice flows naturally and a sentence is never split in half when one scene ends and the next begins. Needs the Groq API key above.\n\n• 'per-scene' records each scene separately (the older way). Pick this only if you don't want to set up a Groq key — but expect a small pause at every scene change.",
        examples: "single-shot (recommended)  ·  per-scene",
      },
      {
        key: "TTS_VOICE_ID",
        label: "ElevenLabs voice id",
        desc: "The ElevenLabs voice id for narration — a short alphanumeric string like KeU8nqWFDbaoi0QVUjD3. IMPORTANT: paste just the ID. The ai33.pro dashboard shows voices as 'elevenlabs_<id>' — if you copy that whole thing the app strips the 'elevenlabs_' prefix for you, but the real id is only the part after it. A wrong/prefixed id makes the service fall back to a DEFAULT voice (output won't match what you picked).",
        examples: "KeU8nqWFDbaoi0QVUjD3  ·  JBFqnCBsd6RMkjVDRZzb (George)  ·  NOT elevenlabs_KeU8... (prefix is auto-removed)",
      },
      {
        key: "TTS_MODEL",
        label: "ElevenLabs model",
        desc: "ElevenLabs model id. `eleven_multilingual_v2` is the recommended default (good quality, multilingual). Use `eleven_turbo_v2_5` for faster/cheaper generation.",
        examples: "eleven_multilingual_v2 (default)  ·  eleven_turbo_v2_5  ·  eleven_monolingual_v1",
      },
      {
        key: "TTS_SPEED",
        label: "Voice speed",
        desc: "How fast the narration plays. 1.0 = normal. LOWER = slower, calmer voice (and because each scene lasts as long as its narration, a slower voice also makes the video change scenes more slowly). The pitch stays natural — it's not chipmunk/slow-mo, just paced. Try 0.9 if the voice feels rushed.",
        examples: "1.0 = normal  ·  0.9 = noticeably calmer (recommended if too fast)  ·  0.85 = slow/documentary",
      },
      {
        key: "MAX_CLIP_SECONDS",
        label: "Max seconds per b-roll clip",
        desc: "Smooth-voice mode only. Keeps the picture moving: if one scene's narration runs longer than this, the app fetches SEVERAL different Pexels clips for that scene (each this many seconds) instead of stretching or freezing one clip. Lower = more visual variety, more Pexels usage. Set to 0 to use just one clip per scene no matter how long it is.",
        examples: "7 = default  ·  5 = livelier / more cuts  ·  0 = one clip per scene",
      },
    ],
  },
  {
    title: "Stock Footage (Pexels)",
    subtitle: "Each scene gets one stock clip from Pexels matched against its visual prompt.",
    fields: [
      {
        key: "STOCK_FOOTAGE_ORIENTATION",
        label: "Orientation",
        desc: "Which clip orientations Pexels returns. `landscape` for 16:9 long-form YouTube. `portrait` for 9:16 Shorts/TikTok/Reels. `square` for 1:1.",
        examples: "landscape (default)  ·  portrait  ·  square",
      },
      {
        key: "STOCK_FOOTAGE_MAX_HEIGHT",
        label: "Max clip height (px)",
        desc: "Caps the resolution Pexels delivers. 1080 = good quality, modest file size. 2160 = 4K.",
        examples: "720  ·  1080 (default)  ·  2160",
      },
      {
        key: "STOCK_FOOTAGE_MIN_DURATION",
        label: "Min clip duration (seconds)",
        desc: "Filters out short stinger clips that don't have enough length to fill a scene.",
        examples: "4 (default)  ·  6 for longer narration  ·  0 = no filter",
      },
      {
        key: "SCENE_PHOTO_RATIO",
        label: "Photo / video mix (%)",
        desc: "Percentage of scenes that use a STILL PHOTO with smooth ken-burns zoom instead of a moving stock video. Mixing photos in adds visual variety and helps where Pexels has stronger photos than videos for a given query. 0 = only videos, 100 = only photos. Default 40.",
        examples: "0 = video only  ·  40 = balanced mix (default)  ·  100 = photos only",
      },
      {
        key: "SCENE_MIX_MODE",
        label: "Photo distribution",
        desc: "How photo scenes are picked across the timeline. `random` shuffles for unpredictable variety. `alternating` spreads photos evenly (predictable rhythm).",
        examples: "random (default)  ·  alternating",
      },
      {
        key: "IMAGE_RATIO",
        label: "Output aspect ratio",
        desc: "Aspect ratio of the FINAL video. Match this to your orientation setting above (landscape→16:9, portrait→9:16).",
        examples: "16:9 (default)  ·  9:16  ·  1:1",
      },
    ],
  },
  {
    title: "Video Assembly (FFmpeg)",
    subtitle: "Final stitching step.",
    fields: [
      {
        key: "VIDEO_RESOLUTION",
        desc: "Final video resolution. 1920x1080 (1080p) is the YouTube standard.",
        examples: "1920x1080, 1280x720, 3840x2160",
      },
      {
        key: "VIDEO_FPS",
        desc: "Frames per second. 24 is cinematic. 30 is YouTube standard. 60 doubles render time.",
        examples: "24, 30, 60",
      },
      {
        key: "TRANSITION_MIN",
        label: "Transition length — min (s)",
        desc: "The transition is always a clean crossfade. Its LENGTH is randomized per scene change between this minimum and the maximum below — so the pacing feels varied and dynamic instead of every cut being identical. This is the shortest (snappiest) a cut can be.",
        examples: "0.3 = default  ·  0.2 = snappier",
      },
      {
        key: "TRANSITION_MAX",
        label: "Transition length — max (s)",
        desc: "The longest a single crossfade can be. Keep it modest (≤ ~1s) so the viewer never sits through a slow blend. Set min = max for identical transitions everywhere. Set max = 0 for instant hard cuts (no crossfade).",
        examples: "0.7 = default  ·  1.0 = a touch more cinematic  ·  0 = hard cuts",
      },
      {
        key: "SCENE_TAIL_SILENCE",
        label: "Pause between scenes (per-scene mode only)",
        desc: "ONLY applies when Voice mode = per-scene. It adds silence at the end of each separately-recorded scene. In the recommended single-shot (Groq) mode the narration is one continuous take with no scene-by-scene audio boundaries, so this setting does NOTHING there — pace single-shot videos with Voice speed instead.",
        examples: "per-scene: 0.4 = natural (default) · 0.8–1.2 = slower  ·  single-shot: no effect",
      },
      {
        key: "SCENE_DURATION_SECONDS",
        desc: "Fallback clip duration when TTS audio length is somehow unknown.",
        examples: "default 5",
      },
    ],
  },
  {
    title: "Performance (Concurrency)",
    subtitle: "How many parallel jobs and FFmpeg renders to run at once.",
    fields: [
      {
        key: "TTS_CONCURRENCY",
        desc: "Simultaneous ai33pro TTS tasks.",
        examples: "default 3",
      },
      {
        key: "ANIMATION_CONCURRENCY",
        desc: "Simultaneous Pexels searches + downloads. The app handles rate limits automatically (rotates between PEXELS_API_KEY entries, auto-waits when all are exhausted), so 5 is safe even for huge videos. Raise to 8-10 if you have 3+ Pexels keys configured.",
        examples: "default 5  ·  8-10 with multiple keys",
      },
      {
        key: "ASSEMBLE_CONCURRENCY",
        desc: "How many FFmpeg clip renders happen in parallel. CPU-bound — set roughly to half your CPU core count.",
        examples: "default 4",
      },
    ],
  },
  {
    title: "Reliability",
    subtitle: "How tolerant a run is of failures.",
    fields: [
      {
        key: "FAILURE_THRESHOLD_PERCENT",
        desc: "If more than this percentage of scenes fail, the whole run aborts. Default 25.",
        examples: "25 = default (strict)  ·  60-70 = tolerant  ·  100 = never abort",
      },
    ],
  },
];
