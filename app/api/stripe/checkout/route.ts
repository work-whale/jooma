import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { stripe, priceIdFor, type BillingInterval } from "@/app/lib/stripe";

// Creates a Stripe Checkout Session for the Pro plan and returns its URL. The
// browser redirects to it; payment success is confirmed asynchronously by the
// webhook (route below), not here — never grant access from this route.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { interval?: BillingInterval };
  const interval: BillingInterval = body.interval === "monthly" ? "monthly" : "yearly";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Reuse the customer we already linked, so a returning subscriber doesn't get
  // a duplicate Stripe customer.
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdFor("pro", interval), quantity: 1 }],
      // Lets the webhook tie the resulting subscription back to our user.
      client_reference_id: user.id,
      subscription_data: { metadata: { userId: user.id } },
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      success_url: `${origin}/account/billing?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
