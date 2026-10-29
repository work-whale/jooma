// The words an AI image is generated from, kept apart from the OpenAI call in
// ai-image.ts so they can be tested without one.

export type ImageStyle =
  | "storybook"
  | "illustration"
  | "photographic"
  | "painted"
  | "line-drawing"
  | "comic-book";

// AI image orientations, one per size the image models support.
//   square    — slide image-left/right frames (~0.93 ratio) and any frame that
//               sits between 0.77 and 1.30 (mostly square).
//   landscape — image-full slides and the title-cover hero (1.78 ratio).
//   portrait  — for tall frames if we ever introduce them; mapped from <0.77.
export type AIImageOrientation = "square" | "landscape" | "portrait";

/** What the picture is for, as the prompt names it. A worksheet's pictures
 *  are printed, often in black and white, so they are not framed as slides. */
export type ImagePurpose = "presentation slide" | "printed worksheet";

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  "storybook": "Children's storybook illustration, soft pastel colors, friendly characters",
  "illustration": "Flat vector illustration, modern, clean lines, vibrant colors",
  "photographic": "Photographic, realistic, high quality, natural lighting",
  "painted": "Oil painting style, rich textures, painterly brushstrokes",
  "line-drawing": "Black and white line drawing, minimal, hand-drawn lines, no shading",
  "comic-book": "Comic book illustration, bold outlines, halftone shading, vibrant colors",
};

export function aiImagePrompt(
  query: string,
  style: ImageStyle,
  orientation: AIImageOrientation,
  /** The slide's or sheet's title, so the model stays anchored to the topic
   *  rather than the bare noun query. */
  subject?: string,
  purpose: ImagePurpose = "presentation slide",
): string {
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
  const subjectLine = subject
    ? `Subject: ${subject} — ${query}`
    : `Subject: ${query}`;
  return `${STYLE_PROMPTS[style] ?? STYLE_PROMPTS.photographic}. ${subjectLine}. ${composition}, suitable for a ${purpose}. ${noText}`;
}
