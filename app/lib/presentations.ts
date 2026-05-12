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
}

export type ShapeType = "rect" | "ellipse" | "triangle" | "line" | "arrow" | "star" | "hexagon";

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
}

export type ImageFrame =
  | "none"
  | "circle"
  | "rounded"
  | "pill"
  | "diamond"
  | "hexagon"
  | "star"
  | "arch";

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
}

export interface SlideJSON {
  shapes: ShapeObject[];
  texts: TextObject[];
  images: ImageObject[];
  background?: string;                // CSS color
  backgroundImage?: string;           // data URL or http URL — covers the color when set
  backgroundImageWidth?: number;      // natural image dimensions, used to clamp pan
  backgroundImageHeight?: number;
  backgroundOffsetX?: number;         // px offset from center, for bg image pan
  backgroundOffsetY?: number;
  backgroundScale?: number;           // multiplier on top of cover scale; >= 1 always
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

export async function createPresentation(): Promise<Presentation> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ title: "Untitled Slideshow", slides: [BLANK_SLIDE] })
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
