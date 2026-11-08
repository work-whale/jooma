// The end-of-trial offer: 50% off the first month of any monthly plan, open for
// 7 days after a no-card trial ends.
//
// The dates come from my_account_access() (20261109000000_trial_end_offer.sql),
// which only sends an offer end for someone it could apply to: a no-card trial,
// never paid, no subscription. What is decided here is whether it is open NOW,
// and how to say how long is left. Pure, so tests/unit/trial-offer.spec.ts can
// pin every edge without a database or a clock.
//
// Nothing here grants money. /api/stripe/checkout re-reads the row on the server
// and is the only place the coupon is applied.

import type { BillingInterval } from "./plans";
import type { CouponClient } from "./cancel-flow";
import { discountedPence, type Discount } from "./ambassador-discount";

export const TRIAL_OFFER_PERCENT = 50;

/** How long the offer stays open after the trial ends. Mirrors the SQL. */
export const TRIAL_OFFER_DAYS = 7;

/** Fixed id, like the retention coupons: a coupon cannot be edited in Stripe,
 *  so changing the offer means a new id, and discounts given keep the old one. */
export const TRIAL_OFFER_COUPON = {
  id: "jooma-trial-end-50-once",
  percentOff: TRIAL_OFFER_PERCENT,
  // "once" is the first invoice, which on a monthly plan is the first month.
  duration: "once" as const,
  name: "Half price first month",
};

/** The columns this reads, a subset of AccessRow. */
export interface TrialOfferRow {
  is_admin?: boolean | null;
  has_paid: boolean | null;
  stripe_subscription_id: string | null;
  trial_ends_at?: string | null;
  trial_offer_ends_at?: string | null;
}

export interface TrialOffer {
  endsAt: Date;
  msLeft: number;
}

function parse(d: string | null | undefined): Date | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * The offer, if it is open at `now`: the trial is over, the window is not, and
 * nothing has been paid. Null otherwise, including while the trial still runs.
 */
export function trialOfferFor(row: TrialOfferRow, now: Date = new Date()): TrialOffer | null {
  if (row.is_admin || row.has_paid || row.stripe_subscription_id) return null;
  const trialEnd = parse(row.trial_ends_at);
  const offerEnd = parse(row.trial_offer_ends_at);
  if (!trialEnd || !offerEnd) return null;
  const t = now.getTime();
  if (t < trialEnd.getTime() || t >= offerEnd.getTime()) return null;
  return { endsAt: offerEnd, msLeft: offerEnd.getTime() - t };
}

/**
 * When an offer this teacher had ran out, or null if they never had one or it
 * is still open. For the one "your offer has ended" popup.
 */
export function trialOfferExpiredAt(row: TrialOfferRow, now: Date = new Date()): Date | null {
  if (row.is_admin || row.has_paid || row.stripe_subscription_id) return null;
  const offerEnd = parse(row.trial_offer_ends_at);
  if (!offerEnd || now.getTime() < offerEnd.getTime()) return null;
  return offerEnd;
}

/** The offer is monthly only: on yearly, "once" would take half off a year. */
export function trialOfferApplies(offer: TrialOffer | null, interval: BillingInterval): boolean {
  return offer !== null && interval === "month";
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdownParts(ms: number): CountdownParts {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3_600),
    minutes: Math.floor((s % 3_600) / 60),
    seconds: s % 60,
  };
}

/**
 * Short, for the sidebar and the phone chip: "3d 4h", "4h 12m", "12m".
 * The last minute reads "1m" rather than "0m", so it never looks already gone.
 */
export function shortCountdown(ms: number): string {
  const { days, hours, minutes } = countdownParts(ms);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

/** The offer as a Discount, so the plan cards and charge lines price it with
 *  the same Stripe rounding as an ambassador code (discountedPence). */
export const TRIAL_OFFER_DISCOUNT = { percentOff: TRIAL_OFFER_PERCENT } as const;

/**
 * Which discount a first monthly payment gets when a teacher holds both the
 * end-of-trial offer and a claimed ambassador code. Stripe takes one per
 * checkout, so the one that saves them more wins; on a tie, the code they
 * chose to claim. The ambassador is credited whichever is used (the referral
 * row, not the discount, is what pays commission).
 *
 * `fullPence` is the plan's monthly price. Either side may be absent.
 */
export function betterFirstMonthDiscount(
  fullPence: number,
  offer: boolean,
  code: Discount | null,
): "offer" | "code" | null {
  if (!offer) return code ? "code" : null;
  if (!code) return "offer";
  return discountedPence(fullPence, code) <= discountedPence(fullPence, TRIAL_OFFER_DISCOUNT)
    ? "code"
    : "offer";
}

function stripeCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

/**
 * The coupon, made in Stripe the first time anyone needs it. Same race
 * handling as ensureRetentionCoupon: a parallel create that loses gets
 * resource_already_exists, which means the other one worked.
 */
export async function ensureTrialOfferCoupon(client: CouponClient): Promise<string> {
  const spec = TRIAL_OFFER_COUPON;
  try {
    return (await client.coupons.retrieve(spec.id)).id;
  } catch (err) {
    if (stripeCode(err) !== "resource_missing") throw err;
  }
  try {
    const created = await client.coupons.create({
      id: spec.id,
      percent_off: spec.percentOff,
      duration: spec.duration,
      name: spec.name,
      metadata: { source: "trial_offer" },
    });
    return created.id;
  } catch (err) {
    if (stripeCode(err) !== "resource_already_exists") throw err;
    return (await client.coupons.retrieve(spec.id)).id;
  }
}
