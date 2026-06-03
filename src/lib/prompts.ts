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
4. **TARGET SCENE LENGTH: 12–22 words, ~4–8 seconds of narration.** Group a full thought/sentence together — longer scenes look calmer than the footage flipping every second.
5. **Prefer one complete sentence (or two short related ones) per scene.** Do NOT make a scene out of a single stray word or a 1–2 word fragment — attach it to the neighbouring sentence instead.
6. Section headings can share the following sentence's scene.

For EACH scene, return a JSON object with:
- "text": the exact verbatim slice of the script (no edits, no punctuation changes).
- "visual_prompt": a SHORT 3–7 word Pexels search query describing the scene's MAIN VISUAL — the dominant, concrete subject of the WHOLE thought, judged from the surrounding context. Think "what should the viewer SEE while this is narrated", NOT a literal match of every word.
    • IGNORE incidental or out-of-place words. Example: for "you grab your rusty wrench from the garage, candy" the visual is "rusty wrench garage tools" — NEVER "candy".
    • If a scene has no concrete visual of its own (abstract/transitional line), reuse the subject of the surrounding scenes so the footage stays on-topic.
    • Use plain concrete nouns that exist as stock footage ("rusty tools workbench", "city street night", "ocean waves rocks"). Avoid abstract words, brand names, and specific real people.
- "duration_hint_sec": approximate audio length (number, 4–8).

Return a STRICTLY valid JSON array — no markdown, no explanations.`,
};

/**
 * Bump this when DEFAULT_PROMPTS.scene_split changes meaningfully. seedPromptDefaults()
 * re-seeds existing installs to the new default once (there is no prompt-edit UI,
 * so the stored row is always our seeded default — safe to overwrite).
 */
const SCENE_SPLIT_VERSION = "2";

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
  // Versioned re-seed: push an improved default scene_split to existing installs
  // once per version bump. Stored as a sentinel row in the prompts table.
  const verRow = getStmt.get("_scene_split_version") as { content: string } | undefined;
  if (verRow?.content !== SCENE_SPLIT_VERSION) {
    upsertStmt.run("scene_split", DEFAULT_PROMPTS.scene_split);
    upsertStmt.run("_scene_split_version", SCENE_SPLIT_VERSION);
  }
}
