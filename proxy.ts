import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  isGenerationRequest,
  isCostBearingRequest,
  isAssistantRequest,
  checkAllGates,
  checkAssistantAccess,
  quotaBlockBody,
  quotaBlockHeaders,
  quotaBlockStatus,
  toolSlugFor,
} from "@/app/lib/generation-guard";
import { isToolEnabled } from "@/app/lib/tool-availability";
import { profileGateBody } from "@/app/lib/profile-gate";
import { publicSettings } from "@/app/lib/settings";
import { applyAttributionCookie } from "@/app/lib/attribution-cookie";
import { SIGNED_IN_HOME, honouredNextPath } from "@/app/lib/safe-next";
import { GUEST_COOKIE, newGuestCookie, verifyGuestCookie } from "@/app/lib/guest-cookie";
import { TRIAL_RUN_HEADER, TRIAL_TOKEN_HEADER, verifyTrialToken } from "@/app/lib/trial-token";
import { clientIp, guestCallAllowed, guestCookieOptions, trialSecret } from "@/app/lib/guest";
import { needsSession } from "@/app/lib/route-access";
import { isIndexable } from "@/app/lib/seo/indexable";

// Reachable while maintenance mode is on. /maintenance itself, obviously, plus
// the auth routes — an admin has to be able to sign in to turn it back off,
// and they can't do that if the login page is behind the holding page.
const MAINTENANCE_ALLOWED = [
  "/maintenance",
  "/login",
  // An admin who has to sign in to turn maintenance off may also have to reset
  // their password to do it. Locking recovery behind the holding page is the
  // same trap as locking /login behind it.
  "/forgot-password",
  "/api/auth",
  "/auth",
  "/admin",
  "/api/admin",
  "/terms",
  "/privacy",
  // Leaving a mailing list is not something to put on hold for an update.
  "/unsubscribe",
  "/api/email/unsubscribe",
  // SendGrid retries for days, but a bounce recorded late is a bounce we kept
  // mailing in the meantime.
  "/api/email/sendgrid-events",
];

// The two internal requests a deck makes over HTTP. A teacher's deck forwards
// the session cookie; a guest deck from /api/try/slideshow has no session and
// sends a short lived token, bound to its run, instead. Valid ONLY here.
const TRIAL_SUBREQUEST_PATHS = ["/api/generate-audio", "/api/find-youtube"];

// The slideshow wizard's helper buttons, which a guest on /create needs to
// finish their inputs: subject suggestion, the outline, vocabulary, a pasted
// YouTube link and an uploaded resource. Plus the picture search in the guest
// editor's Pictures tab (a paid search API, but no model call). Allowed with a
// valid guest cookie and throttled per IP, since each is a call someone could
// script. The editor's model calls are NOT here: in guest mode they open the
// sign up prompt instead (see components/editor/EditorGuest).
const GUEST_HELPER_PATHS = [
  "/api/suggest-subject",
  "/api/generate-lesson-outline",
  "/api/suggest-vocabulary",
  "/api/lookup-youtube",
  "/api/extract-resource",
  "/api/search-web-images",
];
const GUEST_HELPER_PER_HOUR = 40;

/**
 * Whether a request with no session may go through anyway, as part of a
 * guest's free try. Anything this returns false for falls through to the
 * usual redirect or 401.
 */
async function guestMayPass(request: NextRequest, pathname: string): Promise<boolean> {
  const secret = trialSecret();
  if (!secret) return false;

  if (TRIAL_SUBREQUEST_PATHS.includes(pathname)) {
    return verifyTrialToken(
      request.headers.get(TRIAL_TOKEN_HEADER),
      request.headers.get(TRIAL_RUN_HEADER),
      secret,
    );
  }

  if (GUEST_HELPER_PATHS.includes(pathname)) {
    const guest = verifyGuestCookie(request.cookies.get(GUEST_COOKIE)?.value, secret);
    if (!guest) return false;
    return guestCallAllowed(clientIp(request), "guest_helper_ip", GUEST_HELPER_PER_HOUR);
  }

  return false;
}

