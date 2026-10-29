// The "Add pictures" choice on the Worksheet and Comprehension forms: where
// the pictures come from and, for AI pictures, their style. The same choices
// as a slideshow's images. Shared by the forms, the prompts and the routes, so
// it holds no server code.

import type { ImageStyle } from "@/app/lib/ai-image-prompt";

export type PictureSource = "web" | "ai" | "auto";

export interface SheetPictures {
  source: PictureSource;
  style: ImageStyle;
}

export const PICTURE_SOURCES: { id: PictureSource; label: string; hint: string }[] = [
  { id: "web", label: "Web search", hint: "Free stock photos" },
  { id: "ai", label: "AI-generated", hint: "Made for your topic" },
  { id: "auto", label: "Auto", hint: "A photo, or AI when none fits" },
];

export const PICTURE_STYLES: { id: ImageStyle; label: string }[] = [
  { id: "storybook", label: "Storybook" },
  { id: "illustration", label: "Illustration" },
  { id: "photographic", label: "Photographic" },
  { id: "painted", label: "Painted" },
  { id: "line-drawing", label: "Line drawing" },
  { id: "comic-book", label: "Comic book" },
];

export const DEFAULT_PICTURES: SheetPictures = { source: "web", style: "illustration" };

const isSource = (v: unknown): v is PictureSource => PICTURE_SOURCES.some((s) => s.id === v);
export const isPictureStyle = (v: unknown): v is ImageStyle => PICTURE_STYLES.some((s) => s.id === v);

/** A request's pictures, or null when it asked for none or sent nonsense. */
export function parsePictures(v: unknown): SheetPictures | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isSource(r.source)) return null;
  return { source: r.source, style: isPictureStyle(r.style) ? r.style : DEFAULT_PICTURES.style };
}

/**
 * The prompt's rules for picture blocks, or "" when there are none. Pictures
 * support the sheet only: a stock photo may not show exactly what a question
 * expects, and the teacher may swap or delete it, so nothing may depend on it.
 */
export function picturesPromptLine(pictures: SheetPictures | null, topic: string): string {
  if (!pictures) return "";
  return `
PICTURES
- Add 1 to 3 image blocks: one near the top of the first section, and at most two more inside later sections, only where a picture genuinely helps pupils picture the topic. Never two in the same section.
- query: what to search for, 2 to 4 concrete nouns that show the thing itself and include the subject word (here: "${topic.slice(0, 80)}"). Add "diagram" for a process or a structure, e.g. "water cycle evaporation diagram". Never generic words such as "education", "pupils", "classroom" or "learning".
- alt: one short plain sentence describing the picture for a pupil who cannot see it.
- Pictures only support the sheet. No question, instruction or answer may refer to a picture or need one to be answered.`;
}
