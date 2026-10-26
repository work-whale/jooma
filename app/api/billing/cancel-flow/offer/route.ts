import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe } from "@/app/lib/stripe";
import {
  asCancelReason,
  ensureRetentionCoupon,
  offerFor,
  OFFER_REFUSAL_MESSAGE,
} from "@/app/lib/cancel-flow";
import { deleteEvent, loadCancelContext, recordEvent } from "@/app/lib/cancel-flow-server";

// Accepts the retention discount from the cancel flow.
//
// WHAT THIS ROUTE CANNOT DO
// It reads one thing from the request: the reason the teacher picked, for the
// record. Which coupon, which subscription and whether they may have it at all
// are decided here, by offerFor over what Stripe and cancellation_events say.
// A coupon id in the body is ignored. The subscription id comes from the
// caller's own profile.
//
// ORDER OF WORK
//   1. Decide (offerFor). Refuse with the reason if no.
//   2. Claim the row, keyed retention-<user>-<yyyymm>. A double click loses
//      here, before Stripe is touched, and reports what the first click did.
//   3. Make sure the coupon exists, then attach it, with an idempotency key
//      built from the same claim. Inside the 14 days after cancelling, the
//      same update also clears the scheduled cancel: taking the offer then is
//      "turn my plan back on".
//   4. Write the profile through, as /api/stripe/resume does, so the page the
//      teacher lands on already says the right thing. The webhook follows.
// If Stripe fails, the claim is released, so they can try again.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const reason = asCancelReason((body as { reason?: unknown } | null)?.reason) ?? "cost";

  let ctx;
  try {
    ctx = await loadCancelContext(supabase, user.id);
  } catch (err) {
    console.error("[cancel-flow/offer] context", err);
    return NextResponse.json({ error: "Could not check the offer. Please try again." }, { status: 500 });
  }

  const decision = offerFor(ctx.offerInput);
  if (!decision.ok) {
    return NextResponse.json(
      { error: OFFER_REFUSAL_MESSAGE[decision.why], why: decision.why },
      { status: 400 },
    );
  }

  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const dedupeKey = `retention-${user.id}-${month}`;
  const claim = await recordEvent({
    userId: user.id,
    reason,
    outcome: "discount",
    plan: ctx.plan,
    interval: decision.interval,
    couponId: decision.coupon.id,
    dedupeKey,
  }).catch((err) => {
    console.error("[cancel-flow/offer] claim", err);
    return null;
  });
  if (claim === null) {
    return NextResponse.json({ error: "Could not apply the offer. Please try again." }, { status: 500 });
  }
  if (claim === "duplicate") {
    return NextResponse.json({ ok: true, already: true });
  }

  try {
    const couponId = await ensureRetentionCoupon(stripe, decision.interval);

    const params: Stripe.SubscriptionUpdateParams = { discounts: [{ coupon: couponId }] };
    // Taking the held offer after cancelling also un-cancels. Clear whichever
    // representation the subscription uses, and only that one (see resume).
    if (ctx.ending) {
      if (typeof ctx.sub?.cancel_at === "number") params.cancel_at = null;
      else params.cancel_at_period_end = false;
    }

    const sub = await stripe.subscriptions.update(ctx.subscriptionId!, params, {
      idempotencyKey: dedupeKey,
    });

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        cancel_at_period_end:
          Boolean(sub.cancel_at_period_end) ||
          (typeof sub.cancel_at === "number" && sub.cancel_at * 1000 > Date.now()),
        subscription_status: sub.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) console.error("[cancel-flow/offer] profile write-through failed", error);

    return NextResponse.json({ ok: true, interval: decision.interval, resumed: ctx.ending });
  } catch (err) {
    await deleteEvent(claim.id);
    console.error("[cancel-flow/offer]", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : null;
    return NextResponse.json({ error: message ?? "Could not apply the offer." }, { status: 500 });
  }
}
