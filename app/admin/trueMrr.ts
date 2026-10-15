import "server-only";
import { stripe } from "@/app/lib/stripe";
import {
  countByInterval,
  monthlyValue,
  type IntervalCounts,
  type ValuableSubscription,
} from "@/app/lib/subscriptionValue";

/**
 * What the paying teachers are ACTUALLY billed each month, read live from
 * Stripe.
 *
 * The SQL figure (teacher_mrr) can only report list prices: nothing in our
 * database records what a subscription is really charged. Checkout allows
 * promotion codes, and on production both live subscribers are on heavy ones —
 * listed at GBP 7.99, billed GBP 0.08 and GBP 0.80. No amount of fixing the
 * query reaches that; only Stripe knows.
 *
 * WHY THIS TAKES A LIST OF SUBSCRIPTION IDS
 *
 * An earlier version summed every `active` subscription on the account. That
 * made the dashboard incoherent, because the tiles beside the headline count a
 * different population: on staging it read GBP 46.95 next to "1 paying teacher"
 * and "GBP 7.99 cancelling". Of the five active subscriptions there, two belong
 * to staff accounts, one to the cancelling teacher, one to no profile at all,
 * and one teacher holds two.
 *
 * So the caller passes exactly the subscriptions teacher_mrr() counted, and
 * this sums those. The headline and the tiles then describe the same people by
 * construction rather than by coincidence.
 *
 * FAILURE POSTURE
 *
 * Never throws. On any failure the caller falls back to the SQL figure and says
 * so on screen. An admin dashboard that renders a slightly rougher number is
 * much better than one that 500s because Stripe is having a bad afternoon.
 */
export interface TrueMrr {
  /** Pounds per month actually billed, or null when Stripe could not be read. */
  gbp: number | null;
  /** Subscriptions included in the figure. */
  counted: number;
  /** Named by the database but not billable: gone from Stripe, no longer
   *  active, not in GBP, or nothing readable to price. */
  skipped: number;
  /** The counted subscriptions split by how they are billed, so the Stats
   *  page's monthly and yearly figures cover the same people as the MRR. */
  byInterval: IntervalCounts;
  error: string | null;
}

const NO_INTERVALS: IntervalCounts = { month: 0, year: 0, other: 0 };

/** Statuses that are actually producing revenue.
 *
 *  A subscription the database still names but which Stripe has moved past —
 *  cancelled outright, or lapsed into `unpaid` — bills nothing, and counting it
 *  would reintroduce the overstatement this exists to remove. `trialing` is
 *  excluded for the same reason: a trial bills nothing this month. */
const BILLING_STATUSES = new Set(["active"]);

export async function loadTrueMrr(subscriptionIds: string[]): Promise<TrueMrr> {
  // Nobody is paying. A real answer, and no reason to call Stripe for it.
  if (subscriptionIds.length === 0) {
    return { gbp: 0, counted: 0, skipped: 0, byInterval: NO_INTERVALS, error: null };
  }

  try {
    /*
     * Retrieved one at a time rather than listed and filtered.
     *
     * `subscriptions.list` cannot take a set of ids, so the alternative is to
     * page the whole account and discard most of it — which is how the previous
     * version ended up summing subscriptions that were none of our business.
     * These are the teachers who are paying, so the list is small by
     * definition; if it ever is not, the account has bigger reporting needs
     * than this function.
     */
    const results = await Promise.all(
      subscriptionIds.map(async (id) => {
        try {
          return await stripe.subscriptions.retrieve(id, { expand: ["discounts"] });
        } catch (err) {
          // A subscription id we hold that Stripe no longer has. Real: a row
          // can outlive its subscription if a webhook was missed. Skipped
          // rather than failing the whole figure.
          console.warn("[admin] could not retrieve subscription", id, err);
          return null;
        }
      }),
    );

    let pence = 0;
    let counted = 0;
    let skipped = 0;
    const billing: ValuableSubscription[] = [];

    for (const sub of results) {
      if (!sub || !BILLING_STATUSES.has(sub.status)) {
        skipped += 1;
        continue;
      }
      const value = monthlyValue(sub as unknown as ValuableSubscription, "gbp");
      if (value.pence === null) {
        skipped += 1;
        continue;
      }
      pence += value.pence;
      counted += 1;
      billing.push(sub as unknown as ValuableSubscription);
    }

    return {
      gbp: pence / 100,
      counted,
      skipped,
      byInterval: countByInterval(billing),
      error: null,
    };
  } catch (err) {
    console.error("[admin] could not read true MRR from Stripe", err);
    return {
      gbp: null,
      counted: 0,
      skipped: 0,
      byInterval: NO_INTERVALS,
      error: err instanceof Error ? err.message : "Could not reach Stripe.",
    };
  }
}
