import { NextRequest, NextResponse } from "next/server";
import { generateAIImage, type ImageStyle } from "@/app/lib/ai-image";

export const maxDuration = 120;

interface RequestBody {
  prompt: string;
  style?: ImageStyle;
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

  const img = await generateAIImage(body.prompt.trim(), body.style ?? "photographic");
  if (!img) {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
  return NextResponse.json(img);
}
