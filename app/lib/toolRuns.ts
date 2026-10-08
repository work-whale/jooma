import { createClient } from "@/app/lib/auth/client";

// Per-user history of tool generations. Persisted to the `tool_runs` table
// (see supabase/migrations/20260531000000_create_tool_runs.sql). Uses the auth
// browser client so RLS scopes every query to the signed-in user.

export interface ToolRun {
  id: string;
  tool_slug: string;
  title: string | null;
  // `input` is whatever body the tool's form POSTs; shape varies per tool.
  input: Record<string, unknown>;
  output: string;
  created_at: string;
  /** The Library folder this resource is filed in. Null is "Unfiled", which is
   *  a real state rather than a missing one: see app/lib/folders.ts. */
  folder_id: string | null;
}

/*
 * Called after a run is saved, so badge earning can re-check.
 *
 * A callback rather than a direct import: this module is imported by the badge
 * store (for listRecentRuns), and importing the store back from here would be a
 * cycle. The store registers itself on load instead.
 */
type RunSavedListener = () => void;
const runSavedListeners = new Set<RunSavedListener>();

export function onToolRunSaved(listener: RunSavedListener): () => void {
  runSavedListeners.add(listener);
  return () => {
    runSavedListeners.delete(listener);
  };
}

/**
 * Tell the listeners a resource landed.
 *
 * Exported because saveToolRun is no longer the only way a row reaches
 * tool_runs: accepting a colleague's share inserts one too (see
 * saveSharedToLibrary in app/lib/colleagues.ts), and that resource has to count
 * toward badges and the streak exactly as a generated one does.
 *
 * A listener must never be able to fail its caller. The resource is the thing
 * the teacher cares about; a badge is not.
 */
export function fireToolRunSaved(): void {
  for (const listener of runSavedListeners) {
    try {
      listener();
    } catch {
      // Deliberately ignored.
    }
  }
}

export async function saveToolRun(run: {
  toolSlug: string;
  title?: string | null;
  input: Record<string, unknown>;
  output: string;
  /** Ties this run to the cost rows the server wrote for the same generation.
   *  Set by callers that pass the same id to their API route; without it, the
   *  admin console falls back to matching cost by timestamp. */
  runId?: string | null;
}): Promise<ToolRun> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tool_runs")
    .insert({
      tool_slug: run.toolSlug,
      title: run.title ?? null,
      input: run.input,
      output: run.output,
      run_id: run.runId ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // Every tool that saves a run comes through here, which makes this the one
  // place badge earning can hook without touching all five call sites.
  fireToolRunSaved();

  return data as ToolRun;
}

export async function listToolRuns(toolSlug: string): Promise<ToolRun[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tool_runs")
    .select("*")
    .eq("tool_slug", toolSlug)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ToolRun[];
}

// Recent runs across ALL tools — powers the dashboard's "Recently added" table
// and activity stats.
export async function listRecentRuns(limit = 100): Promise<ToolRun[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tool_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ToolRun[];
}

/**
 * One run by id — what `/tools/<slug>?run=<id>` resolves.
 *
 * Returns null when the row is missing or belongs to someone else (RLS makes
 * those indistinguishable, and both mean the same thing here: open the tool
 * empty rather than error). `maybeSingle` rather than `single`, which treats
 * "no row" as an error.
 */
export async function getToolRun(id: string): Promise<ToolRun | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tool_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ToolRun | null) ?? null;
}

/**
 * File a resource into a folder, or out of one with `null`.
 *
 * One of two UPDATEs this codebase makes to tool_runs (the other is a sheet's
 * autosave, below), and the reason the table gained an update policy in
 * 20260902000000_folders.
 *
 * Lives here rather than in folders.ts because it writes tool_runs, and this
 * module is that table's only gateway.
 */
export async function moveRunToFolder(runId: string, folderId: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("tool_runs")
    .update({ folder_id: folderId })
    .eq("id", runId);
  if (error) throw error;
}

/**
 * Save a teacher's edits to a resource they own.
 *
 * Only the designed Worksheet and Comprehension sheets call this: they are
 * edited in place and autosave, the way a deck does. Same owner update policy
 * as moveRunToFolder above, so RLS confines it to the teacher's own rows.
 */
export async function updateToolRunOutput(runId: string, output: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("tool_runs").update({ output }).eq("id", runId);
  if (error) throw error;
}

/**
 * Delete a resource, and the Storage objects it owned along with it.
 *
 * Goes through the API rather than deleting the row here, which RLS would
 * happily allow. The row is the ONLY index of which images, audio and video
 * belong to this resource — nothing records the object paths as columns — so
 * deleting it from the browser reclaims the row and leaks the files forever.
 * The route reads the row first, deletes it, then removes whatever no other
 * deck, run, share or library image still points at.
 *
 * See app/api/resources/delete/route.ts.
 */
export async function deleteToolRun(id: string): Promise<void> {
  const res = await fetch("/api/resources/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, kind: "run" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Could not delete that resource.");
  }
}
