// The discount behind an ambassador's code, on monthly and yearly plans.
//
// A code is ONE promotion code a teacher types, but two coupons sit behind it:
//
//   monthly  The promotion code's own coupon, duration "once": money off the
//            first monthly payment. This is what the ambassador chose to offer.
//   yearly   A hidden second coupon, also "once". A yearly plan is billed once a
//            year, so "the first month" does not exist as a payment; the hidden
//            coupon gives the same value off the first yearly payment instead.
//            50% off a month is a twelfth of that, 4.17%, off the year. A fixed
//            amount off is the same amount.
//
// Checkout attaches whichever matches the interval being bought, from the
// referral we already hold, so Stripe is never asked to guess. A mid-trial
// switch between intervals (before the single-use coupon is spent) swaps one for
// the other; see discountsForInterval.
//
// Pure, pinned by tests/unit/ambassador-commission.spec.ts.
import type { BillingInterval } from "./plans";

export type Discount = { percentOff: number } | { amountOffPence: number };

/** The yearly coupon worth the same as the monthly one. */
export function yearlyEquivalentDiscount(monthly: Discount): Discount {
  if ("percentOff" in monthly) {
    // Stripe takes percent_off to two decimal places.
    return { percentOff: Math.round((monthly.percentOff / 12) * 100) / 100 };
  }
  return { amountOffPence: monthly.amountOffPence };
}

/** "50% off your first month", "4.17% off your first year", "£3.00 off ...". */
export function describeDiscount(d: Discount, interval: BillingInterval): string {
  const what = interval === "year" ? "your first year" : "your first month";
  if ("percentOff" in d) return `${trimPercent(d.percentOff)}% off ${what}`;
  const pounds = (d.amountOffPence / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
  });
  return `${pounds} off ${what}`;
}

function trimPercent(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

/** Stripe's `discounts` value for a subscription. An empty STRING clears them;
 *  an empty array is ignored by Stripe (see switch-interval). */
export type StripeDiscounts =
  | { promotion_code: string }[]
  | { coupon: string }[]
  | "";

export interface AmbassadorCodeIds {
  promotionCodeId: string;
  yearlyCouponId: string | null;
}

/**
 * The ambassador discount a subscription should carry when billed at
 * `interval`. Monthly takes the promotion code itself; yearly takes the hidden
 * coupon, or nothing for a code made before yearly coupons existed (charging
 * the first-month coupon against a whole year is exactly what this prevents).
 */
export function discountsForInterval(
  interval: BillingInterval,
  ids: AmbassadorCodeIds,
): StripeDiscounts {
  if (interval === "month") return [{ promotion_code: ids.promotionCodeId }];
  return ids.yearlyCouponId ? [{ coupon: ids.yearlyCouponId }] : "";
}

/** A Stripe coupon's value as a Discount, or null for one with neither. */
export function discountOfCoupon(
  coupon: { percent_off?: number | null; amount_off?: number | null } | null | undefined,
): Discount | null {
  if (!coupon) return null;
  if (typeof coupon.percent_off === "number" && coupon.percent_off > 0) {
    return { percentOff: coupon.percent_off };
  }
  if (typeof coupon.amount_off === "number" && coupon.amount_off > 0) {
    return { amountOffPence: coupon.amount_off };
  }
  return null;
}

/**
 * What Stripe charges for `unitPence` with this discount. Stripe rounds the
 * DISCOUNT to the nearest penny, halves up, and charges the rest: 50% off 499
 * is 250 off, so 249 is charged (checked against a test-mode invoice preview,
 * October 2026). Never below zero.
 */
export function discountedPence(unitPence: number, d: Discount): number {
  const off = "percentOff" in d ? Math.round((unitPence * d.percentOff) / 100) : d.amountOffPence;
  return Math.max(0, unitPence - off);
}

/**
 * The Discount behind a retrieved promotion code. The coupon hangs off
 * `promotion` on this API version, expanded with "promotion.coupon"; an
 * unexpanded response leaves a bare id, which reads as null.
 */
export function discountOfPromotion(promo: unknown): Discount | null {
  const promotion = (promo as { promotion?: { coupon?: unknown } } | null)?.promotion;
  const coupon =
    promotion && typeof promotion.coupon === "object" && promotion.coupon !== null
      ? (promotion.coupon as { percent_off?: number | null; amount_off?: number | null })
      : null;
  return discountOfCoupon(coupon);
}
