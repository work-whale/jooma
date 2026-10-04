import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe, priceIdFor, isPaidPlanId } from "@/app/lib/stripe";
import { trialDaysFor } from "@/app/lib/trial";

// Creates a Stripe Checkout Session for a paid plan and returns its URL. The
// browser redirects to it; payment success is confirmed asynchronously by the
// webhook, not here — never grant access from this route.
//
// There are three things to buy: Standard, Pro and Max, all monthly, and each
// starts with a free trial for a teacher who has never subscribed (see
// lib/trial.ts). The requested plan is checked against that allowlist rather
// than trusted, so a crafted body cannot name an arbitrary plan (or a price)
// and cannot reach `school`, which has no working billing. An absent or
// unrecognised plan falls back to Pro, keeping every existing caller, which
// sends no body at all, working unchanged.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Existing callers POST with no body at all, so an unparseable body is the
  // normal case, not an error.
  const body = await req.json().catch(() => null);
  const requested = (body as { plan?: unknown } | null)?.plan;
  const plan = isPaidPlanId(requested) ? requested : "pro";
  // Where the teacher started from. Only "welcome" is recognised: onboarding
  // sends them on into the product afterwards, and back to the plan choice if
  // they leave Stripe. Anything else keeps the billing page round trip.
  const fromWelcome = (body as { from?: unknown } | null)?.from === "welcome";

  // Reuse the customer we already linked, so a returning subscriber doesn't get
  // a duplicate Stripe customer.
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;

  // An ambassador code this teacher has already claimed.
  //
  // Resolved from THEIR OWN referral row, never from the request body: a code
  // named in the body would be an open discount anyone could apply by editing a
  // fetch. `first_paid_at is null` is what makes it once-only — the offer is a
  // first-month discount, so a returning subscriber does not get it again.
  //
  // Service role, because ambassador_referrals is admin-only by design and a
  // teacher has no read policy on it. Safe here: the row is fetched by the
  // authenticated user's own id, so this can only ever find their own referral.
  const { data: referral } = await supabaseAdmin
    .from("ambassador_referrals")
    .select("id, first_paid_at, ambassador_codes ( promotion_code_id )")
    .eq("user_id", user.id)
    .is("first_paid_at", null)
    .maybeSingle();

  const promotionCodeId =
    (referral?.ambassador_codes as unknown as { promotion_code_id?: string } | null)
      ?.promotion_code_id ?? null;

  try {
    // Resolved from plan_config (falling back to the env var), so a price
    // changed in the admin console takes effect on the next checkout without a
    // redeploy.
    const priceId = await priceIdFor(plan);

    // The free trial, for a first subscription only. The card is still taken
    // now (payment_method_collection "always"), and if it is somehow missing
    // when the trial ends the subscription cancels rather than sitting unpaid.
    const trialDays = trialDaysFor(profile);
    const trial =
      trialDays > 0
        ? {
            trial_period_days: trialDays,
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" as const },
            },
          }
        : {};

    // Everything except how the discount is handled, which is the one thing
    // that differs between the two attempts below.
    const base = {
      mode: "subscription" as const,
      line_items: [{ price: priceId, quantity: 1 }],
      // Lets the webhook tie the resulting subscription back to our user.
      client_reference_id: user.id,
      payment_method_collection: "always" as const,
      subscription_data: {
        ...trial,
        metadata: {
          userId: user.id,
          // Carried onto the subscription so attribution survives even if the
          // referral row is ever lost, and so it is visible in the Stripe
          // dashboard beside the charge it discounted.
          ...(promotionCodeId ? { ambassadorCode: promotionCodeId } : {}),
        },
      },
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      // Every successful return goes through /checkout/complete, which fires
      // the browser StartTrial pixel when this checkout started a trial and
      // then forwards to /tools (onboarding) or the billing page. Stripe fills
      // in {CHECKOUT_SESSION_ID} itself; it must stay literal, unencoded.
      success_url:
        `${origin}/checkout/complete?session_id={CHECKOUT_SESSION_ID}` +
        (fromWelcome ? "&from=welcome" : ""),
      cancel_url: fromWelcome
        ? `${origin}/welcome?checkout=cancelled`
        : `${origin}/pricing?checkout=cancelled`,
    };

    // `discounts` and `allow_promotion_codes` are MUTUALLY EXCLUSIVE in Stripe —
    // sending both is an API error, and a Checkout Session accepts at most one
    // coupon or promotion code. So a teacher with a claimed code gets it applied
    // for them (no code box, nothing to retype); everyone else keeps the box
    // exactly as before.
    if (!promotionCodeId) {
      const session = await stripe.checkout.sessions.create({
        ...base,
        allow_promotion_codes: true,
      });
      return NextResponse.json({ url: session.url });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        ...base,
        discounts: [{ promotion_code: promotionCodeId }],
      });
      return NextResponse.json({ url: session.url });
    } catch (discountErr) {
      // THE DELAYED SUBSCRIBER.
      //
      // A teacher can claim a code, leave without subscribing, and come back weeks later — by
      // which time the code may have expired, hit its redemption cap, or been
      // deactivated. Stripe re-validates at this moment, so that throws here.
      //
      // Failing would block a sale at the exact moment someone is trying to pay
      // us, over a discount. So fall back to an ordinary checkout with the code
      // box restored, and let them subscribe at full price.
      //
      // The referral row is deliberately NOT deleted: the ambassador still
      // brought this teacher in and is still owed on their first payment. Only
      // the discount went stale, and the two are separate concerns.
      const reason =
        discountErr instanceof Error ? discountErr.message : "Stripe refused the code";
      console.warn("[stripe/checkout] ambassador code rejected, continuing at full price", reason);

      if (referral?.id) {
        await supabaseAdmin
          .from("ambassador_referrals")
          .update({ discount_failed_reason: reason.slice(0, 200) })
          .eq("id", referral.id);
      }

      const session = await stripe.checkout.sessions.create({
        ...base,
        allow_promotion_codes: true,
      });
      return NextResponse.json({ url: session.url });
    }
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
