import { createClient } from "@/app/lib/auth/client";

// Teacher-created folders for the Library. Persisted to the `folders` table
// (see supabase/migrations/20260902000000_folders.sql). Uses the auth browser
// client so RLS scopes every query to the signed-in user.
//
// A resource's folder lives on tool_runs.folder_id and is written by
// moveRunToFolder in app/lib/toolRuns.ts, which is that table's only gateway.

/**
 * The folder palette.
 *
 * KEEP THE KEYS IN STEP WITH `folder_colours()` in the migration, which
 * whitelists them for the CHECK constraint. A key added here but not there is
 * rejected on insert; a key removed here but left there renders as the
 * fallback.
 *
 * `tint` and `solid` are the two treatments a folder card can take. Light
 * variants put the solid glyph on the tint, which is the prototype's folder
 * icon chip. Deep variants put a white glyph on the solid. Nothing here is a
 * new colour: the tints are the --j-tint-* tokens and the solids are the v4
 * category tokens, so the palette cannot drift from the brand bible.
 *
 * Violet stays the brand purple: it is the prototype's own folder chip. Amber
 * is gold rather than orange, because orange means picture slides (v4 rule).
 */
export const FOLDER_COLOURS = [
  { key: "violet", name: "Violet", tint: "var(--j-tint-violet)", solid: "var(--j-purple)" },
  { key: "blue", name: "Blue", tint: "var(--j-tint-blue)", solid: "var(--j-cat-make)" },
  { key: "green", name: "Green", tint: "var(--j-tint-green)", solid: "var(--j-cat-pupil)" },
  { key: "amber", name: "Amber", tint: "var(--j-tint-amber)", solid: "var(--j-gold)" },
  { key: "pink", name: "Pink", tint: "var(--j-tint-pink)", solid: "var(--j-cat-support)" },
  { key: "violet-deep", name: "Deep violet", tint: "var(--j-purple)", solid: "#fff" },
  { key: "blue-deep", name: "Deep blue", tint: "var(--j-cat-make)", solid: "#fff" },
  { key: "green-deep", name: "Deep green", tint: "var(--j-cat-pupil)", solid: "#fff" },
  { key: "amber-deep", name: "Deep amber", tint: "var(--j-gold)", solid: "#fff" },
  { key: "pink-deep", name: "Deep pink", tint: "var(--j-cat-support)", solid: "#fff" },
] as const;

export type FolderColour = (typeof FOLDER_COLOURS)[number]["key"];

export const DEFAULT_FOLDER_COLOUR: FolderColour = "violet";

/**
 * Background and glyph colour for a folder chip.
 *
 * Falls back to the default rather than returning undefined: a colour key
 * written by an older build, or by hand, must still render something rather
 * than leaving an invisible chip.
 */
export function folderSwatch(colour: string) {
  return (
    FOLDER_COLOURS.find((c) => c.key === colour) ??
    FOLDER_COLOURS.find((c) => c.key === DEFAULT_FOLDER_COLOUR)!
  );
}

export interface Folder {
  id: string;
  name: string;
  colour: FolderColour;
  created_at: string;
}

export async function listFolders(): Promise<Folder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Folder[];
}

export async function createFolder(name: string, colour: FolderColour): Promise<Folder> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("folders")
    // Trimmed here as well as checked in the constraint: the constraint rejects
    // a blank name, this stops a merely untidy one being stored with the spaces
    // the teacher did not mean to type.
    .insert({ name: name.trim(), colour })
    .select()
    .single();
  if (error) throw error;
  return data as Folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("folders").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}

export async function recolourFolder(id: string, colour: FolderColour): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("folders").update({ colour }).eq("id", id);
  if (error) throw error;
}

/**
 * Delete a folder. The resources inside it are NOT deleted: tool_runs.folder_id
 * is `on delete set null`, so they fall back to Unfiled. The confirmation copy
 * in the Library says so, and this is what makes that true.
 */
export async function deleteFolder(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}