// Reachable by a signed-in teacher who has not finished onboarding (see the
// profile gate below). Three kinds of thing are here, and each would break in a
// different way without it:
//
//   * /complete-profile and what it calls. The destination of the gate cannot
//     be behind the gate, or it redirects to itself forever; /api/invites/accept
//     is posted to BY that form, before the profile exists.
//   * /auth and /api/auth. The OAuth callback is what creates the session in the
//     first place, and it already routes a profile-less user to
//     /complete-profile itself. Gating it would break sign-in for every new
//     Google teacher.
//   * Server-to-server and crawler paths that have no session to judge, plus
//     /terms and /privacy — someone stuck at the form must still be able to read
//     what they are agreeing to.
const GATE_EXEMPT = [
  "/complete-profile",
  "/api/invites/accept",
  // Posted to BY that form, at the moment the profiles row is created, for the
  // same reason /api/invites/accept is above: the gate would otherwise refuse
  // it with a 403 precisely when it is meant to run. It reports the signup to
  // Meta and stores the advertising cookies, and grants nothing.
  "/api/meta/activation",
  "/auth",
  "/api/auth",
  "/terms",
  "/privacy",
  "/maintenance",
  "/api/stripe/webhook",
  "/api/cron",
  // An incomplete signup is exactly who a signup reminder goes to, and they
  // must be able to opt out without first finishing the profile form.
  "/unsubscribe",
  "/api/email/unsubscribe",
  "/api/email/sendgrid-events",
  "/sitemap.xml",
  "/robots.txt",
  "/llms.txt",
  "/googleeff60eae5378a4ab.html",
];

