// Server-only Stripe client + the mapping between our PlanId/interval and the
// Stripe Price IDs. This is the single place that knows how a plan becomes a
// price and how a paid price becomes a plan, so the checkout route and the
// webhook stay in agreement.
//
// WHERE PRICE IDs LIVE
// Prices are configured in the database (plan_config.stripe_price_monthly,
// topup_packs.stripe_price_id) and fall back to the environment variables when
// the column is null. The database is what the admin console writes, so a price
// change is a live action rather than a redeploy; the env var remains the
// recovery path if a bad write ever lands, and keeps local dev working with no
// DB setup.
//
// Price IDs are not secrets — they appear in any Checkout URL and identify a
// product the way a SKU does. STRIPE_SECRET_KEY is the secret and stays in the
// environment.
import "server-only";
import Stripe from "stripe";
import type { BillingInterval, PlanId } from "./plans";
import { supabaseAdmin } from "./supabase-admin";
import { isTrialCheckout } from "./trial";

if (!process.env.STRIPE_SECRET_KEY) {
  // Fail loud at import time in any server context that needs Stripe, rather
  // than producing a confusing 500 deep inside a request.
  throw new Error("STRIPE_SECRET_KEY is not set");
}

// No apiVersion override — use the version pinned by this SDK release so the
// TypeScript types and the wire behaviour always match.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/** The plans that are self-serve via Stripe Checkout. `free` is the locked "no
 *  plan" state and has nothing to buy; `school` is custom/contact-sales
 *  (per-seat, invoiced, not a self-serve Checkout price). */
export type PaidPlanId = Extract<PlanId, "standard" | "pro" | "max">;

/** The plans checkout will sell. Anything else is rejected before Stripe. */
export const PAID_PLAN_IDS: PaidPlanId[] = ["standard", "pro", "max"];

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLAN_IDS as string[]).includes(value);
}

/** The env-var price for a plan at an interval. The recovery path behind
 *  plan_config, and all local dev needs. */
function envPriceIdFor(plan: PaidPlanId, interval: BillingInterval): string | undefined {
  if (interval === "year") {
    return {
      standard: process.env.STRIPE_PRICE_STANDARD_YEARLY,
      pro: process.env.STRIPE_PRICE_PRO_YEARLY,
      max: process.env.STRIPE_PRICE_MAX_YEARLY,
    }[plan];
  }
  return {
    standard: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
    pro: process.env.STRIPE_PRICE_PRO_MONTHLY,
    max: process.env.STRIPE_PRICE_MAX_MONTHLY,
  }[plan];
}

/**
 * Resolve the configured Stripe Price ID for a paid plan, monthly or yearly.
 *
 * Reads plan_config first (stripe_price_monthly or stripe_price_yearly), falls
 * back to the env var. A DB error is treated the same as "not configured" and
 * falls through to the env var rather than failing checkout: a database blip
 * should not stop someone paying us.
 *
 * `interval` defaults to monthly so every caller written before yearly billing
 * existed keeps charging exactly what it did.
 */
