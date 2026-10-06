import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { stripe, priceIdFor, isPaidPlanId, intervalOfPrice } from "@/app/lib/stripe";
import { PLANS, asPlanId } from "@/app/lib/plans";

// Moves an existing subscriber UP to a more expensive plan (today: Pro to Max)
// by swapping the price on the subscription they already have.
//
// WHY NOT CHECKOUT
// The obvious implementation — POST /api/stripe/checkout with plan "max" — is
// wrong here. Checkout creates a NEW subscription, so a Pro subscriber would
// end up holding two at once and paying £7.99 + £14.99 every month. Checkout is
// for people who have nothing yet; this route is for people who already pay us.
//
// Stripe prorates the swap: they are charged the difference for the remainder
// of the current period, and the full new price from the next renewal. Their
// billing date does not move.
//
// WHAT THIS ROUTE CANNOT DO
// It cannot change what the customer pays to an arbitrary amount. The target
// plan is checked against the paid-plan allowlist and the PRICE is then resolved
// server-side by priceIdFor(); no price, item or amount is ever read from the
// request body. That is the same reasoning as the flow allowlist in
// ../portal/route.ts, and it is the reason this is a bespoke route rather than
// Stripe's subscription_update_confirm portal flow.
//
// It also does not write profiles.plan. The webhook is the sole writer for
// subscription state (syncSubscription in ../webhook/route.ts): the swap fires
// customer.subscription.updated, planForPriceId() resolves the new price to
// "max", and the plan lands a moment later. A second writer racing it would
// produce a plan that flips back on the next event.

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

  // Allowlist, not a cast: this is what stops a crafted body naming `school`
  // (no working billing) or an arbitrary string.
  if (!isPaidPlanId(requested)) {
    return NextResponse.json(
      { error: "That isn't a plan you can upgrade to." },
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

  // Ownership check: the subscription id comes from THIS user's profile row,
  // never from the request body, so a caller cannot upgrade someone else's
  // subscription.
  const subscriptionId = profile?.stripe_subscription_id;
  if (!subscriptionId) {
    // No subscription to swap. Genuinely a checkout, not an upgrade — say so
    // rather than failing, because this is the normal path for a free teacher
    // who has only ever bought a top-up (which attaches a Stripe customer but
    // no subscription).
    return NextResponse.json(
      {
        error: "You don't have a subscription yet. Choose a plan to get started.",
        needsCheckout: true,
      },
      { status: 400 },
    );
  }

  if (profile?.subscription_status === "canceled") {
    return NextResponse.json(
      { error: "This subscription has ended. Please subscribe again." },
      { status: 400 },
    );
  }

  // Cancelling but not yet ended. Swapping the price here would upgrade a
  // subscription that is still scheduled to stop, so they would pay more for
  // something about to disappear. Renewing first is one click on the same page.
  if (profile?.cancel_at_period_end) {
    return NextResponse.json(
      {
        error:
          "Your plan is set to end. Renew it first, then you can change plan.",
      },
      { status: 400 },
    );
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);

    // Swap the EXISTING item rather than adding one. Passing an item id tells
    // Stripe to replace that line; omitting it would append a second line and
    // bill both plans on the same subscription.
    const item = sub.items.data[0];
    if (!item) {
      console.error("[stripe/upgrade] subscription has no items", subscriptionId);
      return NextResponse.json(
        { error: "Could not change your plan. Please contact support." },
        { status: 500 },
      );
    }

    // Same interval they already bill at: a yearly subscriber moves to the
    // yearly price of the new plan, a monthly one to the monthly. Switching
    // interval is not offered here.
    const priceId = await priceIdFor(target, intervalOfPrice(item.price));

    // Already on the target price in Stripe even though our row disagrees —
    // treat as success and let the webhook reconcile, rather than billing a
    // pointless proration for a no-op change.
    if (item.price?.id === priceId) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: priceId }],
      // Charge the difference for the rest of this period. The alternative,
      // "none", would give away the upgrade until the next renewal.
      proration_behavior: "create_prorations",
      // Re-stamp so the webhook can resolve the profile even if this
      // subscription was created without it (an admin-made one, say).
      metadata: { ...sub.metadata, userId: user.id },
    });

    // Deliberately no profiles.plan write here — see the note at the top. The
    // caller re-renders and shows "activating", the webhook lands, done.
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Surface Stripe's own message: the most likely real-world failure is a
    // declined or missing card, and "Could not change your plan" tells the
    // teacher nothing they can act on.
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : null;

    console.error("[stripe/upgrade]", target, err);
    return NextResponse.json(
      { error: message ?? "Could not change your plan." },
      { status: 500 },
    );
  }
}
