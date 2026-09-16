import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { shouldSendStartTrial, type ActivationOutcome } from "@/app/lib/meta-events";
import { sendStartTrialEvent } from "@/app/lib/meta-capi";
import { ATTRIBUTION_COOKIE, decodeAttribution } from "@/app/lib/attribution";

// Records where a signup came from, and reports a Free plan activation to Meta.
//
// Two kinds of attribution land here, and they answer different questions:
//
//   * _fbp and _fbc, which let META match a purchase weeks later back to the ad
//     that produced it. Meta's optimiser is the consumer.
//   * utm_source and the referring host, which let US answer "did the marketing
//     work" on /admin/stats, across every channel rather than one. Written by
//     proxy.ts into a 30 day cookie at the moment of the click, and copied onto
//     the profile here.
//
// WHY THIS EXISTS AT ALL, GIVEN THE BROWSER ALREADY FIRES StartTrial
//
// Two jobs, and neither can be done in the browser alone.
//
// 1. RELIABILITY. StartTrial is the denominator of the Free to Paid rate the
//    agency reports on. Ad blockers eat a meaningful share of requests to
//    connect.facebook.net, and every one they eat makes the conversion rate
//    look better than it is. A server send is not blockable.
//
// 2. PERSISTENCE. _fbp and _fbc live in the browser and are gone by the time a
//    purchase is confirmed: that happens in a Stripe webhook with no browser
//    attached (see app/api/stripe/webhook/route.ts). They are captured here,
//    stored on the profile, and replayed from there. Without this step the only
//    identifier available at purchase is a hashed email, which loses the click
//    attribution entirely.
//
// IDENTITY IS READ FROM THE SESSION, NEVER FROM THE BODY. The body carries only
// the cookies and the resulting plan; a user id or an email taken from a POST
// body would let anyone attribute a signup to somebody else.
//
// NEVER FAILS THE CALLER. Returns { ok: true } whatever happens, because the
// caller is a fire-and-forget fetch from /complete-profile that is about to
// navigate away. There is nothing it could usefully do with an error, and an
// unhandled rejection in that handler would surface as a console error on a
// signup that actually worked.
//
// This route is exempt from the profile gate in proxy.ts. It has to be: it is
// called at the exact moment the profiles row is being created, which is when
// that gate is still refusing /api/ requests.

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // No session means no activation to report. Not an error worth surfacing:
    // the client has already navigated on.
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const body = await req.json().catch(() => null);
    const fbp = typeof body?.fbp === "string" ? body.fbp : null;
    const fbc = typeof body?.fbc === "string" ? body.fbc : null;
    const outcome = body?.outcome as ActivationOutcome | undefined;

    // WHERE THEY CAME FROM, read from the COOKIE rather than the body.
    //
    // The body would be forgeable: any signed-in teacher could POST
    // {utm_source: "meta"} and credit a campaign for their own signup, which is
    // the exact forgery the guard triggers exist to prevent. A cookie is not
    // unforgeable either, but it keeps this route's stated rule intact, that
    // identity and attribution both come from the request rather than its body.
    //
    // The body is accepted only as a fallback, normalised through the same
    // decoder so the two paths cannot diverge.
    const attribution =
      decodeAttribution(req.cookies.get(ATTRIBUTION_COOKIE)?.value) ??
      decodeAttribution(typeof body?.attr === "string" ? body.attr : null);

    // Store all of it regardless of whether this particular signup reports a
    // trial. An admin-invited teacher on Pro sends no StartTrial, but they may
    // still have arrived from an ad, and their renewal months from now is a
    // Purchase we would want attributed.
    //
    // Service role: these columns are deliberately not self-writable, so that a
    // teacher cannot attach their signup to somebody else's ad click. See
    // 20260916000000_meta_attribution_cookies.sql and 20260916000100.
    const patch: Record<string, string | null> = {};
    if (fbp || fbc) {
      patch.meta_fbp = fbp;
      patch.meta_fbc = fbc;
    }
    if (attribution) {
      patch.utm_source = attribution.s;
      patch.utm_medium = attribution.m;
      patch.utm_campaign = attribution.c;
      patch.referrer_host = attribution.r;
      patch.attributed_at = attribution.t;
    }

    // Unconditional rather than filtered on "only if currently null": the cookie
    // is never cleared, so a retry after a dropped connection writes the same
    // values. First touch is already guaranteed one layer up, in proxy.ts, which
    // refuses to overwrite an existing cookie.
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(patch)
        .eq("id", user.id);
      if (error) {
        // Costs attribution on a later purchase and a row on the Stats panel,
        // nothing else. The account is created and the teacher is already inside
        // the product.
        console.error("[meta-activation] could not store signup attribution", error);
      }
    }

    // An invited teacher who landed on a paid plan never started a free trial.
    // The predicate is shared with the browser so the two cannot disagree.
    if (!outcome || !shouldSendStartTrial(outcome)) {
      return NextResponse.json({ ok: true });
    }

    // Awaited, even though the client has already navigated away: a promise left
    // dangling in a serverless invocation can be torn down before it settles,
    // which would lose the event and its error log with it.
    //
    // The IP and user agent are captured here because this is the only place in
    // the whole flow that HAS them. The Stripe webhook that reports the later
    // Purchase sees Stripe's IP, not the teacher's, and faking one there would
    // corrupt the match rather than improve it.
    await sendStartTrialEvent({
      userId: user.id,
      email: user.email ?? null,
      fbp,
      fbc,
      clientIpAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      clientUserAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Same posture as the module it calls: a marketing pixel must never be able
    // to make a successful signup look broken.
    console.error("[meta-activation] unexpected failure", err);
    return NextResponse.json({ ok: true });
  }
}
