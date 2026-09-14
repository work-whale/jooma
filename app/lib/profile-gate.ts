// Is this account finished signing up?
//
// A profiles row is written by exactly one thing: the upsert at the end of
// /complete-profile. There is no trigger on auth.users. So a teacher who closes
// the tab on that form keeps a perfectly valid session and, before this file,
// kept full use of the product — generating, spending, and appearing on no admin
// screen at all. tool_runs.user_id references auth.users rather than profiles,
// and my_generation_gate() coalesces a missing profile to 'free', so every layer
// below this one waves them through.
//
// ── WHY THIS ONE FAILS CLOSED ──
// The gates either side of it in proxy.ts (tool availability, maintenance,
// the quota check) deliberately fail OPEN, and each says so in its own header.
// This one does not, and the difference is worth stating because a reader
// arriving from those files will assume it is a mistake.
//
// Those gates protect against INVENTING a restriction: the prior state of the
// world is "the tool works", so a blip must not be able to switch it off. Here
// the prior state is a data-integrity invariant — every active account has a
// profile — and failing open means new orphans get created under exactly the
// conditions (database trouble) that make them most likely. Failing open is the
// bug this file exists to fix.
//
// But fail-closed applies only to what we can actually PROVE:
//
//   a clean null  → the row genuinely is not there → gate.
//   a query error → "could not read" is not "does not exist" → let through.
//
// Treating a transport failure as a missing row would take the whole product
// down on a Supabase hiccup, which is a far worse outcome than a few minutes of
// un-gated onboarding.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Escape hatch, matching TOOL_GATING_DISABLED in tool-availability.ts. If this
 * gate ever misbehaves in production it can be switched off with one
 * environment variable and a redeploy — no code change, no migration and no
 * database access needed under pressure.
 */
function gateDisabled(): boolean {
  return process.env.PROFILE_GATE_DISABLED === "1";
}

/**
 * True when this user has finished signing up.
 *
 * Reads through the caller's own client: a teacher can always select their own
 * profiles row under RLS, so this needs no service-role key and no new RPC.
 * Never throws — see the fail-closed note above for what each failure means.
 */
export async function hasProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (gateDisabled()) return true;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[profile-gate] could not read profiles:", error.message);
    return true;
  }

  return data !== null;
}

/** The body the gate returns to an API caller. Shared so proxy.ts and any route
 *  that self-gates (see /api/generate-slideshow) can't drift apart — the same
 *  arrangement as quotaBlockBody in generation-guard.ts. */
export function profileGateBody() {
  return {
    error: "Finish setting up your account before using Jooma.",
    code: "profile_incomplete" as const,
  };
}
