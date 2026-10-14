// Twelve months of Pro for an ambassador.
//
// Shared by the admin's Grant button (app/api/admin/ambassadors/grant-pro) and
// by approving an application (app/api/admin/ambassadors/applications/[id]), so
// both follow the same rules.
//
// The grant is a COMP, the same shape the admin change-plan route writes for a
// teacher with no card (profiles.plan = 'pro', no Stripe subscription), plus an
// end date on the ambassador row. The daily ambassador-terms cron removes the
// comp once that date passes. Nothing here touches ambassador_referrals or the
// commission ledger, so a comp can never make anyone payable.
//
// WHY A LIVE SUBSCRIPTION IS REFUSED
// Stripe is the only writer of profiles.plan for a subscriber
// (syncSubscription in the webhook). Comping over a live subscription would
// last until that subscription's next event, then be silently reset, and the
// teacher would still be billed in the meantime. So an admin cancels the
// subscription first, deliberately, and grants after.
//
// WHY A DEAD SUBSCRIPTION ID IS CLEARED
// "Comped" is recognised everywhere by stripe_subscription_id being null (as in
// teacher_mrr()). An id that outlived its subscription would make this comp
// read as a payer. It is cleared only after Stripe confirms the subscription is
// closed.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-admin";
import { stripe } from "./stripe";
import { AGREEMENT_MONTHS } from "./ambassador-commission";

/** Subscription states that still bill, or will. */
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

export type GrantResult =
  | { ok: true; proUntil: string; message: string }
  | { ok: false; status: number; error: string };

/**
 * Grant the free Pro year. `adminSupabase` is the admin's own session client,
 * so the account link and the audit log run with is_admin() checked in the
 * database too.
 */
export async function grantAmbassadorPro(
  adminSupabase: SupabaseClient,
  ambassadorId: string,
  reason: string,
): Promise<GrantResult> {
  // Linked by email if it was not at creation.
  const { data: userId, error: linkError } = await adminSupabase.rpc(
    "admin_link_ambassador_account",
    { p_ambassador_id: ambassadorId },
  );
  if (linkError) {
    console.error("[ambassador-pro] link failed", linkError);
    return { ok: false, status: 400, error: "Could not find that ambassador." };
  }
  if (!userId) {
    return {
      ok: false,
      status: 400,
      error: "They don't have a Jooma account with this email yet. Once they sign up, grant again.",
    };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan, stripe_subscription_id")
    .eq("id", userId as string)
    .maybeSingle();
  if (!profile) {
    return { ok: false, status: 404, error: "Could not find their profile." };
  }

  if (profile.stripe_subscription_id) {
    let status: string;
    try {
      status = (await stripe.subscriptions.retrieve(profile.stripe_subscription_id)).status;
    } catch (err) {
      // Unreadable is not the same as closed. Refuse rather than guess.
      console.error("[ambassador-pro] subscription lookup failed", err);
      return {
        ok: false,
        status: 502,
        error: "Could not check their subscription with Stripe. Try again in a moment.",
      };
    }
    if (LIVE.has(status)) {
      return {
        ok: false,
        status: 409,
        error: "They pay through Stripe. Cancel their subscription first, then grant the free Pro.",
      };
    }
  }

  const now = new Date();
  const until = addMonths(now, AGREEMENT_MONTHS);

  const { error: termError } = await supabaseAdmin
    .from("ambassadors")
    .update({
      pro_until: until.toISOString(),
      pro_granted_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", ambassadorId);
  if (termError) {
    console.error("[ambassador-pro] term write failed", termError);
    return { ok: false, status: 500, error: "Could not save the free Pro term." };
  }

  const { error: planError } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "pro",
      subscription_status: "active",
      cancel_at_period_end: false,
      current_period_end: until.toISOString(),
      stripe_subscription_id: null,
      updated_at: now.toISOString(),
    })
    .eq("id", userId as string);
  if (planError) {
    console.error("[ambassador-pro] plan write failed", planError);
    return { ok: false, status: 500, error: "Could not update their plan." };
  }

  await adminSupabase.rpc("admin_log_plan_change", {
    uid: userId,
    p_from: profile.plan ?? "free",
    p_to: "pro",
    p_reason: `Ambassador, ${AGREEMENT_MONTHS} months free${reason ? `: ${reason}` : ""}`,
    p_method: "comp",
  });

  return {
    ok: true,
    proUntil: until.toISOString(),
    message: `Pro granted until ${until.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}.`,
  };
}
