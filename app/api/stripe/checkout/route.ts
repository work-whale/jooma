import { NextRequest, NextResponse } from "next/server";
import { discountsForInterval } from "@/app/lib/ambassador-discount";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { stripe, priceIdFor, isPaidPlanId } from "@/app/lib/stripe";
import { isBillingInterval } from "@/app/lib/plans";

// Creates a Stripe Checkout Session for a paid plan and returns its URL. The
// browser redirects to it; payment success is confirmed asynchronously by the
// webhook, not here — never grant access from this route.
//
// There are three things to buy: Standard, Pro and Max, each monthly or yearly.
// Paying starts the subscription today: the free trial is what they had before
// this (app/api/trial/start), and it carries no card. The requested plan is checked against that allowlist rather
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
  // Monthly unless yearly is asked for by name. Allowlisted like the plan, and
  // defaulting to monthly keeps every caller that predates yearly billing
  // charging exactly what it did.
  const requestedInterval = (body as { interval?: unknown } | null)?.interval;
  const interval = isBillingInterval(requestedInterval) ? requestedInterval : "month";
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
    .select("id, first_paid_at, ambassador_codes ( promotion_code_id, yearly_coupon_id )")
    .eq("user_id", user.id)
    .is("first_paid_at", null)
    .maybeSingle();

  // THE RIGHT COUPON FOR THE INTERVAL. Ambassador coupons are duration "once",
  // which discounts the first INVOICE. On a monthly plan that is the first
  // month, as advertised. A yearly plan is billed once a year, so the code's
  // own coupon would take the first-month offer off the whole year; a yearly
  // checkout uses the code's hidden yearly coupon instead, worth the same as
  // one discounted month (app/lib/ambassador-discount.ts). A code made before
  // yearly coupons existed applies nothing on yearly, as before.
  const codeIds = referral?.ambassador_codes as unknown as {
    promotion_code_id?: string;
    yearly_coupon_id?: string | null;
  } | null;
  const ambassadorDiscounts = codeIds?.promotion_code_id
    ? discountsForInterval(interval, {
        promotionCodeId: codeIds.promotion_code_id,
        yearlyCouponId: codeIds.yearly_coupon_id ?? null,
      })
    : "";
  const promotionCodeId = ambassadorDiscounts ? (codeIds?.promotion_code_id ?? null) : null;

  // An ambassador part way through their free year of Pro.
  //
  // Subscribing now must not cut that year short or charge for time they were
  // promised free, so the subscription opens with a trial that ends on the day
  // the free Pro does, and the first charge lands then. This is the only checkout
  // that does not charge today. Stripe wants trial_end at least 48 hours out, so
  // a term that is nearly over simply takes the ordinary path.
  //
  // Service role, like the referral above: the ambassadors table is admin-only.
  // Scoped by the caller's own id. An error (no migration yet) reads as none.
  const { data: ambassador } = await supabaseAdmin
    .from("ambassadors")
    .select("pro_until")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const proUntil = ambassador?.pro_until ? new Date(ambassador.pro_until) : null;
  const ambassadorTrialEnd =
    proUntil && proUntil.getTime() - Date.now() > 48 * 60 * 60 * 1000
      ? Math.floor(proUntil.getTime() / 1000)
      : null;

  try {
    // Resolved from plan_config (falling back to the env var), so a price
    // changed in the admin console takes effect on the next checkout without a
    // redeploy.
    const priceId = await priceIdFor(plan, interval);

    // Only an ambassador's free year delays the first charge. If the card is
    // somehow missing when it ends, the subscription cancels rather than
    // sitting unpaid.
    const trial = ambassadorTrialEnd
      ? {
          trial_end: ambassadorTrialEnd,
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
      // Said on the page they pay on, since someone arriving from a free trial
      // may still be expecting more free days.
      ...(ambassadorTrialEnd
        ? {}
        : {
            custom_text: {
              submit: {
                message:
                  "Your subscription starts today and you will be charged now. If you are on a free trial, this ends it.",
              },
            },
          }),
      subscription_data: {
        ...trial,
        metadata: {
          userId: user.id,
          billingInterval: interval,
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
    //
    // EXCEPT ON YEARLY. An ambassador code typed into Stripe's box brings its
    // first-month coupon, which would come off the whole first year, and with
    // the charge taken at once the webhook has no trial in which to swap it (see
    // reconcileAmbassadorDiscount). Codes claimed in Jooma get the right coupon.
    const promoBox = interval === "month";

    if (!ambassadorDiscounts) {
      const session = await stripe.checkout.sessions.create({
        ...base,
        allow_promotion_codes: promoBox,
      });
      return NextResponse.json({ url: session.url });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        ...base,
        discounts: ambassadorDiscounts || undefined,
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
        allow_promotion_codes: promoBox,
      });
      return NextResponse.json({ url: session.url });
    }
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
