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

// Tries gpt-image-1 first (better quality, supports 1536x1024). Falls back to
// DALL·E 3 (1792x1024) if the org isn't verified for gpt-image-1.
export async function generateAIImage(
  query: string,
  style: ImageStyle = "photographic",
): Promise<GeneratedImage | null> {
  if (!query.trim()) return null;
  const client = getOpenAI();
  const prompt = `${STYLE_PROMPTS[style]}. Subject: ${query}. Horizontal composition, suitable for a presentation slide.`;

  const attempts: Array<{
    model: "gpt-image-1" | "dall-e-3";
    size: "1536x1024" | "1792x1024";
    w: number; h: number;
    quality: "medium" | "standard";
  }> = [
    { model: "gpt-image-1", size: "1536x1024", w: 1536, h: 1024, quality: "medium" },
    { model: "dall-e-3",    size: "1792x1024", w: 1792, h: 1024, quality: "standard" },
  ];

  for (const att of attempts) {
    try {
      const r = await client.images.generate({
        model: att.model,
        prompt,
        size: att.size,
        quality: att.quality,
        n: 1,
        ...(att.model === "dall-e-3" ? { response_format: "b64_json" } : {}),
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
