import fs from "node:fs";
import path from "node:path";
import db from "../db";
import { log } from "../logger";
import { getSetting } from "../settings";
import {
  ensureTopLevelFolders,
  findOrCreateFolder,
  getDriveClient,
  uploadFile,
  uploadString,
} from "./gdrive";
import type { Scene } from "./scene-split";

/**
 * Shape of a scene's source asset on disk. The animations/ dir holds the raw
 * Pexels footage (scene_NNN.mp4) for video scenes and the still photo
 * (scene_NNN.jpg) for ken-burns photo scenes — both without voiceover, so
 * they're a clean source backup.
 */
export interface SceneAsset {
  scene: Scene;
  /** Local path to the scene's source asset (mp4 for video, jpg for photo). */
  assetPath: string;
  /** "video" = scene_NNN.mp4, "photo" = scene_NNN.jpg. */
  kind: "video" | "photo";
}

interface ClipsManifestEntry {
  index: number;
  file: string;
  kind: "video" | "photo";
  drive_file_id: string;
  scene_text: string;
  visual_prompt: string;
  duration_hint_sec: number;
}

interface ClipsManifest {
  schema_version: 1;
  run_id: string;
  run_title: string | null;
  folder_name: string;
  created_at: string;
  scene_count: number;
  settings_snapshot: {
    stock_footage_orientation: string;
    stock_footage_max_height: string;
    scene_photo_ratio: string;
    image_ratio: string;
    video_resolution: string;
    video_fps: string;
  };
  clips: ClipsManifestEntry[];
}

const getRunRow = db.prepare("SELECT title, folder_name FROM runs WHERE id = ?");

/**
 * Upload a finished run to Google Drive as a best-effort backup.
 *
 * Layout in Drive:
 *   Conveyer/Runs/{runFolderName}/
 *     scene_001.mp4 | scene_001.jpg   ← per-scene source asset, no voiceover
 *     scene_002.mp4 | scene_002.jpg
 *     ...
 *     clips.json                      ← machine-readable manifest
 *     description.md                  ← human-readable summary
 *   Conveyer/Final Videos/{runFolderName}.mp4
 *
 * Unlike the parent project, local files are KEPT after upload — this is a pure
 * backup (no Drive-library reuse feature), so the user always has both copies.
 *
 * Returns true when an upload actually happened; false when sync is disabled or
 * Drive isn't connected (everything is left on disk untouched).
 *
 * Reads the run's scenes + assets from disk rather than from an in-memory
 * AssembleInput[], so the pipeline can call it without threading state through.
 */
