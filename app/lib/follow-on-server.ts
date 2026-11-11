import "server-only";
import { createClient } from "@/app/lib/auth/server";
import { confirmStep, FOLLOW_ON_WINDOW_MINUTES } from "@/app/lib/follow-on";

/**
 * The `step` to record a request under, decided by the server: the browser's
 * claim that this is a follow-up (see follow-on.ts) is checked against the
 * teacher's own token_usage rows for this tool in the last hour.
 *
 * Read with the caller's session, so the "own usage read" policy scopes the
 * rows to this teacher; usage rows are written by the server only
 * (20261111000000_lock_usage_writes.sql), so the teacher cannot pad them.
 *
 * Fails OPEN, keeping the claim, like checkAllGates: a database blip should
 * not use up a teacher's hourly allowance on their own report chunks, and
 * every request is still charged to the credit ceiling either way.
 */
export async function confirmFollowOn(toolSlug: string, claimedStep: string | null): Promise<string | null> {
  if (claimedStep === null) return null;
  try {
    const supabase = await createClient();
    const since = new Date(Date.now() - FOLLOW_ON_WINDOW_MINUTES * 60_000).toISOString();
    const { data, error } = await supabase
      .from("token_usage")
      .select("step")
      .eq("tool_slug", toolSlug)
      .gte("created_at", since)
      .limit(1000);
    if (error) {
      console.warn(`[follow-on] usage read failed for ${toolSlug}:`, error.message);
      return claimedStep;
    }
    return confirmStep(toolSlug, claimedStep, (data ?? []).map((r) => r.step as string | null));
  } catch (err) {
    console.warn(`[follow-on] usage read threw for ${toolSlug}:`, err);
    return claimedStep;
  }
}
