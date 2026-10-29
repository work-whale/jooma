// One picture for a worksheet or comprehension, found after its text has
// streamed (app/lib/sheets/pictures.ts). Fetched and stored exactly as a
// slideshow's images are: a web picture is Pixabay's best match for the query,
// an AI one goes through generateAIImage, and both are compressed into the
// public images bucket, so the sheet only ever holds a URL.
//
// Signed in only (the proxy needs a session for /api/*), and listed in
// COST_BEARING_PATHS, so an AI picture stops at the spend ceiling without
// counting as another generation.

import { NextRequest, NextResponse } from "next/server";
import { generateAIImage } from "@/app/lib/ai-image";
import { searchPixabay } from "@/app/lib/slideshow-pipeline";
import { isPictureStyle, type PictureSource } from "@/app/lib/sheets/picture-options";
import { recordAssetCost } from "@/app/lib/usage";

export const maxDuration = 120;

const TOOL_SLUG = { worksheet: "worksheet-generator", comprehension: "comprehension-generator" } as const;

interface Body {
  query?: string;
  source?: PictureSource;
  style?: string;
  tool?: keyof typeof TOOL_SLUG;
  /** The sheet's title: anchors an AI picture to the topic, as a slide title does. */
  title?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const query = body.query?.trim().slice(0, 120);
  const source = body.source;
  const toolSlug = body.tool ? TOOL_SLUG[body.tool] : undefined;
  if (!query || !toolSlug || (source !== "web" && source !== "ai" && source !== "auto")) {
    return NextResponse.json({ error: "Missing query, tool or source" }, { status: 400 });
  }
  const style = isPictureStyle(body.style) ? body.style : "illustration";
  const title = body.title?.trim().slice(0, 120) || undefined;

  const web = async () => {
    const hit = await searchPixabay(query, "landscape");
    return hit ? { src: hit.dataUrl, width: hit.width, height: hit.height, source: "web" as const } : null;
  };
  const ai = async () => {
    // "slide" quality, as for a slideshow's own images: a sheet's pictures
    // are small and usually printed.
    const img = await generateAIImage(query, style, "landscape", title, { use: "slide", purpose: "printed worksheet" });
    if (!img) return null;
    await recordAssetCost(toolSlug, "image", 1, img.costUsd ?? 0, "Pictures", title ?? null);
    return { src: img.dataUrl, width: img.width, height: img.height, source: "ai" as const, model: img.model };
  };

  // Auto: a free photo first, and an AI picture only when none was found. A
  // sheet holds at most three pictures, so a slideshow's web to AI mix would
  // round to nothing.
  const found = source === "web" ? await web() : source === "ai" ? await ai() : ((await web()) ?? (await ai()));
  if (!found) return NextResponse.json({ error: "No picture found" }, { status: 404 });
  return NextResponse.json({ ...found, style: found.source === "ai" ? style : undefined });
}
