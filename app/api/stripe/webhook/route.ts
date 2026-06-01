import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, planForPriceId } from "@/app/lib/stripe";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { DEFAULT_PLAN } from "@/app/lib/plans";

// Stripe → app sync. This is the ONLY place a user's plan is upgraded/downgraded
// from payment state. It runs with the service-role key (no user session) and
// must verify the signature on the raw body, so the request is never trusted
// blindly. This route is exempted from auth in proxy.ts.

// Statuses that should grant the paid plan. Anything else (canceled, unpaid,
// incomplete_expired, past_due…) falls back to Free.
const ACTIVE_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "active",
  "trialing",
]);

function periodEnd(sub: Stripe.Subscription): string | null {
  // `current_period_end` lives on the subscription in older API versions and on
  // each item in newer ones — check both.
  const unix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items.data[0]?.current_period_end ??
    null;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

/** Apply a subscription's current state to the owning profile. */
async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Resolve the profile: prefer the userId we stamped at checkout, else fall
  // back to the customer id we stored on a previous event.
  let userId = sub.metadata?.userId ?? null;
  if (!userId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.id ?? null;
  }
  if (!userId) {
    console.warn("[stripe/webhook] no profile for customer", customerId);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  const paidPlan = planForPriceId(priceId);
  const isActive = ACTIVE_STATUSES.has(sub.status);
  const plan = isActive && paidPlan ? paidPlan : DEFAULT_PLAN;

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      current_period_end: periodEnd(sub),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) console.error("[stripe/webhook] profile update failed", error);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id,
          );
          // Carry the userId from the session in case it wasn't on the sub.
          if (session.client_reference_id && !sub.metadata?.userId) {
            sub.metadata = { ...sub.metadata, userId: session.client_reference_id };
          }
          await syncSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Ignore the many event types we don't act on.
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries — the handler is idempotent (it just writes
    // current state), so a retry is safe.
    console.error("[stripe/webhook] handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
