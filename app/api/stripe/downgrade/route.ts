import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import {
  stripe,
  priceIdFor,
  isPaidPlanId,
  intervalOfPrice,
  scheduleNextPhase,
} from "@/app/lib/stripe";
import { PLANS, asPlanId } from "@/app/lib/plans";

// Moves an existing subscriber DOWN to a cheaper plan (today: Max to Pro), at
// the END of the period they have already paid for.
//
// WHY NOT AN IMMEDIATE SWAP LIKE ../upgrade
// Because the allowance is not prorated and cannot be. A plan's AI ceiling is a
// flat monthly figure (AI_SPEND_CEILING_PENCE), and monthly_ai_spend measures
// what has been spent since the 1st. Flipping Max to Pro mid-month drops the
// ceiling 375p to 150p while the spend already on the clock stays put, so a
// teacher who had used, say, 200p of their Max allowance would be instantly
// over a Pro ceiling and hard-blocked until the 1st — having just asked to pay
// us LESS, not to stop working. They would also be owed a refund for the part
// of Max they had paid for and no longer had.
//
// Scheduling the change for the renewal date avoids both. They keep everything
// they paid for until the day it runs out, then the cheaper plan begins. No
// proration, no refund, no cliff.
//
// WHAT THIS ROUTE CANNOT DO
// Same posture as ../upgrade: the target is checked against the paid-plan
// allowlist, the price is resolved SERVER-SIDE by priceIdFor(), and the
// subscription id comes from the caller's own profile row. No price, item or
// amount is ever read from the request body. It additionally refuses any target
// that is not strictly cheaper than the current plan, so it can never be used
// as an un-prorated upgrade.
//
// It does not write profiles.plan either — nothing has changed yet. The plan
// changes when the schedule advances and Stripe fires
// customer.subscription.updated, which syncSubscription handles already.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requested = (body as { plan?: unknown } | null)?.plan;

  // Allowlist, not a cast. Note this also rejects "free": dropping to Free is a
  // cancellation, not a price swap, and goes through the portal's
  // subscription_cancel flow instead. priceIdFor() would throw on it anyway.
  if (!isPaidPlanId(requested)) {
    return NextResponse.json(
      { error: "That isn't a plan you can switch to." },
      { status: 400 },
    );
  }
  const target = requested;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "plan, stripe_subscription_id, subscription_status, cancel_at_period_end",
    )
    .eq("id", user.id)
    .maybeSingle();

  const current = asPlanId(profile?.plan);

  if (current === target) {
    return NextResponse.json(
      { error: `You're already on ${PLANS[target].name}.` },
      { status: 400 },
    );
  }

  // The direction check. Without it this route would be an upgrade that skips
  // the proration the upgrade route deliberately charges — a way to get Max at
  // Pro's price for the rest of the month.
  const currentPrice = PLANS[current].priceMonthly ?? 0;
  const targetPrice = PLANS[target].priceMonthly ?? 0;
  if (targetPrice >= currentPrice) {
    return NextResponse.json(
      { error: `${PLANS[target].name} isn't a step down from your current plan.` },
      { status: 400 },
    );
  }

  // Ownership check: the subscription id comes from THIS user's profile row,
  // never from the request body.
  const subscriptionId = profile?.stripe_subscription_id;
  if (!subscriptionId) {
    return NextResponse.json(
      { error: "You don't have a subscription to change." },
      { status: 400 },
    );
  }

  if (profile?.subscription_status === "canceled") {
    return NextResponse.json(
      { error: "This subscription has ended. Please subscribe again." },
      { status: 400 },
    );
  }

  // Already on its way out. Scheduling a plan change for a subscription that
  // will not renew would schedule nothing, and quietly: the phase would never
  // start because the subscription ends first. Renewing is one click away on
  // the same page.
  if (profile?.cancel_at_period_end) {
    return NextResponse.json(
      {
        error:
          "Your plan is already set to end. Renew it first if you'd like to move to a cheaper plan instead.",
      },
      { status: 400 },
    );
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);

    const item = sub.items.data[0];
    if (!item?.price?.id) {
      console.error("[stripe/downgrade] subscription has no items", subscriptionId);
      return NextResponse.json(
        { error: "Could not change your plan. Please contact support." },
        { status: 500 },
      );
    }

    // Same interval they already bill at: a yearly subscriber moves to the
    // yearly price of the new plan, a monthly one to the monthly. Switching
    // interval is not offered here.
    const priceId = await priceIdFor(target, intervalOfPrice(item.price));

    // Already billing at the target price even though our row disagrees. Let
    // the webhook reconcile rather than scheduling a phase that changes nothing.
    if (item.price.id === priceId) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    // One schedule at a time: a downgrade already scheduled is replaced rather
    // than stacked, so changing their mind from Max-to-Pro to something else
    // just works. See scheduleNextPhase for the phases themselves.
    const existing = sub.schedule;
    await scheduleNextPhase({
      subscriptionId,
      existingScheduleId: typeof existing === "string" ? existing : existing?.id,
      currentPriceId: item.price.id,
      quantity: item.quantity ?? 1,
      nextPriceId: priceId,
      userId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : null;

    console.error("[stripe/downgrade]", target, err);
    return NextResponse.json(
      { error: message ?? "Could not change your plan." },
      { status: 500 },
    );
  }
}

/**
 * Cancel a scheduled downgrade, so the subscription simply carries on.
 *
 * Releasing the schedule leaves the subscription exactly as it was — same
 * price, same renewal date — rather than cancelling anything. That is the whole
 * undo: the plan they are on was never changed in the first place.
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const subscriptionId = profile?.stripe_subscription_id;
  if (!subscriptionId) {
    return NextResponse.json(
      { error: "There's no subscription to change." },
      { status: 400 },
    );
  }

  try {
    // Re-read the subscription to find its schedule rather than taking an id
    // from the caller: releasing a schedule id supplied by the client would let
    // anyone release somebody else's.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const schedule = sub.schedule;
    const scheduleId = typeof schedule === "string" ? schedule : schedule?.id;

    // Nothing scheduled. Report success: the end state they asked for — no
    // pending change — is the state they are already in.
    if (!scheduleId) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    await stripe.subscriptionSchedules.release(scheduleId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : null;

    console.error("[stripe/downgrade] release", err);
    return NextResponse.json(
      { error: message ?? "Could not cancel the plan change." },
      { status: 500 },
    );
  }
}
