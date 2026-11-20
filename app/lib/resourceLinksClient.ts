// The browser side of share links. Every write is a definer function in
// supabase/migrations/20261120000300_favourites_and_resource_links.sql, which
// checks ownership and the classroom-only allowlist itself; nothing here is a
// security boundary.

import { createClient } from "@/app/lib/auth/client";
import { fireToolRunSaved } from "@/app/lib/toolRuns";

/** The live token for one of the teacher's resources, or null. */
export async function liveLinkToken(runId: string): Promise<string | null> {
  const { data, error } = await createClient()
    .from("resource_links")
    .select("token")
    .eq("tool_run_id", runId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data?.token as string | undefined) ?? null;
}

export async function createLink(runId: string): Promise<string> {
  const { data, error } = await createClient().rpc("create_resource_link", { p_run_id: runId });
  if (error) throw error;
  return data as string;
}

export async function revokeLink(runId: string): Promise<void> {
  const { error } = await createClient().rpc("revoke_resource_link", { p_run_id: runId });
  if (error) throw error;
}

/** Copy a shared resource into the signed-in teacher's own library. */
export async function saveLinkCopy(token: string): Promise<{ runId: string; presentationId: string | null }> {
  const { data, error } = await createClient().rpc("save_resource_link_copy", { p_token: token });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { run_id: string; presentation_id: string | null };
  // The same hook a normal save fires, so badge progress re-evaluates.
  fireToolRunSaved();
  return { runId: row.run_id, presentationId: row.presentation_id };
}
