import { NextResponse } from "next/server";
import { ensureInit } from "@/lib/init";
import { getSetting } from "@/lib/settings";

/**
 * Returns runtime stats used by the UI for estimate widgets.
 */
export async function GET() {
  ensureInit();
  const ai33Key = getSetting("AI33PRO_API_KEY").trim();
  const keyConfigured = ai33Key.length > 0 ? 1 : 0;
  const ttsConcurrency = Math.max(1, Number(getSetting("TTS_CONCURRENCY") || "3"));
  const animConcurrency = Math.max(1, Number(getSetting("ANIMATION_CONCURRENCY") || "5"));
  const assembleConcurrency = Math.max(1, Number(getSetting("ASSEMBLE_CONCURRENCY") || "4"));

  return NextResponse.json({
    keyConfigured,
    ttsConcurrency,
    animConcurrency,
    assembleConcurrency,
  });
}
