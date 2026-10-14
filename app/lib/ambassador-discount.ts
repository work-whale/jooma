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
