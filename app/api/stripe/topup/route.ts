import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { stripe, topUpPriceId } from "@/app/lib/stripe";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { effectivePlan } from "@/app/lib/plans";
import { packAllowsPlan, toPack } from "@/app/lib/topup-packs";

// Creates a one-off Stripe Checkout Session for a credit pack and returns its
// URL. Offered when a paid user is running low on their monthly ceiling.
//
// As with the subscription checkout, this route NEVER grants the credit — the
// webhook does, once Stripe confirms payment. Each session is independent, so a
// user may buy as many top-ups in a month as they like.
//
// The pack is optional: an absent packId buys the default (lowest-sort) pack,
// which is exactly what this route did before packs could be chosen.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // An empty body is the normal case for a caller that wants the default pack,
  // so a parse failure is not an error.
  const body = await req.json().catch(() => null);
  const requested = (body as { packId?: unknown } | null)?.packId;
  const packId = typeof requested === "string" && requested ? requested : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, stripe_customer_id, subscription_status, stripe_subscription_id, current_period_end")
    .eq("id", user.id)
    .maybeSingle();

  const plan = effectivePlan(profile);

  // AUTHORISATION, not presentation. `available_to` is invisible to RLS: the
  // read policy on topup_packs is `active or is_admin()` and never looks at the
  // column, so every pack is readable by everyone. Without this check a teacher
  // could name any pack's id and buy one their plan was never offered.
  //
  // Only when a pack was explicitly named — the default pack is whatever the
  // lowest-sort active one is, and refusing to sell it would leave a teacher
  // with no way to top up at all.
  if (packId) {
    const { data: row, error } = await supabaseAdmin
      .from("topup_packs")
      .select("id, name, unit, price_gbp, available_to, sort")
      .eq("id", packId)
      .eq("kind", "credit_gbp")
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("[stripe/topup] pack lookup failed", error);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "That top up is no longer available." }, { status: 400 });
    }
    if (!packAllowsPlan(toPack(row), plan)) {
      return NextResponse.json(
        { error: "That top up isn't available on your plan." },
        { status: 403 },
      );
    }
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;

  try {
    // Resolved from the pack (falling back to the lowest-sort pack, then the
    // env var). Throws rather than charging the wrong price if a named pack has
    // no Stripe price of its own.
    const { priceId, packId: resolvedPackId } = await topUpPriceId(packId);

    // The pack id travels in metadata so the webhook can grant exactly what was
    // bought without a second Stripe round trip: `line_items` is NOT included
    // in a checkout.session.completed payload, so the purchased price is not
    // otherwise knowable there. It also survives promo codes, where the amount
    // paid no longer identifies the pack.
    const metadata = {
      userId: user.id,
      kind: "credit_topup",
      ...(resolvedPackId ? { packId: resolvedPackId } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      // `mode: "payment"` has no subscription_data, so the webhook identifies
      // the buyer from metadata instead. Stamped in both places: the session
      // (read on checkout.session.completed) and the PaymentIntent (so the
      // charge is still attributable if it's ever inspected on its own).
      metadata,
      payment_intent_data: { metadata },
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      success_url: `${origin}/account/billing?topup=success`,
      cancel_url: `${origin}/account/billing?topup=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/topup]", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
