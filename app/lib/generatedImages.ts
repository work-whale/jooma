// Cross-slideshow library of AI-generated images. Every image the user
// generates — via the wizard, the AI sidebar tab, or the right-click
// "Regenerate" action — is saved here so it can be reused on any slide
// across any project.
//
// Searches go through the `prompt` column with ILIKE so the user can find
// "saturn" weeks after generating it. See the migration in
// supabase/migrations/20260513000000_create_generated_images.sql.

import { supabase } from "./supabase";

export interface GeneratedImage {
  id: string;
  prompt: string;
  style: string | null;
  data_url: string;
  created_at: string;
}

const TABLE = "generated_images";

export async function saveGeneratedImage(opts: {
  prompt: string;
  style?: string;
  dataUrl: string;
}): Promise<GeneratedImage> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      prompt: opts.prompt,
      style: opts.style ?? null,
      data_url: opts.dataUrl,
    })
    .select()
    .single();
  if (error) throw error;
  return data as GeneratedImage;
}

export async function listGeneratedImages(opts?: {
  search?: string;
  limit?: number;
}): Promise<GeneratedImage[]> {
  let q = supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.search?.trim()) {
    q = q.ilike("prompt", `%${opts.search.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as GeneratedImage[];
}

export async function deleteGeneratedImage(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
