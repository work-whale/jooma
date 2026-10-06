import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/app/lib/auth/server";
import {
  stripe,
  priceIdFor,
  isPaidPlanId,
  intervalOfPrice,
  scheduleNextPhase,
} from "@/app/lib/stripe";
import {
  asPlanId,
  isBillingInterval,
  PLANS,
  type BillingInterval,
  type PlanId,
} from "@/app/lib/plans";
import {
  intervalSwitchKind,
  intervalSwitchRefusalMessage,
  planMoveOf,
  usableProrationDate,
  type IntervalSwitchKind,
} from "@/app/lib/interval-switch";

// Moves an existing subscriber between monthly and yearly billing on the plan
// they already have. Which way, and when, is decided by intervalSwitchKind in
// lib/interval-switch.ts:
//
//   monthly to yearly   now: charged today, less the unused part of the month
//   yearly to monthly   at renewal: they keep the year they paid for
//   during the trial    either way, now, with nothing charged
//
// GET previews the switch so the confirmation can quote the real figure; POST
// carries it out.
//
// AN OPTIONAL PLAN
// The profile's plan cards can show the other interval, so a teacher can pick
// Pro yearly while on Standard monthly. `plan` names that target; absent, it is
// the plan they are on. The plan rule runs first (a cheaper plan waits for
// renewal), then the interval rule. See intervalSwitchKind.
//
// WHAT THIS ROUTE CANNOT DO
// Same posture as ../upgrade and ../downgrade. The subscription comes from the
// caller's own profile, the plan is the one they are on, and the price is
// resolved server-side by priceIdFor(). From the request it reads only the
// interval (allowlisted) and the preview's proration date (range-checked, see
// usableProrationDate), plus an optional target plan, allowlisted like every
// other plan route. A plan change at the SAME interval is refused here: that is
// ../upgrade and ../downgrade.
//
// It does not write profiles either. The plan is unchanged, and the webhook
// writes the same plan back when Stripe reports the update.

/** Everything both handlers need, or the response that refuses the request. */
type Loaded =
  | { error: NextResponse }
  | {
      userId: string;
      sub: Stripe.Subscription;
      item: Stripe.SubscriptionItem;
      to: BillingInterval;
      kind: IntervalSwitchKind;
      nextPriceId: string;
      fromPlan: PlanId;
      toPlan: PlanId;
    };

function refuse(message: string, status = 400) {
  return { error: NextResponse.json({ error: message }, { status }) };
}

async function load(requestedInterval: unknown, requestedPlan: unknown): Promise<Loaded> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("Not signed in", 401);

  if (!isBillingInterval(requestedInterval)) {
    return refuse("Choose monthly or yearly billing.");
  }
  const to = requestedInterval;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, stripe_subscription_id, cancel_at_period_end")
    .eq("id", user.id)
    .maybeSingle();

  // Ownership: the subscription id comes from THIS user's row, never the body.
  const plan = asPlanId(profile?.plan);
  const subscriptionId = profile?.stripe_subscription_id;
  if (!subscriptionId || !isPaidPlanId(plan)) {
    return refuse("You don't have a subscription to change.");
  }

  // The plan to end up on: theirs unless one is named, and then only a plan
  // that can be bought. Never `school`, never an arbitrary string.
  if (requestedPlan !== undefined && requestedPlan !== null && !isPaidPlanId(requestedPlan)) {
    return refuse("That isn't a plan you can switch to.");
  }
  const toPlan = requestedPlan ?? plan;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  if (!item?.price?.id) {
    console.error("[stripe/switch-interval] subscription has no items", subscriptionId);
    return refuse("Could not change how you're billed. Please contact support.", 500);
  }

  // Stripe is the authority on status and schedule; the profile's own flag is
  // checked too, since it is what the page the teacher is looking at shows.
  const cancelAt = typeof sub.cancel_at === "number" && sub.cancel_at * 1000 > Date.now();
  const decision = intervalSwitchKind({
    from: intervalOfPrice(item.price),
    to,
    status: sub.status,
    cancelAtPeriodEnd: Boolean(profile?.cancel_at_period_end) || sub.cancel_at_period_end || cancelAt,
    hasSchedule: Boolean(sub.schedule),
    planMove: planMoveOf(PLANS[plan].priceMonthly ?? 0, PLANS[toPlan].priceMonthly ?? 0),
  });
  if (!decision.ok) return refuse(intervalSwitchRefusalMessage(decision.reason));

  const nextPriceId = await priceIdFor(toPlan, to);
  return {
    userId: user.id,
    sub,
    item,
    to,
    kind: decision.kind,
    nextPriceId,
    fromPlan: plan,
    toPlan,
  };
}

