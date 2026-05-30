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
}

export async function saveToolRun(run: {
  toolSlug: string;
  title?: string | null;
  input: Record<string, unknown>;
  output: string;
}): Promise<ToolRun> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tool_runs")
    .insert({
      tool_slug: run.toolSlug,
      title: run.title ?? null,
      input: run.input,
      output: run.output,
    })
    .select()
    .single();
  if (error) throw error;
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

export async function deleteToolRun(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("tool_runs").delete().eq("id", id);
  if (error) throw error;
}
