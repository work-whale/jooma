// What a subscription is actually worth per month.
//
// Kept pure and separate from the Stripe call so it can be tested against real
// payloads without the network. Everything here works in MINOR units (pence),
// the way Stripe reports money, and converts to major only at the edge.
//
// THE THREE THINGS THAT MADE THE OLD FIGURE WRONG
//
// 1. Discounts. Checkout sets allow_promotion_codes and nothing persists what
//    was actually charged. Two live production subscribers list at £7.99 and
//    are billed £0.08 and £0.80 — a 27x overstatement across the pair.
// 2. Interval. An annual subscriber was counted at the monthly price. A year's
//    money divided by twelve is the monthly figure; anything else double counts
//    or undercounts depending on which way it is read.
// 3. Currency. Both live subscriptions carry presentment_currency 'php' while
//    being denominated in GBP. Every column we store is named *_gbp, so a
//    subscription genuinely denominated in something else must not be silently
//    added to a pounds total.
//
// No "use client" and no imports: safe from either side, and unit testable.

/** The minimum shape needed to value a subscription. Structural rather than
 *  Stripe.Subscription so tests can build fixtures by hand. */
export interface ValuableSubscription {
  currency?: string | null;
  items?: {
    data?: {
      quantity?: number | null;
      price?: {
        unit_amount?: number | null;
        currency?: string | null;
        recurring?: { interval?: string | null; interval_count?: number | null } | null;
      } | null;
    }[];
  } | null;
  discounts?: unknown[] | null;
}

/** A coupon as it arrives once `discounts` is expanded. */
interface Coupon {
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
}

export interface MonthlyValue {
  /** Pence per month, after discounts, or null when it cannot be trusted. */
  pence: number | null;
  /** Set when the subscription was skipped, for the caller to surface. */
  skipped?: "unpriced" | "foreign-currency";
  /** The currency this subscription is denominated in, lowercased. */
  currency: string;
}

/** How many months one billing period covers. Stripe's four intervals. */
function monthsPerPeriod(interval: string | null | undefined, count: number): number | null {
  switch (interval) {
    case "day":
      return (count * 1) / 30; // approximate by design; nothing sells daily
    case "week":
      return (count * 7) / 30;
    case "month":
      return count;
    case "year":
      return count * 12;
    default:
      return null;
  }
}

/** Pull the coupon out of a discount, which may be the coupon itself or wrap
 *  one. Stripe has moved this around; accept either shape. */
function couponOf(discount: unknown): Coupon | null {
  if (!discount || typeof discount !== "object") return null;
  const d = discount as { coupon?: Coupon; percent_off?: number; amount_off?: number };
  if (d.coupon && typeof d.coupon === "object") return d.coupon;
  if (typeof d.percent_off === "number" || typeof d.amount_off === "number") {
    return d as Coupon;
  }
  return null;
}

/**
 * Monthly recurring value of one subscription, in pence, after discounts.
 *
 * `expectCurrency` is the currency the caller's totals are in. A subscription
 * denominated in anything else is skipped rather than converted: we have no FX
 * rate for live subscription revenue, and adding pesos to a pounds total
 * silently is worse than reporting one fewer subscriber and saying so.
 *
 * Note this reads the subscription's own `currency`, NOT
 * `presentment_details.presentment_currency`. Presentment is what the customer
 * sees at the till; the subscription is still denominated, and settled, in the
 * price's currency.
 */
export function monthlyValue(
  sub: ValuableSubscription,
  expectCurrency = "gbp",
): MonthlyValue {
  const items = sub.items?.data ?? [];
  const currency = (sub.currency ?? items[0]?.price?.currency ?? expectCurrency).toLowerCase();

  if (currency !== expectCurrency.toLowerCase()) {
    return { pence: null, skipped: "foreign-currency", currency };
  }

  let gross = 0;
  let priced = false;

  for (const item of items) {
    const price = item?.price;
    const unit = price?.unit_amount;
    if (typeof unit !== "number") continue; // metered or tiered: nothing to read

    const months = monthsPerPeriod(price?.recurring?.interval, price?.recurring?.interval_count ?? 1);
    if (months === null || months <= 0) continue;

    gross += (unit * (item.quantity ?? 1)) / months;
    priced = true;
  }

  if (!priced) return { pence: null, skipped: "unpriced", currency };

  // Discounts apply to the whole subscription. Percentages compound the way
  // Stripe stacks them; fixed amounts come off after, and are per PERIOD, so
  // they get the same monthly normalisation as the price above.
  let net = gross;
  const months = monthsPerPeriod(
    items[0]?.price?.recurring?.interval,
    items[0]?.price?.recurring?.interval_count ?? 1,
  ) ?? 1;

  for (const discount of sub.discounts ?? []) {
    const coupon = couponOf(discount);
    if (!coupon) continue;

    if (typeof coupon.percent_off === "number") {
      net *= 1 - coupon.percent_off / 100;
    } else if (typeof coupon.amount_off === "number") {
      // A coupon in another currency cannot be subtracted from this total.
      if (coupon.currency && coupon.currency.toLowerCase() !== currency) continue;
      net -= coupon.amount_off / months;
    }
  }

  // A discount larger than the price bills nothing, never a refund.
  return { pence: Math.max(0, Math.round(net)), currency };
}

export interface IntervalCounts {
  month: number;
  year: number;
  /** Anything else: a weekly or daily price, or nothing readable. */
  other: number;
}

/** How a subscription is billed, from its first item's price. */
export function intervalOf(sub: ValuableSubscription): "month" | "year" | null {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : null;
}

/** Monthly against yearly, for the Stats page. */
export function countByInterval(subs: ValuableSubscription[]): IntervalCounts {
  const out: IntervalCounts = { month: 0, year: 0, other: 0 };
  for (const sub of subs) {
    const interval = intervalOf(sub);
    if (interval) out[interval] += 1;
    else out.other += 1;
  }
  return out;
}

/** Sum a batch, keeping the skips visible rather than folding them into 0. */
export function totalMonthly(
  subs: ValuableSubscription[],
  expectCurrency = "gbp",
): { pence: number; counted: number; skipped: number } {
  let pence = 0;
  let counted = 0;
  let skipped = 0;

  for (const sub of subs) {
    const value = monthlyValue(sub, expectCurrency);
    if (value.pence === null) {
      skipped += 1;
      continue;
    }
    pence += value.pence;
    counted += 1;
  }

  return { pence, counted, skipped };
}