export async function priceIdFor(
  plan: PaidPlanId,
  interval: BillingInterval = "month",
): Promise<string> {
  const column = interval === "year" ? "stripe_price_yearly" : "stripe_price_monthly";

  const { data, error } = await supabaseAdmin
    .from("plan_config")
    .select("stripe_price_monthly, stripe_price_yearly")
    .eq("plan_id", plan)
    .maybeSingle();

  if (error) {
    console.error("[stripe] plan_config price lookup failed, using env", error);
  }

  const priceId = data?.[column] || envPriceIdFor(plan, interval);
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan=${plan} interval=${interval}`);
  }
  return priceId;
}

/**
 * The interval a Stripe price bills at, as one of ours.
 *
 * Anything that is not yearly reads as monthly: those are the only two we sell,
 * and monthly is what every subscription predating yearly billing is on.
 */
export function intervalOfPrice(
  price: { recurring?: { interval?: string | null } | null } | null | undefined,
): BillingInterval {
  return price?.recurring?.interval === "year" ? "year" : "month";
}

/**
 * The interval a live subscription bills at, read from Stripe.
 *
 * Nothing on `profiles` records it, and nothing needs to: it is a fact about the
 * Stripe price, which is the authority. Any failure reads as monthly, which
 * only costs the wording of one sentence, never a charge.
 */
export async function subscriptionInterval(
  subscriptionId: string | null | undefined,
): Promise<BillingInterval> {
  return (await subscriptionBilling(subscriptionId)).interval;
}

/** A resolved top-up: the Stripe price to charge, and the pack it came from.
 *  `packId` is null only when falling back to the environment price, which has
 *  no pack row behind it. */
export interface ResolvedTopUp {
  priceId: string;
  packId: string | null;
  /** PENCE of credit the pack grants. Null on the env fallback, where the
   *  amount paid is the only thing we know. */
  unit: number | null;
}

/**
 * Resolve a one-off AI-credit top-up to charge. Must be a ONE-TIME price —
 * Checkout's `mode: "payment"` rejects recurring prices.
 *
 * With a packId, resolves THAT pack. Without one, falls back to the lowest-sort
 * active credit pack, which is what every caller did before packs could be
 * chosen — so an old client that sends no pack still buys the default.
 *
 * The env var remains the last resort so local development works with no pack
 * seeded. Note it is only reachable when no pack matched at all: a pack that
 * exists but has no stripe_price_id is REFUSED rather than silently charged at
 * the env price, which would bill £1.50 for a pack advertised at £5.
 */
export async function topUpPriceId(packId?: string | null): Promise<ResolvedTopUp> {
  let query = supabaseAdmin
    .from("topup_packs")
    .select("id, unit, stripe_price_id")
    .eq("kind", "credit_gbp")
    .eq("active", true);

  query = packId
    ? query.eq("id", packId)
    : query.order("sort").limit(1);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[stripe] topup pack lookup failed", error);
  }

  // A named pack that does not exist, is inactive, or is not a credit pack is
  // an error rather than a reason to sell the default one: the teacher chose a
  // specific thing and charging them for something else is worse than failing.
  if (packId && !data) {
    throw new Error(`No active credit pack with id=${packId}`);
  }
  if (packId && !data?.stripe_price_id) {
    throw new Error(`Pack id=${packId} has no Stripe price configured`);
  }

  if (data?.stripe_price_id) {
    return {
      priceId: data.stripe_price_id,
      packId: data.id as string,
      unit: Number(data.unit),
    };
  }

  const envPriceId = process.env.STRIPE_PRICE_CREDIT_TOP_UP;
  if (!envPriceId) {
    throw new Error("No Stripe price configured for the credit top-up");
  }
  return { priceId: envPriceId, packId: null, unit: null };
}

/**
 * Reverse lookup: which of our plans does a paid Stripe Price ID grant?
 *
 * THIS MUST RECOGNISE SUPERSEDED PRICES. Stripe Price objects are immutable, so
 * changing a price means creating a new one — but existing subscribers keep
 * billing against the price they signed up on, potentially for years. The
 * webhook treats a null return as "no subscription" and drops the user to Free,
 * so a lookup that only knew the *current* price would silently downgrade every
 * existing subscriber the first time a price changed.
 *
 * plan_price_history records every price ever pointed at a plan, archived ones
 * included. The env var and the current plan_config value are checked too, so
 * this still resolves correctly before any price change has been recorded.
 *
 * Returns null for prices we genuinely don't recognise.
 */
export async function planForPriceId(
  priceId: string | undefined | null,
): Promise<PlanId | null> {
  if (!priceId) return null;

  // Cheap path: the prices currently configured in the environment, monthly
  // and yearly. A yearly subscriber missing from this list would be read as "no
  // subscription" and dropped to "No plan" by the webhook.
  if (priceId === process.env.STRIPE_PRICE_STANDARD_MONTHLY) return "standard";
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "pro";
  if (priceId === process.env.STRIPE_PRICE_MAX_MONTHLY) return "max";
  if (priceId === process.env.STRIPE_PRICE_STANDARD_YEARLY) return "standard";
  if (priceId === process.env.STRIPE_PRICE_PRO_YEARLY) return "pro";
  if (priceId === process.env.STRIPE_PRICE_MAX_YEARLY) return "max";

  const { data: historic, error: historyErr } = await supabaseAdmin
    .from("plan_price_history")
    .select("plan_id")
    .eq("stripe_price_id", priceId)
    .maybeSingle();

  if (historyErr) {
    console.error("[stripe] plan_price_history lookup failed", historyErr);
  }
  if (historic?.plan_id) return historic.plan_id as PlanId;

  // A price set in plan_config but not yet recorded in history — possible if a
  // price were ever changed by hand in the database rather than through the
  // admin route, which writes both.
  //
  // Either column: a yearly price is as much the plan's as the monthly one.
  // Price ids come from Stripe (`price_` plus alphanumerics), so interpolating
  // one into the filter cannot break out of it; the guard makes that explicit.
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) return null;
  const { data: current, error: currentErr } = await supabaseAdmin
    .from("plan_config")
    .select("plan_id")
    .or(`stripe_price_monthly.eq.${priceId},stripe_price_yearly.eq.${priceId}`)
    .limit(1)
    .maybeSingle();

  if (currentErr) {
    console.error("[stripe] plan_config reverse lookup failed", currentErr);
  }
  if (current?.plan_id) return current.plan_id as PlanId;

  return null;
}

/**
 * Whether the Checkout session a teacher just returned from started a free
 * trial for them. See isTrialCheckout for the rules.
 *
 * Asked of Stripe directly rather than read off the profile: the webhook that
 * writes `trialing` there races this redirect and usually loses. Any failure
 * (an edited id, a Stripe hiccup) reads as "no", which only costs the browser
 * copy of the event; the webhook still sends the server copy.
 */
export async function trialStartedBy(
  sessionId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!sessionId || !sessionId.startsWith("cs_")) return false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    return isTrialCheckout(
      session as unknown as Parameters<typeof isTrialCheckout>[0],
      userId,
    );
  } catch (err) {
    console.warn("[stripe] trialStartedBy lookup failed", sessionId, err);
    return false;
  }
}

/** A plan or billing change that Stripe is holding until the period ends. */
export interface PendingPlanChange {
  /** The plan that starts at `at`. The SAME plan as now when only the billing
   *  interval is changing (yearly to monthly at renewal). */
  plan: PlanId;
  /** The interval billing moves to at `at`. */
  interval: BillingInterval;
  /** ISO timestamp the new plan takes effect — the current period's end. */
  at: string;
  /** The schedule to release if they change their mind. */
  scheduleId: string;
}

/** What the billing page needs to know about a live subscription. */
export interface SubscriptionBilling {
  /** The interval it bills at now. */
  interval: BillingInterval;
  /** A change waiting on a schedule, or null. */
  pending: PendingPlanChange | null;
}

/**
 * The downgrade a subscriber has scheduled, if any.
 *
 * A downgrade is not applied immediately (see app/api/stripe/downgrade), it is
 * parked on a Stripe subscription SCHEDULE whose second phase starts at the
 * renewal date. That state lives only in Stripe: nothing on `profiles` records
 * it, deliberately, because the teacher is still fully on their current plan
 * until it lands and every existing column should keep saying so.
 *
 * So the billing page reads it back through here at render time. Returns null
 * when there is no schedule, when the schedule has only the current phase, or
 * when anything at all goes wrong — a Stripe hiccup must degrade to "no pending
 * change" rather than breaking a page whose main job is showing the plan they
 * already have.
 */
export async function pendingPlanChange(
  subscriptionId: string | null | undefined,
): Promise<PendingPlanChange | null> {
  return (await subscriptionBilling(subscriptionId)).pending;
}

/**
 * The interval a subscription bills at and the change waiting on it, from ONE
 * Stripe read. The billing page needs both on every render.
 *
 * Degrades to monthly with nothing pending on any failure, for the reasons
 * given on pendingPlanChange.
 */
export async function subscriptionBilling(
  subscriptionId: string | null | undefined,
): Promise<SubscriptionBilling> {
  const none: SubscriptionBilling = { interval: "month", pending: null };
  if (!subscriptionId) return none;

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["schedule"] });
  } catch (err) {
    console.error("[stripe] subscription billing lookup failed", err);
    return none;
  }

  const interval = intervalOfPrice(sub.items.data[0]?.price);

  try {
    return { interval, pending: await pendingFromSchedule(sub.schedule) };
  } catch (err) {
    console.error("[stripe] pendingPlanChange lookup failed", err);
    return { interval, pending: null };
  }
}

/** Read the waiting change off an expanded schedule, or null. */
async function pendingFromSchedule(
  schedule: Stripe.Subscription["schedule"],
): Promise<PendingPlanChange | null> {
  // Not expanded into an object, or no schedule attached at all.
  if (!schedule || typeof schedule === "string") return null;
  // A released or cancelled schedule is no longer going to do anything.
  if (schedule.status !== "active" && schedule.status !== "not_started") return null;

  // Phase 0 is the period they are in now; the change is phase 1.
  const upcoming = schedule.phases?.[1];
  if (!upcoming) return null;

  const price = upcoming.items?.[0]?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  if (!priceId) return null;

  const plan = await planForPriceId(priceId);
  if (!plan) return null;

  // A phase item's price arrives as a bare id. Its interval is what tells a
  // yearly-to-monthly switch apart from a plan change, so fetch it.
  const priceObject = typeof price === "string" ? await stripe.prices.retrieve(priceId) : price;

  return {
    plan,
    interval: intervalOfPrice(priceObject as { recurring?: { interval?: string | null } | null }),
    at: new Date(upcoming.start_date * 1000).toISOString(),
    scheduleId: schedule.id,
  };
}

/**
 * Park a new price on a subscription schedule that starts at renewal.
 *
 * Shared by a downgrade and by a yearly-to-monthly switch, which are the same
 * operation: keep everything they paid for until the period ends, then bill the
 * new price. Any schedule already attached is released first, since Stripe
 * allows only one per subscription.
 *
 * from_subscription adopts the live subscription rather than creating a second
 * one. The schedule starts with a single phase mirroring the current period,
 * which is exactly what we keep as phase one.
 */
export async function scheduleNextPhase(opts: {
  subscriptionId: string;
  existingScheduleId: string | null | undefined;
  currentPriceId: string;
  quantity: number;
  nextPriceId: string;
  userId: string;
}): Promise<void> {
  const { subscriptionId, existingScheduleId, currentPriceId, quantity, nextPriceId, userId } =
    opts;

  if (existingScheduleId) {
    await stripe.subscriptionSchedules.release(existingScheduleId);
  }

  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: subscriptionId,
  });

  const currentPhase = schedule.phases[0];
  if (!currentPhase) {
    throw new Error(`Schedule ${schedule.id} has no phases`);
  }

  await stripe.subscriptionSchedules.update(schedule.id, {
    // end_behavior "release" hands control back to the plain subscription once
    // the last phase starts, so the subscription carries on renewing at the
    // new price instead of stopping. The default is "release" but it is worth
    // being explicit: "cancel" here would silently end their subscription at
    // the next renewal, which is emphatically not what they asked for.
    end_behavior: "release",
    phases: [
      {
        // Phase one: what they already paid for, untouched.
        items: [{ price: currentPriceId, quantity }],
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
      },
      {
        // Phase two: the new price, starting the moment phase one ends.
        items: [{ price: nextPriceId, quantity }],
        // No proration: nothing is being changed mid-period, so there is
        // nothing to prorate. Stated rather than left to the default because
        // a stray proration here would issue a credit note for a period the
        // teacher fully used.
        proration_behavior: "none",
      },
    ],
    metadata: { userId },
  });
}
