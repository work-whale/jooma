// Server-only Stripe client + the mapping between our PlanId/interval and the
// Stripe Price IDs configured in the environment. This is the single place that
// knows how a plan becomes a price and how a paid price becomes a plan, so the
// checkout route and the webhook stay in agreement.
import "server-only";
import Stripe from "stripe";
import type { PlanId } from "./plans";

if (!process.env.STRIPE_SECRET_KEY) {
  // Fail loud at import time in any server context that needs Stripe, rather
  // than producing a confusing 500 deep inside a request.
  throw new Error("STRIPE_SECRET_KEY is not set");
}

// No apiVersion override — use the version pinned by this SDK release so the
// TypeScript types and the wire behaviour always match.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export type BillingInterval = "monthly" | "yearly";

/** The only plan that is self-serve via Stripe Checkout. `free` needs no
 *  payment; `school` is custom/contact-sales. */
export type PaidPlanId = Extract<PlanId, "pro">;

/** Resolve the configured Stripe Price ID for a plan + interval. */
export function priceIdFor(plan: PaidPlanId, interval: BillingInterval): string {
  const map: Record<PaidPlanId, Record<BillingInterval, string | undefined>> = {
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
    },
  };
  const priceId = map[plan][interval];
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan=${plan} interval=${interval}`);
  }
  return priceId;
}

/** Reverse lookup: which of our plans does a paid Stripe Price ID grant?
 *  Returns null for prices we don't recognise. */
export function planForPriceId(priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null;
  if (
    priceId === process.env.STRIPE_PRICE_PRO_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PRO_YEARLY
  ) {
    return "pro";
  }
  return null;
}
