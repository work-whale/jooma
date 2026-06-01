import { createClient } from "./auth/client";
import { DEFAULT_THEME_ID } from "./slideshowThemes";

export interface TextObject {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Optional explicit height. Unset → box auto-fits the wrapped content.
   *  Set (via the top/bottom resize handles) → box uses it as a min-height so
   *  the text frame stays the chosen size even if content is shorter. */
  height?: number;
  /** Layout-imposed clip height. When set, the text box renders with
   *  overflow:hidden at this pixel height. Does not affect editing or resizing. */
  clipH?: number;
  text: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  underline: boolean;
  fontFamily: string;
  color: string;
  textAlign: "left" | "center" | "right";
  /** CSS line-height multiplier (e.g. 1.0 = tight, 1.5 = relaxed). Defaults to 1.2. */
  lineHeight?: number;
  rotation?: number;
  locked?: boolean;
  listType?: "bullet" | "number";
  /** Global stacking order. Higher = on top. Used by Bring-to-front etc. */
  z?: number;
}

export type ShapeType =
  | "rect" | "ellipse" | "triangle" | "line" | "arrow" | "star" | "hexagon"
  | "pentagon" | "octagon" | "diamond" | "heart" | "cloud" | "speech" | "plus" | "bolt";

export interface ShapeObject {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shadow?: boolean;
  locked?: boolean;
  z?: number;
}

export type ImageFrame =
  | "none"
  | "circle"
  | "rounded"
  | "pill"
  | "diamond"
  | "hexagon"
  | "star"
  | "arch"
  | "chevron"
  | "parallelogram"
  | "blob"
  | "scalloped"
  | "heart"
  | "octagon"
  | "shield"
  | "triangle";

export interface ImageObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;            // empty string indicates an empty frame waiting for an image drop
  opacity: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shadow?: boolean;
  locked?: boolean;
  frame?: ImageFrame;
  cornerRadius?: number;  // px corner radius, applies to rounded/none frames
  strokeColor?: string;
  strokeWidth?: number;   // px, 0 = no stroke
  strokeAlign?: "inside" | "outside" | "center";  // default "inside"
  tint?: string;          // Recolors single-color SVGs (icons, simple graphics)
  // Pan/zoom of the photo INSIDE the frame. Only meaningful when `frame` is set and src is non-empty.
  innerOffsetX?: number;  // px offset from frame center (clamped so frame stays filled)
  innerOffsetY?: number;
  innerScale?: number;    // multiplier on top of cover-fit, >= 1
  naturalWidth?: number;  // measured on first load — drives edit-mode math
  naturalHeight?: number;
  z?: number;
  /** True while the AI is still fetching/generating this image. The renderer
   * shows a shimmer overlay in the frame until the real src arrives. */
  isPending?: boolean;
}

export interface AudioObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;             // public URL (Supabase Storage) to an audio file (mp3/wav)
  title: string;           // short title shown at the top of the card
  description: string;     // 1-2 line explainer of what the clip is about
  questions: string[];     // comprehension prompts the student should answer
  transcript?: string;     // optional — shown when the user clicks "Show transcript"
  rotation?: number;
  locked?: boolean;
  // Theme-derived colours, baked in at generation time so the card stays on-brand
  // even after themes change or the user copies a deck around. All optional —
  // missing values fall back to neutral defaults in the renderer.
  panelBg?: string;        // panel background
  panelInk?: string;       // title + body text color on panel
  playBg?: string;         // play button bg
  playInk?: string;        // play button icon color
  /** Heading font-family (CSS string). Picked from the active SlideshowTheme. */
  headingFont?: string;
  z?: number;
  /** True while the AI is still generating this audio. Renderer shows a
   *  shimmer overlay over the card until the real src arrives. */
  isPending?: boolean;
}

export interface VideoObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** "youtube" → src is a youtube video ID; "upload" → src is a Supabase
   *  Storage URL (or any direct video file URL). */
  source: "youtube" | "upload";
  src: string;
  title?: string;
  startSeconds?: number;   // youtube only
  endSeconds?: number;     // youtube only
  autoplay?: boolean;
  rotation?: number;
  locked?: boolean;
  z?: number;
  /** Same frame shapes as ImageObject. Applied via CSS clip-path/border-radius. */
  frame?: ImageFrame;
  cornerRadius?: number;
  /** True while the AI is still finding/fetching this video. Renderer shows a
   *  shimmer overlay over the player until the real src arrives. */
  isPending?: boolean;
}

/** "Key point" / "Remember" / "Fun fact" tinted callout box. Pulls theme
 *  colours per variant. `body` supports `**bold**` markers. */
export interface CalloutObject {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Optional explicit height. When unset the renderer auto-fits to the
   *  content height. When set, the box uses it as a min-height. */
  height?: number;
  variant: "key" | "remember" | "fun";
  label: string;          // "Key point" / "Remember" / "Fun fact"
  body: string;           // supports **bold** runs
  rotation?: number;
  locked?: boolean;
  z?: number;
}

