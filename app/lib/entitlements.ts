// Runtime entitlement lookups — bridges the static plan config (plans.ts) with
// the live user (their `profiles.plan` row and this month's generation count).
//
// Client-side helper using the browser auth client so RLS sees the user's JWT.

import { createClient } from "./auth/client";
import {
  asPlanId,
  generationGate,
  limitsFor,
  type GenerationGate,
  type PlanId,
  type PlanLimits,
} from "./plans";

export interface Entitlements {
  plan: PlanId;
  limits: PlanLimits;
  generations: GenerationGate;
}

/** Fetch the signed-in user's plan + monthly usage and resolve all gates.
 *  Falls back to the Free plan if no session or profile is found. */
export async function getEntitlements(): Promise<Entitlements> {
  const sb = createClient();

  const [{ data: profile }, { data: count }] = await Promise.all([
    sb.from("profiles").select("plan").maybeSingle(),
    sb.rpc("my_generation_count_this_month"),
  ]);

  const plan = asPlanId(profile?.plan);
  const used = typeof count === "number" ? count : 0;

  return {
    plan,
    limits: limitsFor(plan),
    generations: generationGate(plan, used),
  };
}
