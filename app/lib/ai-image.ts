// Shared OpenAI image generation. Used by /api/generate-slideshow (one image per
// AI-illustrated slide) and /api/generate-image (single-image generation triggered
// from the editor's AI tab or right-click "Regenerate").

import { getOpenAI } from "./openai";
import { uploadImageBytes } from "./imageStorage";

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
  // Explicit no-text directive — image generators love baking labels into
  // illustrations (e.g. a multi-planet activity image with "MARS" / "EUROPA"
  // written across the planets). We want clean photos / illustrations only;
  // any labelling lives in the slide's text layer.
  const noText = "Absolutely no text, no letters, no labels, no captions, no watermarks, no logos, no typography of any kind anywhere in the image. Pure visual only.";
  const prompt = `${STYLE_PROMPTS[style]}. Subject: ${query}. ${composition}, suitable for a presentation slide. ${noText}`;

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

      // Grab the raw image bytes, however the model returned them, then push
      // them straight to Supabase Storage. `dataUrl` on the result becomes a
      // public CDN URL — the slide JSON only ever stores URLs, never base64.
      let bytes: Uint8Array | null = null;
      if (item.b64_json) {
        bytes = new Uint8Array(Buffer.from(item.b64_json, "base64"));
      } else if (item.url) {
        const imgRes = await fetch(item.url);
        if (!imgRes.ok) continue;
        bytes = new Uint8Array(await imgRes.arrayBuffer());
      }
      if (!bytes) continue;

      try {
        const publicUrl = await uploadImageBytes(bytes, "image/png", "ai");
        return { dataUrl: publicUrl, width: att.w, height: att.h };
      } catch (uploadErr) {
        console.error("AI image storage upload failed:", uploadErr);
        // Bail rather than fall back to base64 — base64 is exactly what we're
        // trying to keep out of Postgres. Better to fail the image fetch and
        // let the slide render its placeholder than to bloat the deck.
        return null;
      }
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.warn(`AI image gen failed (${att.model}):`, e.status, e.message);
    }
  }
  return null;
}