/** Small uppercase sub-genre pill (e.g. "STAR DYNAMICS"). Auto-width from
 *  text. Theme provides badgeBg / badgeInk. */
export interface BadgeObject {
  id: string;
  x: number;
  y: number;
  text: string;
  rotation?: number;
  locked?: boolean;
  z?: number;
}

/** Italic blockquote with a left rule and optional attribution prefixed `— `. */
export interface BlockquoteObject {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  attribution?: string;
  rotation?: number;
  locked?: boolean;
  z?: number;
}

/** Composite activity primitive — single type, two `kind`s.
 *  - `order` + !answerMode → stacked light-blue cards in given `items` order.
 *  - `order` + answerMode  → cards in `answerItems` order with right-side
 *    numbers + green check badge top-right.
 *  - `question` + !answerMode → speech bubble with inline image + question.
 *  - `question` + answerMode  → speech bubble with "You might have said..."
 *    + `answerItems` as a bullet list + green check badge top-right.
 */
export interface ActivityObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "order" | "question";
  items: string[];
  questionText?: string;
  image?: {
    src: string;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  answerMode: boolean;
  /** order: the correct order. question: "you might have said" bullets. */
  answerItems?: string[];
  rotation?: number;
  locked?: boolean;
  z?: number;
}

export interface SlideJSON {
  shapes: ShapeObject[];
  texts: TextObject[];
  images: ImageObject[];
  audios?: AudioObject[];             // optional so existing decks load unchanged
  videos?: VideoObject[];             // optional so existing decks load unchanged
  callouts?: CalloutObject[];         // Key point / Remember / Fun fact cards
  badges?: BadgeObject[];             // sub-genre pills (e.g. STAR DYNAMICS)
  blockquotes?: BlockquoteObject[];   // italic quotes with left rule
  activities?: ActivityObject[];      // ordering + question/answer composites
  background?: string;                // CSS color
  backgroundImage?: string;           // data URL or http URL — covers the color when set
  backgroundImageWidth?: number;      // natural image dimensions, used to clamp pan
  backgroundImageHeight?: number;
  backgroundOffsetX?: number;         // px offset from center, for bg image pan
  backgroundOffsetY?: number;
  backgroundScale?: number;           // multiplier on top of cover scale; >= 1 always
  /** Shimmer overlay on the slide background while the AI fetches the bg image. */
  backgroundImagePending?: boolean;
  /** AI-generated skeleton (content + layout) used to re-render the slide under
   *  a different theme. Loose type to avoid a circular import with
   *  slideshow-layouts.ts. Image data isn't stored here — re-render plucks the
   *  src from this slide's `images[0]`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  skeleton?: Record<string, any>;
  /** Deck-level active theme. Only meaningful on slides[0] — the first slide
   *  acts as the carrier for deck-wide metadata so we don't need a new DB
   *  column. Read via getDeckTheme / write via setDeckTheme. */
  themeId?: string;
}

export const BLANK_SLIDE: SlideJSON = {
  shapes: [],
  texts: [],
  images: [],
  background: "#ffffff",
};

export interface Presentation {
  id: string;
  title: string;
  slides: SlideJSON[];
  created_at: string;
  updated_at: string;
}

/** Lightweight row for the Slideshows index page. Drops the heavy `slides`
 *  JSONB column (which can be many MB once it contains base64 image data) in
 *  favour of just the first slide for the thumbnail + a slide count. */
export interface PresentationListItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  /** Number of slides in the deck. Returned by list_presentations_lite()
   *  via jsonb_array_length(slides). */
  slide_count: number;
  /** First slide as a stripped-down JSONB blob — backgroundImage and inline
   *  image src have been removed by the RPC to keep the payload tiny. Used
   *  by the list page to render MiniSlide thumbnails. */
  first_slide: SlideJSON | null;
}

/** Helpers for the deck-level theme. Stored in slides[0].themeId so we don't
 *  need an extra DB column. */
export function getDeckTheme(slides: SlideJSON[]): string {
  return slides[0]?.themeId ?? DEFAULT_THEME_ID;
}

export function setDeckTheme(slides: SlideJSON[], themeId: string): SlideJSON[] {
  if (slides.length === 0) return slides;
  return slides.map((s, i) => i === 0 ? { ...s, themeId } : s);
}

const TABLE = "presentations";

export async function listPresentations(): Promise<PresentationListItem[]> {
  const sb = createClient();
  const { data, error } = await sb
    .rpc("list_presentations_lite")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PresentationListItem[];
}

export async function getPresentation(id: string): Promise<Presentation | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Presentation | null;
}

export async function createPresentation(opts?: { title?: string; slides?: SlideJSON[] }): Promise<Presentation> {
  const sb = createClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      title: opts?.title ?? "Untitled Slideshow",
      slides: opts?.slides?.length ? opts.slides : [BLANK_SLIDE],
    })
    .select()
    .single();
  if (error) throw error;
  return data as Presentation;
}

export async function updatePresentation(
  id: string,
  patch: Partial<Pick<Presentation, "title" | "slides">>,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePresentation(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
