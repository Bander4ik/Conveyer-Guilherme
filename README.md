# Conveyer

A local toolkit for faceless YouTube videos with **real Pexels stock footage** and **ElevenLabs voiceover** — entirely on your own computer.

## How it works

1. Paste your script into the web UI
2. Gemini splits it into scenes
3. Each scene gets a stock clip (or still photo with ken-burns zoom) from Pexels
4. Each scene gets a voiceover via ai33.pro (ElevenLabs voices)
5. FFmpeg stitches everything into one MP4 ready for YouTube

No cloud account needed for the app itself — everything runs locally through a web interface at `http://localhost:3000`.

## Quick start

```bash
# Windows
install.bat
start.bat

# macOS / Linux
chmod +x install.command start.command
./install.command
./start.command
```

Then open `http://localhost:3000` and fill in the three API keys in **Settings**.

## Full instructions

See **INSTRUCTIONS.docx** in this folder for the complete non-technical guide:
- Installing Node.js and FFmpeg
- Getting all three API keys
- Picking a voice
- Writing a good script
- Every setting explained
- Troubleshooting common issues

## Requirements

- **Node.js 20+** ([download](https://nodejs.org/))
- **FFmpeg** ([download](https://www.gyan.dev/ffmpeg/builds/) on Windows, `brew install ffmpeg` on macOS)
- Three free / cheap API keys (Gemini, Pexels, ai33.pro)
