import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { subscriptionBilling, type PendingPlanChange } from "@/app/lib/stripe";
import {
  asPlanId,
  hasActivePlan,
  PLANS,
  SELECTABLE_PLAN_IDS,
  type BillingInterval,
  type PlanId,
} from "@/app/lib/plans";
import { trialDaysFor } from "@/app/lib/trial";
import { onAmbassadorPro, type AmbassadorTerm } from "@/app/lib/plan-badge";

/*
 * Everything the plan cards and the current-plan card need to know, read once.
 *
 * Shared by /pricing (where plans are chosen and changed) and the Overview tab
 * in Profile (where billing is managed), so the two can never disagree about
 * whether someone has a subscription, what is scheduled, or which interval
 * they pay at. This used to live inline in OverviewTab when the plan cards did.
 */

export interface PlanState {
  plan: PlanId;
  planName: string;
  profile: {
    subscription_status: string | null;
    cancel_at_period_end: boolean | null;
    current_period_end: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  } | null;
  /** A Stripe customer exists: there is a card or invoices to manage. */
  isSubscriber: boolean;
  /** A LIVE Stripe subscription to change, as opposed to needing checkout. */
  hasSubscription: boolean;
  trialing: boolean;
  /** Would a checkout start with the 3 day trial. */
  trialEligible: boolean;
  /** Every plan a teacher can buy, cheapest first. */
  ladder: PlanId[];
  interval: BillingInterval;
  pending: PendingPlanChange | null;
  /** A waiting change on the SAME plan: a billing switch, not a plan move. */
  pendingSwitch: PendingPlanChange | null;
  pendingAt: string | null;
  ending: boolean;
  ended: boolean;
  /** current_period_end, formatted. */
  renews: string | null;
  referralCode: string | null;
  codeSpent: boolean;
  /** The caller's ambassador row, when they are one. */
  ambassador: AmbassadorTerm | null;
  /** On Pro because they are an ambassador: a comp, not a subscription. */
  ambassadorPro: boolean;
  /** When that free Pro ends, formatted. */
  ambassadorUntil: string | null;
}

function longDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function loadPlanState(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanState> {
  const [{ data: profile }, { data: referral }, { data: ambassadorRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "plan, subscription_status, cancel_at_period_end, current_period_end, stripe_customer_id, stripe_subscription_id",
      )
      .eq("id", userId)
      .maybeSingle(),
    // The ambassador code they have claimed, if any.
    //
    // SERVICE ROLE, not the caller's client. ambassador_referrals is admin-only
    // with no teacher read policy, deliberately, since a teacher-writable
    // referral would let anyone assign themselves an ambassador. So the user's
    // own client sees nothing here and the field would always offer an input.
    // Scoped by their own id, so it can only ever find their own row.
    supabaseAdmin
      .from("ambassador_referrals")
      .select("first_paid_at, ambassador_codes ( code )")
      .eq("user_id", userId)
      .maybeSingle(),
    // Their own ambassador row, through the definer function. Errors (an
    // environment without the migration) read as "not an ambassador".
    supabase.rpc("my_ambassador"),
  ]);

  const plan = asPlanId(profile?.plan);

  const ambassadorRow = (Array.isArray(ambassadorRows) ? ambassadorRows[0] : null) as
    | { status: string; pro_until: string | null }
    | null
    | undefined;
  const ambassador: AmbassadorTerm | null = ambassadorRow
    ? {
        status: ambassadorRow.status,
        proUntil: ambassadorRow.pro_until ? new Date(ambassadorRow.pro_until) : null,
      }
    : null;
  // On the free year AS A COMP: no Stripe subscription behind it. The grant
  // route clears a dead subscription id when it grants, so a non-null id here
  // means they have since subscribed (an early checkout bills from the day
  // the free year ends) and Stripe now owns their plan. The same rule
  // teacher_mrr() uses to tell a comp from a payer.
  const ambassadorPro =
    onAmbassadorPro(plan, ambassador) && !profile?.stripe_subscription_id;

  // The code field has three states, and "spent" is the one worth being explicit
  // about: once first_paid_at is set the one-month discount has been used, so
  // there is nothing to offer and nothing to tell them to do.
  const referralCode =
    (referral?.ambassador_codes as unknown as { code?: string } | null)?.code ?? null;
  const codeSpent = Boolean(referral?.first_paid_at);

  // Two different flags, deliberately not collapsed into one.
  //
  // A Stripe CUSTOMER outlives the subscription: a lapsed subscriber still has
  // a card on file worth updating, but nothing to cancel. A plan swap needs a
  // LIVE subscription, and the id alone is not enough: it is never cleared, so
  // a lapsed subscriber still carries the old one.
  const isSubscriber = Boolean(profile?.stripe_customer_id);
  const hasSubscription = Boolean(profile?.stripe_subscription_id) && hasActivePlan(plan);
  const trialing = profile?.subscription_status === "trialing";

  // Every plan a teacher can buy, cheapest first. Derived from
  // SELECTABLE_PLAN_IDS so this can never offer School, which is hidden and has
  // no self-serve billing, or the retired "free" state.
  const ladder = SELECTABLE_PLAN_IDS.slice().sort(
    (a, b) => (PLANS[a].priceMonthly ?? 0) - (PLANS[b].priceMonthly ?? 0),
  );

  // A scheduled downgrade lives on a Stripe subscription schedule rather than
  // on the profile. Read with the interval the subscription bills at, in one
  // Stripe call, and only for a live subscription; anyone else is choosing.
  const billing = await subscriptionBilling(
    hasSubscription ? profile?.stripe_subscription_id : null,
  );
  const pending = billing.pending;
  const interval: BillingInterval = hasSubscription ? billing.interval : "month";
  const pendingSwitch = pending && pending.plan === plan ? pending : null;

  // ENDING: cancelled through the portal, which schedules rather than cancels.
  // Stripe keeps status "active" and only sets cancel_at_period_end.
  // ENDED: the period elapsed and Stripe closed the subscription for good.
  const ended = profile?.subscription_status === "canceled";
  const ending = Boolean(profile?.cancel_at_period_end) && !ended;

  return {
    plan,
    planName: PLANS[plan].name,
    profile: profile
      ? {
          subscription_status: profile.subscription_status ?? null,
          cancel_at_period_end: profile.cancel_at_period_end ?? null,
          current_period_end: profile.current_period_end ?? null,
          stripe_customer_id: profile.stripe_customer_id ?? null,
          stripe_subscription_id: profile.stripe_subscription_id ?? null,
        }
      : null,
    isSubscriber,
    hasSubscription,
    trialing,
    // The free year is the trial for an ambassador: checkout bills from the
    // day it ends instead (see the checkout route), so no 3 day trial copy.
    trialEligible: !ambassadorPro && trialDaysFor(profile) > 0,
    ladder,
    interval,
    pending,
    pendingSwitch,
    pendingAt: pending ? longDate(pending.at) : null,
    ending,
    ended,
    renews: profile?.current_period_end ? longDate(profile.current_period_end) : null,
    referralCode,
    codeSpent,
    ambassador,
    ambassadorPro,
    ambassadorUntil: ambassadorPro && ambassador?.proUntil ? longDate(ambassador.proUntil) : null,
  };
}
