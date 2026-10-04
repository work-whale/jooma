import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe, priceIdFor, isPaidPlanId } from "@/app/lib/stripe";
import { ADMIN_ASSIGNABLE_PLANS } from "@/app/lib/plans";

// Moves a teacher between plans from the admin console.
//
// Four cases, because a plan is both a row in our DB and (usually) a Stripe
// subscription, and the two must not disagree:
//
//   1. free -> pro, no Stripe customer     COMP. There's no card to charge, so
//                                          this is a deliberate freebie and is
//                                          logged as one.
//   2. free -> pro, has customer           Create a real subscription. The
//                                          WEBHOOK writes profiles.plan.
//   3. pro  -> free, has subscription      Cancel in Stripe. Webhook syncs.
//   4. pro  -> free, comped (no sub)       Direct update; Stripe isn't involved.
//
// In cases 2 and 3 this route deliberately does NOT write profiles.plan: the
// webhook is already the writer for subscription state (syncSubscription in
// app/api/stripe/webhook/route.ts), and a second writer racing it would produce
// a plan that flips back on the next event.

export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const plan = typeof body?.plan === "string" ? body.plan : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const immediate = body?.immediate === true;

  if (!userId || !plan) {
    return NextResponse.json({ error: "userId and plan are required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Please give a reason — it goes in the audit log." }, { status: 400 });
  }
  // Enforced server-side as well as in the dropdown: nobody gets moved onto a
  // retired or unbuilt plan by a crafted request. "free" (no plan) is allowed:
  // it is how an admin takes a plan away.
  if (!ADMIN_ASSIGNABLE_PLANS.some((p) => p.id === plan)) {
    return NextResponse.json({ error: `${plan} isn't a plan we sell.` }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan, stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Could not find that teacher." }, { status: 404 });
  }

  const from = profile.plan ?? "free";
  if (from === plan) {
    return NextResponse.json({ error: `They're already on ${plan}.` }, { status: 400 });
  }

  let method: "comp" | "stripe" | "cancel" | "direct";
  let message: string;

  try {
    if (plan !== "free") {
      // ── Upgrade ──
      if (!profile.stripe_customer_id) {
        // Case 1 — comp.
        //
        // NOTE: this leaves profiles.plan='pro' with no Stripe subscription
        // behind it. That's stable, because no subscription events will ever
        // fire for this user — but if one somehow did, syncSubscription() would
        // reset them to DEFAULT_PLAN (webhook/route.ts:52). Reverting a comp is
        // just another plan change from here.
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            plan,
            subscription_status: "active",
            current_period_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        if (error) throw new Error("Could not update the plan.");
        method = "comp";
        message = `Comped — they're on ${plan} with no card on file and won't be billed.`;
      } else {
        // Case 2 — real subscription. Requires a default payment method on the
        // customer; Stripe rejects it otherwise, which surfaces below.
        //
        // The price MUST follow the requested plan. This once read
        // priceIdFor("pro") unconditionally, so moving a teacher to Max created
        // a subscription on the PRO price: they were billed £7.99 instead of
        // £14.99, and the webhook then resolved that price back to "pro" and
        // quietly undid the admin's change.
        if (!isPaidPlanId(plan)) {
          return NextResponse.json(
            { error: `${plan} isn't sold through Stripe Checkout.` },
            { status: 400 },
          );
        }
        const sub = await stripe.subscriptions.create({
          customer: profile.stripe_customer_id,
          items: [{ price: await priceIdFor(plan) }],
          metadata: { userId, admin_action: "change_plan" },
        });
        method = "stripe";
        message =
          sub.status === "active"
            ? "Subscription created — their plan will update in a moment."
            : `Subscription created with status "${sub.status}".`;
      }
    } else {
      // ── Downgrade ──
      // A subscription id outlives the subscription (it is never cleared), so a
      // comp given after a lapsed subscription still carries a closed one.
      // Cancelling that again would be refused by Stripe; it is case 4.
      if (profile.stripe_subscription_id && profile.subscription_status !== "canceled") {
        // Case 3.
        if (immediate) {
          await stripe.subscriptions.cancel(profile.stripe_subscription_id);
          message = "Subscription cancelled — access ends now.";
        } else {
          await stripe.subscriptions.update(profile.stripe_subscription_id, {
            cancel_at_period_end: true,
          });
          message = "Set to cancel at the end of the current period — they keep access until then.";
        }
        method = "cancel";
      } else {
        // Case 4 — comped or never subscribed.
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            plan: "free",
            subscription_status: null,
            current_period_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        if (error) throw new Error("Could not update the plan.");
        method = "direct";
        message = "Plan removed. They'll need to subscribe to create anything.";
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not change the plan.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await gate.supabase.rpc("admin_log_plan_change", {
    uid: userId,
    p_from: from,
    p_to: plan,
    p_reason: reason,
    p_method: method,
  });

  return NextResponse.json({ ok: true, method, message });
}
