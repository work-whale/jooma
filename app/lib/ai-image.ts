// Shared OpenAI image generation. Used by /api/generate-slideshow (one image per
// AI-illustrated slide) and /api/generate-image (single-image generation triggered
// from the editor's AI tab or right-click "Regenerate").

import { getOpenAI } from "./openai";

export type ImageStyle =
  | "storybook"
  | "illustration"
  | "photographic"
  | "painted"
  | "line-drawing"
  | "comic-book";

export interface GeneratedImage {
  dataUrl: string;
  width: number;
  height: number;
}

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  "storybook": "Children's storybook illustration, soft pastel colors, friendly characters",
  "illustration": "Flat vector illustration, modern, clean lines, vibrant colors",
  "photographic": "Photographic, realistic, high quality, natural lighting",
  "painted": "Oil painting style, rich textures, painterly brushstrokes",
  "line-drawing": "Black and white line drawing, minimal, hand-drawn lines, no shading",
  "comic-book": "Comic book illustration, bold outlines, halftone shading, vibrant colors",
};

// AI image orientations supported by both gpt-image-1 and dall-e-3.
//   square    — slide image-left/right frames (~0.93 ratio) and any frame that
//               sits between 0.77 and 1.30 (mostly square).
//   landscape — image-full slides and the title-cover hero (1.78 ratio).
//   portrait  — for tall frames if we ever introduce them; mapped from <0.77.
export type AIImageOrientation = "square" | "landscape" | "portrait";

/** Pick the orientation that best matches a frame's width / height ratio. */
export function orientationForFrame(width: number, height: number): AIImageOrientation {
  const r = width / Math.max(1, height);
  if (r >= 1.30) return "landscape";
  if (r <= 0.77) return "portrait";
  return "square";
}

// Tries gpt-image-1 first (better quality). Falls back to DALL·E 3 if the org
// isn't verified for gpt-image-1. Picks the size for each model that matches
// the requested orientation so the AI doesn't generate a landscape image for
// a roughly-square slide frame and vice versa.
export async function generateAIImage(
  query: string,
  style: ImageStyle = "photographic",
  orientation: AIImageOrientation = "landscape",
): Promise<GeneratedImage | null> {
  if (!query.trim()) return null;
  const client = getOpenAI();
  const composition =
    orientation === "square"
      ? "Square composition, balanced framing, centred subject"
      : orientation === "portrait"
      ? "Vertical / portrait composition, tall framing"
      : "Horizontal / landscape composition, wide framing";
  const prompt = `${STYLE_PROMPTS[style]}. Subject: ${query}. ${composition}, suitable for a presentation slide.`;

  // Supported sizes per model:
  //   gpt-image-1 → 1024x1024 (sq), 1024x1536 (port), 1536x1024 (land)
  //   dall-e-3   → 1024x1024 (sq), 1024x1792 (port), 1792x1024 (land)
  const sizes: Record<
    AIImageOrientation,
    Array<{
      model: "gpt-image-1" | "dall-e-3";
      size: "1024x1024" | "1536x1024" | "1024x1536" | "1792x1024" | "1024x1792";
      w: number; h: number;
      quality: "medium" | "standard";
    }>
  > = {
    square: [
      { model: "gpt-image-1", size: "1024x1024", w: 1024, h: 1024, quality: "medium" },
      { model: "dall-e-3",    size: "1024x1024", w: 1024, h: 1024, quality: "standard" },
    ],
    landscape: [
      { model: "gpt-image-1", size: "1536x1024", w: 1536, h: 1024, quality: "medium" },
      { model: "dall-e-3",    size: "1792x1024", w: 1792, h: 1024, quality: "standard" },
    ],
    portrait: [
      { model: "gpt-image-1", size: "1024x1536", w: 1024, h: 1536, quality: "medium" },
      { model: "dall-e-3",    size: "1024x1792", w: 1024, h: 1792, quality: "standard" },
    ],
  };

  for (const att of sizes[orientation]) {
    try {
      // Newer OpenAI SDKs reject `response_format` for both gpt-image-1 and
      // dall-e-3, so we don't pass it — we fall back to fetching the returned
      // URL ourselves below when needed.
      const r = await client.images.generate({
        model: att.model,
        prompt,
        size: att.size,
        quality: att.quality,
        n: 1,
      });
      const item = r.data?.[0];
      if (!item) continue;
      if (item.b64_json) {
        return { dataUrl: `data:image/png;base64,${item.b64_json}`, width: att.w, height: att.h };
      }
      if (item.url) {
        const imgRes = await fetch(item.url);
        if (!imgRes.ok) continue;
        const buf = await imgRes.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        return { dataUrl: `data:image/png;base64,${b64}`, width: att.w, height: att.h };
      }
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.warn(`AI image gen failed (${att.model}):`, e.status, e.message);
    }
  }
  return null;
}
