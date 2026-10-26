import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe } from "@/app/lib/stripe";
import { asCancelReason } from "@/app/lib/cancel-flow";
import { deleteEvent, loadCancelContext, recordEvent } from "@/app/lib/cancel-flow-server";

// The last step of the cancel flow: "Yes, cancel my plan".
//
// Schedules rather than cancels, exactly as the Stripe portal did before this
// flow replaced it: the teacher keeps their plan to the end of the period (or
// of the free trial) and the webhook writes the locked "no plan" state when
// the subscription finally closes. /api/stripe/resume undoes it.
//
// From the request it reads the reason (allowlisted, and required, since the
// flow cannot reach this step without one) and an optional free-text detail.
// The subscription id comes from the caller's own profile.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { reason?: unknown; detail?: unknown } | null;
  const reason = asCancelReason(body?.reason);
  if (!reason) {
    return NextResponse.json({ error: "Choose a reason first." }, { status: 400 });
  }
  const detail = typeof body?.detail === "string" ? body.detail.trim().slice(0, 2000) || null : null;

  let ctx;
  try {
    ctx = await loadCancelContext(supabase, user.id);
  } catch (err) {
    console.error("[cancel-flow/cancel] context", err);
    return NextResponse.json({ error: "Could not cancel. Please try again." }, { status: 500 });
  }

  if (!ctx.subscriptionId || !ctx.sub) {
    return NextResponse.json({ error: "There's no subscription to cancel." }, { status: 400 });
  }
  // Both refused, as in the portal route: an ending subscription still reports
  // "active", and cancelling it twice is an opaque Stripe error.
  if (ctx.ended || ctx.ending) {
    return NextResponse.json({ error: "This subscription is already cancelled." }, { status: 400 });
  }

  // A double click loses here: both clicks read the same latest cancellation,
  // so they build the same key. That latest cancellation is part of the key so
  // that a teacher who cancels, renews and then cancels again in the same
  // period is not told they already have.
  const periodKey = ctx.periodEnd ? Math.floor(ctx.periodEnd.getTime() / 1000) : "open";
  const previous = ctx.offerInput.cancelledAt ? ctx.offerInput.cancelledAt.getTime() : "first";
  const claim = await recordEvent({
    userId: user.id,
    reason,
    outcome: "cancelled",
    plan: ctx.plan,
    interval: ctx.interval,
    detail,
    dedupeKey: `cancel-${ctx.subscriptionId}-${periodKey}-${previous}`,
  }).catch((err) => {
    console.error("[cancel-flow/cancel] claim", err);
    return null;
  });
  if (claim === null) {
    return NextResponse.json({ error: "Could not cancel. Please try again." }, { status: 500 });
  }
  if (claim === "duplicate") {
    return NextResponse.json({ error: "This subscription is already cancelled." }, { status: 400 });
  }

  try {
    const sub = await stripe.subscriptions.update(ctx.subscriptionId, {
      cancel_at_period_end: true,
    });

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        cancel_at_period_end: true,
        subscription_status: sub.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) console.error("[cancel-flow/cancel] profile write-through failed", error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    await deleteEvent(claim.id);
    console.error("[cancel-flow/cancel]", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : null;
    return NextResponse.json({ error: message ?? "Could not cancel." }, { status: 500 });
  }
}
