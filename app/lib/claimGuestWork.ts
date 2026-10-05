// ── Moving a guest's free tries into their new account ──────────────────────
//
// A visitor can make a deck on Monday and a comprehension on Tuesday from
// /create, then sign up on Wednesday. Everything made under their guest cookie
// in the last thirty days lands in their library at that moment, the way the
// generation would have if they had been signed in all along:
//
//   * a deck becomes a presentations row (plus the tool_runs row the editor
//     writes for every generated deck)
//   * a comprehension becomes a tool_runs row
//   * the run's spend (token_usage, asset_cost, slide_cost), recorded with no
//     owner while they were a guest, is handed to them by run id
//
// Server only, service role: the caller has already verified the session and
// the guest cookie's signature.
import "server-only";
import { supabaseAdmin } from "./supabase-admin";

const CLAIM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface ClaimedItem {
  kind: "slides" | "comprehension";
  /** presentations.id for slides, tool_runs.id for a comprehension. */
  id: string;
  title: string;
}

interface TrialRow {
  id: string;
  tool: "slideshow" | "comprehension-generator";
  title: string | null;
  input: Record<string, unknown> | null;
  output: { slides?: unknown[]; text?: string } | null;
  run_id: string;
}

async function reownSpend(userId: string, runId: string): Promise<void> {
  const results = await Promise.all([
    supabaseAdmin.from("token_usage").update({ user_id: userId }).eq("run_id", runId).is("user_id", null),
    supabaseAdmin.from("asset_cost").update({ user_id: userId }).eq("run_id", runId).is("user_id", null),
    supabaseAdmin
      .from("slide_cost")
      .update({ user_id: userId })
      .eq("breakdown->>run_id", runId)
      .is("user_id", null),
  ]);
  for (const r of results) {
    if (r.error) console.warn("[claim] could not re-own spend for run", runId, r.error);
  }
}

async function createResource(userId: string, row: TrialRow): Promise<ClaimedItem | null> {
  const title = (row.title ?? "").trim() || (row.tool === "slideshow" ? "Untitled deck" : "Comprehension");

  if (row.tool === "slideshow") {
    const slides = row.output?.slides;
    if (!Array.isArray(slides) || slides.length === 0) return null;
    const params = { ...(row.input ?? {}) };
    delete params.runId;

    const { data, error } = await supabaseAdmin
      .from("presentations")
      .insert({ user_id: userId, title, slides, generation_params: params })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[claim] could not create presentation:", error);
      return null;
    }
    // The activity log entry the editor writes for every generated deck, so a
    // claimed deck counts toward badges and shows in Recent like any other.
    const { error: runErr } = await supabaseAdmin.from("tool_runs").insert({
      user_id: userId,
      tool_slug: "slideshow",
      title,
      input: { presentationId: data.id, slideCount: slides.length, ...params },
      output: `Generated a ${slides.length}-slide deck.`,
      run_id: row.run_id,
    });
    if (runErr && runErr.code !== "23505") console.warn("[claim] deck tool_run not written:", runErr);
    return { kind: "slides", id: data.id as string, title };
  }

  const text = row.output?.text;
  if (typeof text !== "string" || !text.trim()) return null;
  const { data, error } = await supabaseAdmin
    .from("tool_runs")
    .insert({
      user_id: userId,
      tool_slug: "comprehension-generator",
      title,
      input: row.input ?? {},
      output: text,
      run_id: row.run_id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[claim] could not create comprehension run:", error);
    return null;
  }
  return { kind: "comprehension", id: data.id as string, title };
}

/**
 * Claim every finished, unclaimed guest run for `guestId` into `userId`.
 * Idempotent: a row is marked claimed before anything is created from it, and
 * only one caller can win that update.
 */
export async function claimGuestWork(userId: string, guestId: string): Promise<ClaimedItem[]> {
  const since = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("trial_generations")
    .select("id, tool, title, input, output, run_id")
    .eq("guest_id", guestId)
    .eq("status", "done")
    .is("claimed_by", null)
    .not("output", "is", null)
    .gt("created_at", since)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[claim] could not read guest runs:", error);
    return [];
  }

  const claimed: ClaimedItem[] = [];
  for (const row of (data ?? []) as TrialRow[]) {
    // Take the row first. Two tabs signing in at once both get here; only one
    // update matches `claimed_by is null`.
    const { data: took, error: takeErr } = await supabaseAdmin
      .from("trial_generations")
      .update({ status: "claimed", claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("claimed_by", null)
      .select("id");
    if (takeErr || !took?.length) continue;

    const item = await createResource(userId, row);
    if (!item) {
      // Put it back so a later sign in can try again rather than losing it.
      await supabaseAdmin
        .from("trial_generations")
        .update({ status: "done", claimed_by: null, claimed_at: null })
        .eq("id", row.id);
      continue;
    }
    await reownSpend(userId, row.run_id);
    claimed.push(item);
  }
  return claimed;
}
