import { supabase } from "./supabase";

export interface TextObject {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  underline: boolean;
  fontFamily: string;
  color: string;
  textAlign: "left" | "center" | "right";
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
  cornerRadius?: number;  // % roundness, applies to rounded/pill/none frames (0-50)
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
}

export interface SlideJSON {
  shapes: ShapeObject[];
  texts: TextObject[];
  images: ImageObject[];
  audios?: AudioObject[];             // optional so existing decks load unchanged
  videos?: VideoObject[];             // optional so existing decks load unchanged
  background?: string;                // CSS color
  backgroundImage?: string;           // data URL or http URL — covers the color when set
  backgroundImageWidth?: number;      // natural image dimensions, used to clamp pan
  backgroundImageHeight?: number;
  backgroundOffsetX?: number;         // px offset from center, for bg image pan
  backgroundOffsetY?: number;
  backgroundScale?: number;           // multiplier on top of cover scale; >= 1 always
  /** Shimmer overlay on the slide background while the AI fetches the bg image. */
  backgroundImagePending?: boolean;
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

const TABLE = "presentations";

export async function listPresentations(): Promise<Presentation[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Presentation[];
}

export async function getPresentation(id: string): Promise<Presentation | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Presentation | null;
}

export async function createPresentation(opts?: { title?: string; slides?: SlideJSON[] }): Promise<Presentation> {
  const { data, error } = await supabase
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
  const { error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePresentation(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
