import { NextResponse } from "next/server";
import { ensureInit } from "@/lib/init";
import { splitScriptPreview } from "@/lib/services/scene-split";

interface Body {
  script?: string;
}

/**
 * Splits a script into scenes WITHOUT creating a run in the DB. Used by the
 * New Run page to show the user a preview of scenes before committing to a
 * pipeline run.
 */
export async function POST(req: Request) {
  ensureInit();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const script = (body.script ?? "").trim();
  if (!script) {
    return NextResponse.json({ error: "script is empty" }, { status: 400 });
  }

  try {
    const scenes = await splitScriptPreview(script);
    return NextResponse.json({ scenes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
