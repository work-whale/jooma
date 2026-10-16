// Runtime entitlement lookups — bridges the static plan config (plans.ts) with
// the live user (their `profiles.plan` row and this month's generation count).
//
// Client-side helper using the browser auth client so RLS sees the user's JWT.

import { createClient } from "./auth/client";
import {
  AI_SPEND_CEILING_PENCE,
  effectivePlan,
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
  /** Measured AI spend this month, in pence, and any purchased top-up credit.
   *  Only meaningful on plans with a ceiling (see AI_SPEND_CEILING_PENCE). */
  spendPence: number;
  creditPence: number;
  /** The plan's ceiling plus purchased credit, in pence. `null` = no ceiling. */
  ceilingPence: number | null;
}

/** Fetch the signed-in user's plan, usage and measured spend, and resolve all
 *  gates. Falls back to the Free plan if no session or profile is found.
 *
 *  This is the display-side view. The trusted enforcement path is
 *  checkAllGates() in generation-guard.ts, which reads the same numbers
 *  server-side — keep the two in agreement. */
export async function getEntitlements(): Promise<Entitlements> {
  const sb = createClient();

  const [{ data: profile }, { data: month }, { data: today }, { data: spend }] =
    await Promise.all([
      sb
        .from("profiles")
        .select("plan, subscription_status, stripe_subscription_id, current_period_end")
        .maybeSingle(),
      sb.rpc("my_generation_count_this_month"),
      sb.rpc("my_generation_count_today"),
      sb.rpc("monthly_ai_spend", { uid: (await sb.auth.getUser()).data.user?.id }),
    ]);

  const plan = effectivePlan(profile);
  const used = typeof month === "number" ? month : 0;
  const usedToday = typeof today === "number" ? today : 0;

  // monthly_ai_spend returns a single row; supabase-js hands back an array.
  const row = (Array.isArray(spend) ? spend[0] : spend) as
    | { spend_pence: number | string; credit_pence: number | string }
    | null
    | undefined;
  const spendPence = Number(row?.spend_pence ?? 0);
  const creditPence = Number(row?.credit_pence ?? 0);

  const ceiling = AI_SPEND_CEILING_PENCE[plan];

  return {
    plan,
    limits: limitsFor(plan),
    generations: generationGate(plan, used, usedToday),
    spendPence,
    creditPence,
    ceilingPence: ceiling === null ? null : ceiling + creditPence,
  };
}
