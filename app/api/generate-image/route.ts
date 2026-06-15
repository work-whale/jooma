import { NextRequest, NextResponse } from "next/server";
import { generateAIImage, orientationForFrame, type ImageStyle, type AIImageOrientation } from "@/app/lib/ai-image";
import { recordAssetCost } from "@/app/lib/usage";

export const maxDuration = 120;

interface RequestBody {
  prompt: string;
  style?: ImageStyle;
  /** Explicit orientation override. */
  orientation?: AIImageOrientation;
  /** Or pass the target frame's pixel dimensions and we'll derive the
   *  closest orientation (square / landscape / portrait). */
  frameWidth?: number;
  frameHeight?: number;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  // Resolve the orientation: explicit override wins; otherwise compute from
  // frame dims if provided; otherwise default to landscape (preserves the
  // previous behaviour for callers that haven't been updated yet).
  const orientation: AIImageOrientation =
    body.orientation ??
    (body.frameWidth && body.frameHeight
      ? orientationForFrame(body.frameWidth, body.frameHeight)
      : "landscape");

  const img = await generateAIImage(body.prompt.trim(), body.style ?? "photographic", orientation);
  if (!img) {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
  void recordAssetCost("generate-image", "image", 1, img.costUsd ?? 0);
  return NextResponse.json(img);
}
