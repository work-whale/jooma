import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  encodeAttribution,
  parseAttribution,
} from "./attribution";

// ── Writing the first touch ──────────────────────────────────────────────────
//
// WHY THE PROXY AND NOT /signup
//
// A Meta ad points at jooma.ai, not jooma.ai/signup. app/page.tsx is a server
// component that ignores searchParams, and its Link to /signup drops the query
// string entirely, so a capture living in the signup page would miss most real
// ad traffic. The proxy runs on every page path including "/", which means the
// label is saved at the moment of the click and the landing page needs no
// changes at all.
//
// FIRST TOUCH WINS is enforced here, by refusing to overwrite an existing
// cookie. Same rule as the ambassador feature's `on conflict (user_id) do
// nothing`, applied one layer earlier.

/** Extensions that reach the proxy but can never be an ad landing. The matcher
 *  in proxy.ts already drops images and _next; these are the stragglers that are
 *  in PUBLIC_PATHS precisely so crawlers can fetch them. */
const NON_PAGE = /\.(xml|txt|json|ico|webmanifest)$/i;

/**
 * Record where this visitor came from, once.
 *
 * Cheap and idempotent: an existing cookie short-circuits before any parsing, so
 * calling this on every request costs one `cookies.has`.
 *
 * MUST BE CALLED ON THE FINAL RESPONSE. The Supabase `setAll` handler in
 * proxy.ts reassigns `response` to a fresh NextResponse whenever it refreshes a
 * session, and a cookie set on the object it replaced is silently discarded.
 */
export function applyAttributionCookie(
  request: NextRequest,
  response: NextResponse,
): void {
  // A POST cannot be a first touch, and an API route is never an ad landing.
  if (request.method !== "GET") return;

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return;
  if (NON_PAGE.test(pathname)) return;

  // First touch wins. Someone who clicked a Facebook ad last week and a
  // newsletter link today is still credited to Facebook.
  if (request.cookies.has(ATTRIBUTION_COOKIE)) return;

  const attribution = parseAttribution(
    request.nextUrl,
    request.headers.get("referer"),
  );

  // Null means there was nothing worth recording: no tag on the link, and either
  // no referrer or one of our own pages. Deliberately distinct from an object of
  // nulls, so an untagged internal navigation does not burn the first touch.
  if (!attribution) return;

  response.cookies.set(ATTRIBUTION_COOKIE, encodeAttribution(attribution), {
    path: "/",
    maxAge: ATTRIBUTION_MAX_AGE,
    // SameSite MUST be lax, not strict.
    //
    // A strict cookie is not returned on the first request following a cross
    // site navigation, and an ad click is exactly that. The value would be
    // written and then not sent back on the next hop, so the feature would
    // appear to work locally (same site) and capture nothing in production.
    sameSite: "lax",
    // Not a credential and it grants nothing, same posture as Meta's own _fbp.
    // Readable by JS so the activation route can accept it as a body fallback
    // and so a test can assert it without reaching into the browser context.
    httpOnly: false,
    // Gated on the environment because Playwright drives http://localhost, and
    // an unconditional secure flag would make the cookie invisible to the suite.
    secure: process.env.NODE_ENV === "production",
  });
}