function isGateExempt(pathname: string) {
  return GATE_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const response = await route(request);
  // Every response from a deployment that is not production, so staging stays
  // out of search results whatever the page's own metadata says. See
  // app/lib/seo/indexable.ts.
  if (!isIndexable()) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

async function route(request: NextRequest) {
  // Start with a passthrough response we can attach refreshed cookies to.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser() — it
  // refreshes the session and rewrites cookies the rest of the app relies on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // The programme's short link, jooma.ai/ambassador, shared in chat. Signed in
  // it is the ambassador's dashboard (or the landing page for anyone else, see
  // app/(app)/ambassador/page.tsx); signed out it shows the landing page with
  // the URL kept short. Exact match only: /ambassador/* stays protected.
  if (!user && pathname === "/ambassador") {
    const url = request.nextUrl.clone();
    url.pathname = "/ambassador/join";
    const rewrite = NextResponse.rewrite(url);
    response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
    return rewrite;
  }

  // Unauthenticated request to a protected route. Which routes those are lives
  // in app/lib/route-access.ts; a URL in neither of its lists falls through to
  // the 404 page rather than to /login.
  if (!user && needsSession(pathname) && !(await guestMayPass(request, pathname))) {
    // API routes must NOT be redirected to the HTML login page — the caller
    // does res.json() and would choke on "<!DOCTYPE html>". Return a clean
    // 401 JSON instead so the error is legible.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Back to where they were going, for the pages /login honours (the
    // ambassador application, reached from the programme's link).
    const back = honouredNextPath(pathname);
    url.search = back ? `?next=${encodeURIComponent(back)}` : url.search;
    return NextResponse.redirect(url);
  }

  // Already signed in but sitting on login/signup -> send into the app, or on
  // to an honoured ?next= (the ambassador application).
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    const next = honouredNextPath(request.nextUrl.searchParams.get("next"));
    url.pathname = next ?? SIGNED_IN_HOME;
    if (next) url.search = "";
    return NextResponse.redirect(url);
  }

  // One profiles read, shared by the maintenance block and the profile gate
  // below. Both want the same row, and this is the hot path of every request, so
  // fetching it twice would double the cost of the cheapest thing here.
  //
  // Deliberately NOT cached. The module caches in tool-availability.ts and
  // settings.ts hold GLOBAL values; this one is per user, and a stale entry
  // would bounce a teacher back to /complete-profile for up to a minute
  // immediately after they submitted it — a loop, right at the moment the gate
  // is supposed to release them.
  //
  // `error` is kept, not discarded: the gate has to tell "no row" apart from
  // "could not read". See app/lib/profile-gate.ts.
  const gateExempt = isGateExempt(pathname);
  const { data: profile, error: profileError } =
    user && !gateExempt
      ? await supabase.from("profiles").select("id, is_admin").eq("id", user.id).maybeSingle()
      : { data: null, error: null };

  // Maintenance mode. Checked here rather than in a layout because a layout
  // would miss the API routes entirely. Most teacher screens now DO share one
  // layout (app/(app)), but /editor, /admin and every /api route sit outside
  // it, so the proxy remains the only place that covers all of them.
  //
  // Fails OPEN: publicSettings() never throws, and any failure reports
  // maintenance as off. A database blip must not be able to invent an outage.
  if (!MAINTENANCE_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const { maintenanceMode } = await publicSettings(supabase);
    if (maintenanceMode) {
      // Admins work through it — that is the whole point of being able to turn
      // it on. Read directly rather than via is_admin() because this is the one
      // place that runs before any admin gate.
      if (!profile?.is_admin) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Jooma is down for maintenance.", code: "maintenance" },
            { status: 503 },
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = "/maintenance";
        return NextResponse.rewrite(url);
      }
    }
  }

  // Finish signing up before using the product.
  //
  // A profiles row is written only by the upsert at the end of
  // /complete-profile, and nothing forces anyone to get there: /auth/callback
  // REDIRECTS a new Google teacher to it, but closing the tab leaves a live
  // session with no profile. That account then generates freely, is coalesced to
  // 'free' by my_generation_gate(), and shows up on no admin screen — which is
  // how info@jooma.ai ran a homework generation two weeks after signing up while
  // being invisible in the console.
  //
  // Here rather than in a layout for the same reason maintenance is: app/(app)
  // is a client layout, and /editor, /admin and every /api route sit outside it.
  // This is the only place that covers all of them, and the only one that runs
  // before RLS gets a say.
  //
  // Fails CLOSED on a clean null and OPEN on a read error — the asymmetry is
  // explained at length in app/lib/profile-gate.ts, and is the opposite of the
  // gates either side of it here, so read that note before changing this.
  if (
    user &&
    !gateExempt &&
    !profileError &&
    !profile &&
    process.env.PROFILE_GATE_DISABLED !== "1"
  ) {
    // 403, and deliberately WITHOUT x-upgrade-required: UpgradeGate keys off
    // 402 + that header, and no amount of money fixes an unfinished signup.
    // Same reasoning as the tool_disabled case below.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(profileGateBody(), { status: 403 });
    }
    // Redirect, not rewrite (maintenance rewrites). The teacher has to actually
    // BE at /complete-profile: the form's router.push("/welcome") on success
    // depends on it, and a rewrite would leave the address bar on /dashboard
    // while showing a signup form.
    const url = request.nextUrl.clone();
    url.pathname = "/complete-profile";
    return NextResponse.redirect(url);
  }

  // Tool availability. An admin turning a tool off in /admin/tools has to
  // actually stop it — before this, tool_settings.enabled was written by the
  // console and read by nothing.
  //
  // Checked here rather than in 35 route handlers so it cannot be forgotten
  // when a tool is added, and so the page path and the API path (the one that
  // spends money) are covered by the same code.
  //
  // Checked BEFORE the plan gates: there is no point spending a gate
  // round-trip on a request that is about to be refused anyway.
  //
  // Fails OPEN, deliberately and for the same reason checkAllGates does — see
  // the note in generation-guard.ts. isToolEnabled never throws; on any error
  // it reports the tool as available.
  //
  // NOTE: 403, and without x-upgrade-required. An unavailable tool is not a
  // quota problem, and UpgradeGate keys off 402 + that header — sending them
  // here would offer an upgrade that fixes nothing.
  if (user) {
    const slug = toolSlugFor(request.method, pathname);
    if (slug && !(await isToolEnabled(supabase, slug))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "This tool is currently unavailable.", code: "tool_disabled" },
          { status: 403 },
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/tools";
      return NextResponse.redirect(url);
    }
  }

  // The assistant is a paid-plan feature. Checked BEFORE the spend gates below
  // because it is an entitlement, not a quota: a Free user is not near a limit,
  // they simply do not have the feature, and no top-up would change that.
  //
  // This is also the only thing standing between a Free account and unlimited
  // assistant use — a chat turn is not a generation (so the count caps never see
  // it) and Free has no spend ceiling (so the cost gate never fires). See the
  // note on checkAssistantAccess.
  //
  // 402 + x-upgrade-required, so the existing UpgradeGate shows the upsell with
  // no new client code.
  if (user && isAssistantRequest(request.method, pathname)) {
    const gate = await checkAssistantAccess(supabase);
    if (gate) {
      return NextResponse.json(quotaBlockBody(gate), {
        status: quotaBlockStatus(gate),
        headers: quotaBlockHeaders(gate),
      });
    }
  }

  // Enforce the plan gates. Two things are checked here (see
  // generation-guard.ts): the Free daily/monthly generation caps, and the paid
  // plans' monthly AI-spend ceiling. The ceiling applies to sub-asset and
  // refinement routes too, which is why the condition is broader than
  // isGenerationRequest alone — otherwise a Pro user at their limit could keep
  // spending through /api/modify.
  //
  // NOTE: /api/generate-slideshow is excluded from this proxy's matcher (see
  // config below) and self-gates inside its route handler instead.
  if (user && isCostBearingRequest(request.method, pathname)) {
    const quota = await checkAllGates(supabase, {
      countsAsGeneration: isGenerationRequest(request.method, pathname),
    });
    if (quota) {
      // Status and headers depend on WHY: 402 + x-upgrade-required for a quota
      // that money fixes, 429 + Retry-After for a rate limit that time fixes.
      return NextResponse.json(quotaBlockBody(quota), {
        status: quotaBlockStatus(quota),
        headers: quotaBlockHeaders(quota),
      });
    }
  }

  // Where this visitor came from, recorded once and never overwritten.
  //
  // Last, and on `response` rather than any earlier object, because the Supabase
  // setAll handler above replaces `response` wholesale whenever it refreshes a
  // session: a cookie set before that point is silently dropped.
  //
  // One call site is enough. Every path that can ORIGINATE an ad click is a
  // signed-out page load that returns here; the redirects above are by
  // definition second visits, and first touch wins would skip them anyway.
  applyAttributionCookie(request, response);

  // A visitor arriving at /create becomes a guest: a random id, signed, that
  // their free tries are kept against until they sign up. Set here because the
  // page is a server component and cannot set cookies itself, and on
  // `response` for the same reason as the attribution cookie above.
  if (!user && pathname === "/create") {
    const secret = trialSecret();
    if (secret && !verifyGuestCookie(request.cookies.get(GUEST_COOKIE)?.value, secret)) {
      const { value } = newGuestCookie(secret);
      response.cookies.set(GUEST_COOKIE, value, guestCookieOptions);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next internals, static assets, and image files.
    // `api/generate-slideshow` is also excluded: the proxy buffers its SSE
    // stream (slides arrive all at once instead of one-by-one), so it bypasses
    // the proxy and authenticates itself inside the route handler.
    // `api/try/slideshow` is the guest version of the same stream, excluded for
    // the same reason; it checks the guest cookie and limits itself.
    "/((?!api/generate-slideshow|api/try/slideshow|_next/static|_next/image|favicon.ico|svgs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
