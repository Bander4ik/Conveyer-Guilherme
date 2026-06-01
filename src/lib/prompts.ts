import db from "./db";

export const PROMPT_NAMES = ["scene_split"] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

export const DEFAULT_PROMPTS: Record<PromptName, string> = {
  scene_split: `You are the editor of a faceless YouTube documentary channel.
Split the provided script into scenes for an automated stock-footage video pipeline.

CRITICAL RULES:
1. Cover the ENTIRE script verbatim, with NO omissions, no summarizing, no paraphrasing.
2. The concatenation of every scene's "text" field (joined by spaces) MUST equal the original script word-for-word.
3. **NEVER split a sentence in the middle.** A sentence ends ONLY at a period (.), question mark (?), or exclamation mark (!). Commas, semicolons, dashes, and colons are NOT sentence boundaries — they MUST stay inside one scene.
4. **TARGET SCENE LENGTH: 8–13 words, ~50–80 characters, ~3.5–5.5 seconds of narration.**
5. **HARD MAX: 15 words / 90 characters / ~6 seconds per scene.**
6. **Prefer 1 short sentence per scene.** Two very short clauses sharing a beat are OK if both under 7 words combined.
7. Section headings get their own short scene.

For EACH scene, return a JSON object with:
- "text": the exact verbatim slice of the script (no edits, no punctuation changes).
- "visual_prompt": a SHORT 3–8 word natural-language search query for Pexels stock footage that LITERALLY illustrates this scene's content. Use concrete nouns and visual concepts that exist as stock footage (e.g. "sunrise over mountains", "hands kneading bread", "ocean waves rocks"). Avoid abstract words, brand names, or specific people.
- "duration_hint_sec": approximate audio length (number, 3–6).

Return a STRICTLY valid JSON array — no markdown, no explanations.`,
};

const getStmt = db.prepare("SELECT content FROM prompts WHERE name = ?");
const upsertStmt = db.prepare(
  "INSERT INTO prompts (name, content, updated_at) VALUES (?, ?, datetime('now')) " +
    "ON CONFLICT(name) DO UPDATE SET content = excluded.content, updated_at = datetime('now')"
);

export function getPrompt(name: PromptName): string {
  const row = getStmt.get(name) as { content: string } | undefined;
  if (row?.content) return row.content;
  return DEFAULT_PROMPTS[name];
}

export function setPrompt(name: PromptName, content: string) {
  upsertStmt.run(name, content);
}

export function seedPromptDefaults() {
  for (const [n, c] of Object.entries(DEFAULT_PROMPTS)) {
    const row = getStmt.get(n) as { content: string } | undefined;
    if (!row) upsertStmt.run(n, c);
  }
}
