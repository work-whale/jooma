// The free trial every self-serve plan starts with.
//
// Pure, with no Stripe client and no database, so both rules here are pinned by
// tests/unit/trial.spec.ts rather than by a live checkout.
//
// HOW THE TRIAL WORKS
// The card is taken at checkout and nothing is charged for TRIAL_DAYS. Stripe
// creates the subscription in `trialing`, which the webhook already treats as
// active, so the teacher has their plan from the first minute. When the trial
// ends Stripe charges the card; if they cancelled first, the subscription ends
// and the webhook writes them back to "free" (no plan).
import type Stripe from "stripe";
import { TRIAL_DAYS } from "./plans";

/**
 * How many trial days a checkout should carry for this account: TRIAL_DAYS for
 * someone who has never subscribed, 0 for anyone who has.
 *
 * ONE TRIAL PER ACCOUNT. stripe_subscription_id is written by the webhook on
 * the first subscription and never cleared, not even when that subscription is
 * cancelled, so it is a durable "has subscribed before" marker. Without this a
 * teacher could cancel on day 2 and start a fresh trial every three days.
 */
export function trialDaysFor(profile: { stripe_subscription_id?: string | null } | null): number {
  return profile?.stripe_subscription_id ? 0 : TRIAL_DAYS;
}

/**
 * Did this subscription just start a free trial?
 *
 * The moment Meta's StartTrial means: the card is on file and the trial clock is
 * running. Checked on the subscription a completed Checkout produced, so a
 * returning subscriber (no trial, see trialDaysFor) and an admin-created
 * subscription (never trialing) report nothing.
 */
export function startsTrial(sub: Pick<Stripe.Subscription, "status" | "trial_end">): boolean {
  return sub.status === "trialing" && typeof sub.trial_end === "number";
}

/**
 * Did this completed Checkout start a free trial for THIS user?
 *
 * Decides whether /checkout/complete fires the browser StartTrial pixel. The
 * session id arrives in a URL anyone can edit, so it is checked against the
 * signed-in user (client_reference_id is stamped by api/stripe/checkout) as
 * well as for a trialing subscription: a shared or replayed link must not fire
 * a conversion for somebody else. `subscription` must be expanded.
 */
export function isTrialCheckout(
  session: {
    mode?: string | null;
    client_reference_id?: string | null;
    subscription?: string | Pick<Stripe.Subscription, "status" | "trial_end"> | null;
  },
  userId: string,
): boolean {
  if (session.mode !== "subscription") return false;
  if (!session.client_reference_id || session.client_reference_id !== userId) return false;
  const sub = session.subscription;
  if (!sub || typeof sub === "string") return false;
  return startsTrial(sub);
}

/**
 * Is this the GBP 0 invoice Stripe raises when a trial starts?
 *
 * The subscription's first invoice is created immediately at checkout, trial or
 * not, and for a trial it is paid at zero. Treating that as a purchase would owe
 * an ambassador and report a Purchase to Meta for a teacher who has not paid
 * anything and may cancel before day 3.
 *
 * SUBTOTAL, not total, is what tells it apart from a 100% ambassador code: a
 * discounted first month still has a full subtotal (499) with the discount
 * taking the total to zero, and that subscriber is genuinely owed for. A trial
 * line is priced at zero before any discount.
 */
export function isTrialInvoice(
  inv: Pick<Stripe.Invoice, "billing_reason" | "subtotal">,
): boolean {
  return inv.billing_reason === "subscription_create" && (inv.subtotal ?? 0) === 0;
}
