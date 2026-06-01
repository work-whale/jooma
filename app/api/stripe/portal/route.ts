import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { stripe } from "@/app/lib/stripe";

// Opens the Stripe Billing Portal so a subscriber can update their card, view
// invoices, or cancel. Returns the portal URL for the browser to redirect to.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/account/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
