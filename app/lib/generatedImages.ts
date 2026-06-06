// Cross-slideshow library of AI-generated images. Every image the user
// generates — via the wizard, the AI sidebar tab, or the right-click
// "Regenerate" action — is saved here so it can be reused on any slide
// across any project.
//
// Searches go through the `prompt` column with ILIKE so the user can find
// "saturn" weeks after generating it. See the migration in
// supabase/migrations/20260513000000_create_generated_images.sql.

import { supabase } from "./supabase";
import { uploadDataUrlToStorage } from "./imageStorage";

export interface GeneratedImage {
  id: string;
  prompt: string;
  style: string | null;
  /** Now actually a Storage public URL (https://...supabase.co/storage/v1/...).
   *  Column name kept for backwards-compatibility with already-saved rows
   *  that hold base64. The migration backfills those into Storage URLs too. */
  data_url: string;
  /** Human-readable label + one-line context — see the metadata migration. */
  title: string | null;
  description: string | null;
  /** Where it came from + dims/model — cache-ready metadata. */
  source: string | null;
  orientation: string | null;
  width: number | null;
  height: number | null;
  model: string | null;
  created_at: string;
}

const TABLE = "generated_images";

/**
 * Rewrite a Supabase Storage public URL into a CDN-resized thumbnail
 * (/object/public/ → /render/image/public/?width=). Cuts egress ~90% for the
 * small grid thumbnails in the editor/library. Requires Supabase image
 * transformations (Pro plan); callers should add an <img> onError that falls
 * back to the original URL so free-tier projects still render (full-size).
 * Non-Supabase URLs (and legacy base64 data URLs) pass through untouched.
 */
export function thumbUrl(url: string, width = 240): string {
  if (!url.includes("/storage/v1/object/public/")) return url;
  const base = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}width=${width}&quality=70&resize=cover`;
}

/** Short, title-cased label from the raw prompt (first ~6 words). */
function deriveTitle(prompt: string): string {
  return prompt
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** One-line context — prefers the slide it was made for, else the prompt. */
function deriveDescription(prompt: string, style?: string | null, slideTitle?: string): string {
  const kind = style ? `${style} image` : "Image";
  const body = slideTitle?.trim()
    ? `${kind} for "${slideTitle.trim()}".`
    : `${kind} of ${prompt.trim()}.`;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

export async function saveGeneratedImage(opts: {
  prompt: string;
  style?: string;
  dataUrl: string;
  /** Optional richer metadata. When omitted, title/description are derived. */
  title?: string;
  description?: string;
  slideTitle?: string;
  source?: string;
  orientation?: string;
  width?: number;
  height?: number;
  model?: string;
}): Promise<GeneratedImage> {
  // Belt-and-braces: if a caller still passes raw base64 (legacy path or
  // bug), upload it to Storage here before inserting. Existing http(s) URLs
  // pass through unchanged. Keeps base64 out of Postgres regardless of who's
  // calling us.
  const url = (await uploadDataUrlToStorage(opts.dataUrl, opts.prompt)) ?? opts.dataUrl;

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      prompt: opts.prompt,
      style: opts.style ?? null,
      data_url: url,
      title: opts.title ?? deriveTitle(opts.prompt),
      description: opts.description ?? deriveDescription(opts.prompt, opts.style, opts.slideTitle),
      source: opts.source ?? null,
      orientation: opts.orientation ?? null,
      width: opts.width ?? null,
      height: opts.height ?? null,
      model: opts.model ?? null,
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
  const term = opts?.search?.trim();
  if (term) {
    if (/\s/.test(term)) {
      // Multi-word → ranked full-text across title + description + prompt.
      q = q.textSearch("search_tsv", term, { type: "websearch", config: "english" });
    } else {
      // Single token → substring match (keeps the "type-ahead" feel).
      const safe = term.replace(/[,()*%]/g, " ").trim();
      q = q.or(`title.ilike.%${safe}%,prompt.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as GeneratedImage[];
}

export async function deleteGeneratedImage(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
