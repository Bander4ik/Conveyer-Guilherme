import fs from "node:fs";
import path from "node:path";
import { getSetting } from "../settings";
import { getPrompt } from "../prompts";
import { log } from "../logger";
import { getRunDir } from "../run-paths";

export interface Scene {
  index: number;
  text: string;
  visual_prompt: string;
  duration_hint_sec: number;
}

/**
 * Splits the script into scenes using Google Gemini (single-shot).
 */
export async function splitScript(runId: string, script: string): Promise<Scene[]> {
  const systemPrompt = getPrompt("scene_split");
  const totalWords = script.trim().split(/\s+/).filter(Boolean).length;

  log(runId, "info", `Splitting script (gemini) — ${totalWords} words`, {
    stage: "scene_split",
    data: { scriptChars: script.length, totalWords },
  });

  const rawScenes = await processChunk(systemPrompt, script, runId);
  const scenes = enforceMaxSceneLength(rawScenes);

  // Coverage check: words in scene.text vs original script.
  const sceneWords = scenes.reduce(
    (sum, s) => sum + s.text.trim().split(/\s+/).filter(Boolean).length,
    0
  );
  const coverage = totalWords > 0 ? (sceneWords / totalWords) * 100 : 0;

  log(
    runId,
    "success",
    `Done: ${scenes.length} scenes · script coverage ${coverage.toFixed(0)}% (${sceneWords}/${totalWords} words)`,
    {
      stage: "scene_split",
      data: { scenes: scenes.slice(0, 5).map((s) => ({ i: s.index, text: s.text.slice(0, 60) })) },
    }
  );

  if (coverage < 70) {
    log(
      runId,
      "warn",
      `Low coverage (${coverage.toFixed(0)}%) — the model likely summarized the script.`,
      { stage: "scene_split" }
    );
  }

  return scenes;
}

/** Preview variant — no run logs, no on-disk artifacts. */
export async function splitScriptPreview(script: string): Promise<Scene[]> {
  const systemPrompt = getPrompt("scene_split");
  const rawScenes = await processChunk(systemPrompt, script, null);
  return enforceMaxSceneLength(rawScenes);
}

async function processChunk(
  systemPrompt: string,
  scriptChunk: string,
  runId: string | null
): Promise<Scene[]> {
  const raw = await splitWithGemini(systemPrompt, scriptChunk);

  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (e) {
    if (runId) {
      try {
        const runDir = getRunDir(runId);
        fs.mkdirSync(runDir, { recursive: true });
        const filename = `scene_split_raw.txt`;
        fs.writeFileSync(path.join(runDir, filename), raw, "utf-8");
        log(runId, "error", `Raw output saved to ${runDir}/${filename} (${raw.length} chars)`, {
          stage: "scene_split",
        });
      } catch {}
    }
    throw e;
  }
  if (!Array.isArray(json)) {
    if (runId) {
      log(runId, "error", "LLM did not return an array", {
        stage: "scene_split",
        data: { raw: raw.slice(0, 500) },
      });
    }
    throw new Error("scene_split: model did not return a JSON array");
  }

  return json.map((s, i) => ({
    index: i,
    text: String(s.text ?? ""),
    visual_prompt: String(s.visual_prompt ?? ""),
    duration_hint_sec: Number(s.duration_hint_sec ?? 6),
  }));
}

/**
 * HARD GUARD against over-long scenes. Stock clips average ~6 seconds — keep
 * narration short so each clip covers its audio without freezing.
 */
const MAX_SCENE_WORDS = 11;

function enforceMaxSceneLength(scenes: Scene[]): Scene[] {
  const out: Scene[] = [];
  for (const s of scenes) {
    const words = s.text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= MAX_SCENE_WORDS) {
      out.push(s);
      continue;
    }
    const chunkCount = Math.ceil(words.length / MAX_SCENE_WORDS);
    const perChunk = Math.ceil(words.length / chunkCount);
    for (let i = 0; i < words.length; i += perChunk) {
      const chunkWords = words.slice(i, i + perChunk);
      out.push({
        index: 0, // reindexed below
        text: chunkWords.join(" "),
        visual_prompt: s.visual_prompt,
        duration_hint_sec: Math.min(6, Math.max(2, Math.round((chunkWords.length / 150) * 60))),
      });
    }
  }
  return out.map((s, i) => ({ ...s, index: i }));
}

async function splitWithGemini(systemPrompt: string, script: string): Promise<string> {
  const apiKey = getSetting("GOOGLE_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set (Settings)");
  const model = getSetting("SCENE_SPLIT_MODEL") || "gemini-flash-latest";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: `Script:\n\n${script}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 65535,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_RETRIES = 4;
  let attempt = 0;
  let lastErr = "";

  while (attempt <= MAX_RETRIES) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (resp.ok) {
      const json = (await resp.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          finishReason?: string;
        }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      };
      const cand = json.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const reason = cand?.finishReason;
      if (reason && reason !== "STOP") {
        throw new Error(
          `Gemini finish=${reason} (output cut off, tokens=${json.usageMetadata?.candidatesTokenCount}). The script is likely too long for one Gemini call — try splitting it manually.`
        );
      }
      if (!text) throw new Error(`Gemini: empty output (${JSON.stringify(json).slice(0, 300)})`);
      return text;
    }
    const errText = (await resp.text()).slice(0, 400);
    lastErr = `Gemini ${resp.status}: ${errText}`;
    if (!RETRYABLE.has(resp.status) || attempt === MAX_RETRIES) {
      throw new Error(lastErr);
    }
    const waitMs = 1000 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
    attempt++;
  }
  throw new Error(lastErr);
}

/** Extracts the first JSON array from a text response, even if the model added markdown. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    throw new Error("Could not parse JSON from model response");
  }
}
