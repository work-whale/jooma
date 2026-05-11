import { supabase } from "./supabase";

export type SlideJSON = {
  background?: string;
  objects?: unknown[];
  version?: string;
  [key: string]: unknown;
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
  const blank: SlideJSON = { background: "#ffffff", objects: [], version: "7.0.0" };
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ title: "Untitled Slideshow", slides: [blank] })
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
