// Shared OpenAI image generation. Used by /api/generate-slideshow (one image per
// AI-illustrated slide) and /api/generate-image (single-image generation triggered
// from the editor's AI tab or right-click "Regenerate").
//
// Quality is set per use in /admin/tools (see image-quality.ts): by default the
// slideshow's title image is medium and its other images low, since most sit in
// small frames on a classroom screen where the difference is hard to see.

import { getOpenAI } from "./openai";
import { uploadImageBytes } from "./imageStorage";
import { imageSettings } from "./image-settings";
import {
  IMAGE_MODELS,
  gptImageCostUsd,
  qualityFor,
  type ImageModel,
  type ImageQuality,
  type ImageSize,
  type ImageUse,
} from "./image-quality";

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
  /** Which model actually served the image (for cost tracking). */
  model?: ImageModel;
  /** The size string requested (e.g. "1024x1024"). */
  size?: string;
  /** The quality requested. */
  quality?: ImageQuality;
  /** Estimated USD cost of this single image. */
  costUsd?: number;
}

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  "storybook": "Children's storybook illustration, soft pastel colors, friendly characters",
  "illustration": "Flat vector illustration, modern, clean lines, vibrant colors",
  "photographic": "Photographic, realistic, high quality, natural lighting",
  "painted": "Oil painting style, rich textures, painterly brushstrokes",
  "line-drawing": "Black and white line drawing, minimal, hand-drawn lines, no shading",
  "comic-book": "Comic book illustration, bold outlines, halftone shading, vibrant colors",
};

// AI image orientations, one per size the image models support.
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

// Tries each of IMAGE_MODELS in turn (see image-quality.ts for why these), at
// the size that matches the requested orientation, so the AI doesn't generate
// a landscape image for a roughly-square slide frame and vice versa. Prices are
// per size and quality, configured in /admin/tools.
export async function generateAIImage(
  query: string,
  style: ImageStyle = "photographic",
  orientation: AIImageOrientation = "landscape",
  /** Optional slide title — included in the prompt so the model stays
   *  anchored to the slide's topic, not just the bare noun query. */
  slideTitle?: string,
  /** Where the image is going, which picks the configured quality. An explicit
   *  `quality` wins over it (the admin test generator). */
  opts: { use?: ImageUse; quality?: ImageQuality } = {},
): Promise<GeneratedImage | null> {
  if (!query.trim()) return null;
  const client = getOpenAI();
  const settings = await imageSettings();
  const quality = opts.quality ?? qualityFor(settings, opts.use ?? "single");
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
  const subjectLine = slideTitle
    ? `Subject: ${slideTitle} — ${query}`
    : `Subject: ${query}`;
  const prompt = `${STYLE_PROMPTS[style]}. ${subjectLine}. ${composition}, suitable for a presentation slide. ${noText}`;

  const sizes: Record<AIImageOrientation, { size: ImageSize; w: number; h: number }> = {
    square:    { size: "1024x1024", w: 1024, h: 1024 },
    landscape: { size: "1536x1024", w: 1536, h: 1024 },
    portrait:  { size: "1024x1536", w: 1024, h: 1536 },
  };
  const { size, w, h } = sizes[orientation];
  const attempts = IMAGE_MODELS.map((model) => ({ model, size, w, h, quality }));

  for (const att of attempts) {
    try {
      // Newer OpenAI SDKs reject `response_format` for the image models, so we
      // don't pass it — we fall back to fetching the returned
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
        return {
          dataUrl: publicUrl,
          width: att.w,
          height: att.h,
          model: att.model,
          size: att.size,
          quality: att.quality,
          costUsd: gptImageCostUsd(settings, att.size, att.quality) ?? 0.02,
        };
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
  // An error, not a warning: the slide quietly shows an empty frame, so this
  // line is the only sign that AI images are down.
  console.error(`AI image gen failed on every model (${IMAGE_MODELS.join(", ")})`);
  return null;
}