export async function syncRunToDrive(
  runId: string,
  runDir: string,
  finalPath: string,
  options: { force?: boolean } = {}
): Promise<boolean> {
  // `force` lets a manual re-sync trigger an upload even when the auto-sync
  // toggle is off — manual action is always honored.
  const syncEnabled = options.force || getSetting("GDRIVE_SYNC_ENABLED") === "1";
  if (!syncEnabled) return false;

  const drive = getDriveClient();
  if (!drive) {
    log(
      runId,
      "warn",
      "Drive sync enabled but not connected — skipping upload. Reconnect in /settings.",
      { stage: "gdrive" }
    );
    return false;
  }

  const runRow = getRunRow.get(runId) as
    | { title: string | null; folder_name: string | null }
    | undefined;
  const folderName = runRow?.folder_name ?? path.basename(runDir);
  const title = runRow?.title ?? null;

  log(runId, "info", `Drive sync starting · folder: ${folderName}`, { stage: "gdrive" });

  const { finalVideosId, runsFolderId } = await ensureTopLevelFolders();

  // Per-run folder inside Runs: Conveyer / Runs / {run}.
  const runFolderId = await findOrCreateFolder(folderName, runsFolderId);

  // 1. Upload per-scene source assets (animations/scene_*.mp4 + scene_*.jpg).
  const sceneAssets = rebuildSceneAssetsFromDisk(runDir);
  const uploadedClips: ClipsManifestEntry[] = [];
  for (const asset of sceneAssets) {
    if (!fs.existsSync(asset.assetPath)) {
      log(runId, "warn", `Scene #${asset.scene.index}: no source asset to upload, skipped`, {
        stage: "gdrive",
      });
      continue;
    }
    const fileName = path.basename(asset.assetPath);
    try {
      const fileId = await uploadFile(asset.assetPath, runFolderId, { name: fileName });
      uploadedClips.push({
        index: asset.scene.index,
        file: fileName,
        kind: asset.kind,
        drive_file_id: fileId,
        scene_text: asset.scene.text,
        visual_prompt: asset.scene.visual_prompt,
        duration_hint_sec: asset.scene.duration_hint_sec,
      });
      log(runId, "info", `Uploaded ${fileName} → Drive`, { stage: "gdrive" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(runId, "error", `Failed to upload ${fileName}: ${msg}`, { stage: "gdrive" });
      throw e; // bubble up — caller logs; local copy is untouched so a retry is safe
    }
  }

  // 2. Build + upload manifest files.
  const manifest: ClipsManifest = {
    schema_version: 1,
    run_id: runId,
    run_title: title,
    folder_name: folderName,
    created_at: new Date().toISOString(),
    scene_count: sceneAssets.length,
    settings_snapshot: {
      stock_footage_orientation: getSetting("STOCK_FOOTAGE_ORIENTATION"),
      stock_footage_max_height: getSetting("STOCK_FOOTAGE_MAX_HEIGHT"),
      scene_photo_ratio: getSetting("SCENE_PHOTO_RATIO"),
      image_ratio: getSetting("IMAGE_RATIO"),
      video_resolution: getSetting("VIDEO_RESOLUTION"),
      video_fps: getSetting("VIDEO_FPS"),
    },
    clips: uploadedClips,
  };

  await uploadString(
    JSON.stringify(manifest, null, 2),
    runFolderId,
    "clips.json",
    "application/json"
  );
  await uploadString(buildDescriptionMarkdown(manifest), runFolderId, "description.md", "text/markdown");
  log(runId, "info", `Uploaded clips.json + description.md`, { stage: "gdrive" });

  // 3. Upload final video to the Final Videos folder.
  const finalDriveName = `${folderName}.mp4`;
  if (fs.existsSync(finalPath)) {
    await uploadFile(finalPath, finalVideosId, { name: finalDriveName });
    log(runId, "info", `Uploaded final video → Drive/Final Videos/${finalDriveName}`, {
      stage: "gdrive",
    });
  } else {
    log(runId, "warn", `Final video not found at ${finalPath} — skipped`, { stage: "gdrive" });
  }

  log(runId, "success", `Drive sync complete · ${uploadedClips.length} clips + final video`, {
    stage: "gdrive",
  });
  return true;
}

/**
 * Reconstruct SceneAsset[] from files left on disk. Reads scenes.json (always
 * written by the pipeline) and pairs each scene with its source asset by
 * filename convention. Video scenes have scene_NNN.mp4; photo scenes have
 * scene_NNN.jpg. Used both by the normal sync and by any manual re-sync.
 */
export function rebuildSceneAssetsFromDisk(runDir: string): SceneAsset[] {
  const scenesPath = path.join(runDir, "scenes.json");
  if (!fs.existsSync(scenesPath)) return [];
  const scenes = JSON.parse(fs.readFileSync(scenesPath, "utf-8")) as Scene[];

  const animDir = path.join(runDir, "animations");

  const result: SceneAsset[] = [];
  for (const scene of scenes) {
    const padded = String(scene.index).padStart(3, "0");
    const videoPath = path.join(animDir, `scene_${padded}.mp4`);
    const photoPath = path.join(animDir, `scene_${padded}.jpg`);
    if (fs.existsSync(videoPath)) {
      result.push({ scene, assetPath: videoPath, kind: "video" });
    } else if (fs.existsSync(photoPath)) {
      result.push({ scene, assetPath: photoPath, kind: "photo" });
    }
  }
  return result;
}

/** Builds the human-readable description.md companion to clips.json. */
function buildDescriptionMarkdown(m: ClipsManifest): string {
  const lines: string[] = [];
  lines.push(`# Run: ${m.run_title ?? m.folder_name}`);
  lines.push("");
  lines.push(`- **Run ID:** \`${m.run_id}\``);
  lines.push(`- **Folder:** \`${m.folder_name}\``);
  lines.push(`- **Created:** ${m.created_at}`);
  lines.push(`- **Scenes:** ${m.scene_count} (uploaded: ${m.clips.length})`);
  lines.push(
    `- **Output:** ${m.settings_snapshot.image_ratio} · ${m.settings_snapshot.video_resolution} @ ${m.settings_snapshot.video_fps}fps`
  );
  lines.push(
    `- **Footage:** Pexels ${m.settings_snapshot.stock_footage_orientation} · max ${m.settings_snapshot.stock_footage_max_height}p · ${m.settings_snapshot.scene_photo_ratio}% photos`
  );
  lines.push("");
  lines.push(
    "Per-scene source assets below are the raw Pexels footage/photos **without voiceover**."
  );
  lines.push(
    "Field `visual_prompt` is the query used to find the asset. Field `scene_text` is the narration line that played over it in the final video."
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const c of m.clips) {
    lines.push(`## Scene ${c.index}`);
    lines.push("");
    lines.push(`- **File:** \`${c.file}\` (${c.kind})`);
    lines.push(`- **Drive file ID:** \`${c.drive_file_id}\``);
    lines.push("");
    lines.push(`**Visual prompt:**`);
    lines.push("");
    lines.push("```");
    lines.push(c.visual_prompt);
    lines.push("```");
    lines.push("");
    lines.push(`**Scene narration text:**`);
    lines.push("");
    lines.push(c.scene_text);
    lines.push("");
  }

  return lines.join("\n");
}