/** When the current billing period ends, as ISO. */
function periodEndIso(item: Stripe.SubscriptionItem): string | null {
  const unix = (item as unknown as { current_period_end?: number }).current_period_end;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

/** Whether moving to yearly would drop a coupon still waiting to be used. A
 *  code is a first-month discount, so it applies to monthly billing only. */
function losesDiscount(sub: Stripe.Subscription, to: BillingInterval): boolean {
  return to === "year" && (sub.discounts?.length ?? 0) > 0;
}

function errorMessage(err: unknown): string | null {
  return err && typeof err === "object" && "message" in err
    ? String((err as { message: unknown }).message)
    : null;
}

/**
 * Preview the switch: what they pay today, what they pay after, and when.
 *
 * The amount today comes from Stripe's own preview with the SAME proration
 * behaviour the switch uses, `always_invoice`. That matters: previewed with
 * `create_prorations` Stripe shows the upcoming invoice instead, which adds next
 * year's renewal and roughly doubles the figure (measured in the sandbox:
 * £135.99 against a real charge of £64.00).
 */
export async function GET(req: NextRequest) {
  try {
    const loaded = await load(
      req.nextUrl.searchParams.get("interval"),
      req.nextUrl.searchParams.get("plan"),
    );
    if ("error" in loaded) return loaded.error;
    const { sub, item, to, kind, nextPriceId, fromPlan, toPlan } = loaded;

    const nextPrice = await stripe.prices.retrieve(nextPriceId);
    const base = {
      kind,
      interval: to,
      fromPlan,
      toPlan,
      recurringPence: nextPrice.unit_amount ?? 0,
      losesDiscount: kind === "trial" && losesDiscount(sub, to),
    };

    if (kind === "trial") {
      return NextResponse.json({
        ...base,
        amountDuePence: 0,
        startsAt: new Date().toISOString(),
        trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      });
    }

    if (kind === "at_renewal") {
      return NextResponse.json({ ...base, amountDuePence: 0, startsAt: periodEndIso(item) });
    }

    // "now". The proration date is stamped here and sent back with the POST,
    // so the charge is calculated at the same second as this figure.
    const prorationDate = Math.floor(Date.now() / 1000);
    const preview = await stripe.invoices.createPreview({
      subscription: sub.id,
      subscription_details: {
        items: [{ id: item.id, price: nextPriceId, quantity: item.quantity ?? 1 }],
        proration_behavior: "always_invoice",
        proration_date: prorationDate,
      },
    });

    return NextResponse.json({
      ...base,
      amountDuePence: preview.amount_due,
      startsAt: new Date(prorationDate * 1000).toISOString(),
      prorationDate,
    });
  } catch (err) {
    console.error("[stripe/switch-interval] preview", err);
    return NextResponse.json(
      { error: errorMessage(err) ?? "Could not work out the change." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    interval?: unknown;
    plan?: unknown;
    prorationDate?: unknown;
  } | null;

  try {
    const loaded = await load(body?.interval, body?.plan);
    if ("error" in loaded) return loaded.error;
    const { userId, sub, item, to, kind, nextPriceId } = loaded;
    const quantity = item.quantity ?? 1;

    if (kind === "at_renewal") {
      // The same operation as a downgrade: keep what they paid for, then bill
      // the new price from renewal. Undone by DELETE /api/stripe/downgrade,
      // which releases whichever schedule is attached.
      await scheduleNextPhase({
        subscriptionId: sub.id,
        existingScheduleId: null, // load() refuses when one exists
        currentPriceId: item.price.id,
        quantity,
        nextPriceId,
        userId,
      });
      return NextResponse.json({ ok: true, kind });
    }

    if (kind === "trial") {
      // Nothing is charged during the trial, so the price simply changes. The
      // trial end is passed back explicitly so it keeps its date (confirmed in
      // the sandbox: still trialing, same trial_end, new price), and the first
      // charge when it ends is the new interval's price.
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: nextPriceId, quantity }],
        proration_behavior: "none",
        ...(sub.trial_end ? { trial_end: sub.trial_end } : {}),
        // A waiting first-month coupon would otherwise discount the whole first
        // YEAR. Codes apply to monthly billing, as checkout already treats them.
        // An empty STRING is how Stripe clears them; an empty array is ignored
        // (caught by the sandbox test, which still found the coupon attached).
        ...(losesDiscount(sub, to) ? { discounts: "" as const } : {}),
        metadata: { ...sub.metadata, userId, billingInterval: to },
      });
      return NextResponse.json({ ok: true, kind });
    }

    // "now": monthly to yearly on a live subscription.
    //
    // always_invoice, NOT create_prorations. Measured in the sandbox: with
    // create_prorations Stripe moves the subscription to yearly and charges
    // nothing, leaving the difference as pending items on next YEAR's invoice.
    //
    // pending_if_incomplete, because a declined card must not cost them their
    // plan. Without it Stripe applies the change anyway and the subscription
    // goes past_due, which the webhook reads as no plan at all. With it, the
    // subscription stays exactly as it was until the invoice is paid. No
    // metadata here: pending updates refuse it.
    const prorationDate =
      usableProrationDate(body?.prorationDate, Math.floor(Date.now() / 1000)) ?? undefined;

    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: nextPriceId, quantity }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      ...(prorationDate ? { proration_date: prorationDate } : {}),
      expand: ["latest_invoice"],
    });

    if (updated.pending_update) {
      // The card was declined and nothing changed. Void the unpaid invoice so
      // Stripe does not retry it tomorrow and switch them after we have told
      // them it failed. Best effort: the pending update expires on its own.
      const invoice = updated.latest_invoice;
      const invoiceId = typeof invoice === "string" ? invoice : invoice?.id;
      const open = typeof invoice === "object" && invoice?.status === "open";
      if (invoiceId && open) {
        await stripe.invoices.voidInvoice(invoiceId).catch((err) => {
          console.error("[stripe/switch-interval] could not void declined invoice", err);
        });
      }
      return NextResponse.json(
        {
          error:
            "Your card was declined, so nothing has changed. Update your card and try again.",
        },
        { status: 402 },
      );
    }

    return NextResponse.json({ ok: true, kind });
  } catch (err) {
    console.error("[stripe/switch-interval]", err);
    return NextResponse.json(
      { error: errorMessage(err) ?? "Could not change how you're billed." },
      { status: 500 },
    );
  }
}
