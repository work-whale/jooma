/**
 * Which page requests need a session, read by proxy.ts.
 *
 * Kept apart from the proxy so tests/unit/route-coverage.spec.ts can check the
 * route tree against these lists without loading Supabase.
 *
 * Three answers, not two. A signed-out request for a PUBLIC path goes through.
 * One for a PRIVATE prefix is sent to /login. Anything in neither list is a URL
 * we do not serve, and falls through to Next, which answers it with the 404
 * page. It used to be sent to /login as well, which told Google that every
 * mistyped or deleted URL was a redirect to a working page (a soft 404). The
 * unit test exists so a new private route cannot be forgotten here.
 */

// Routes reachable without a session.
export const PUBLIC_PATHS = [
  "/login",
  "/signup",
  // The maintenance holding page is shown to signed-out visitors too, so it
  // must not bounce to /login — which is itself behind the holding page.
  "/maintenance",
  "/verify",
  "/create-password",
  "/complete-profile",
  // Someone who cannot sign in obviously cannot be asked for a session first.
  // The route behind it carries its own honeypot and two throttles rather than
  // relying on the session it does not have, exactly as /api/enquiries does.
  //
  // Note it is NOT in the signed-in bounce in proxy.ts, unlike /login and
  // /signup: a Google teacher adding a password reaches the same endpoint from
  // /profile while very much signed in.
  "/forgot-password",
  "/api/auth/password-link",
  "/auth",
  "/terms",
  "/privacy",
  // What Jooma is, and the plain English data protection page for schools.
  "/about",
  "/trust",
  "/pricing",
  // A school asking about licences has no account yet, and making them sign up
  // to ask about pricing loses the enquiry. The form posts to /api/enquiries,
  // which must be public for the same reason; it carries its own honeypot and
  // IP throttle rather than relying on the session it does not have.
  "/contact",
  "/api/enquiries",
  // An invited teacher has no account yet, so the invite lookup behind the
  // /signup banner has to work while signed out. It only ever reveals the
  // address a valid token was already emailed to, and grants nothing —
  // /api/invites/accept does the granting, and that one requires a session
  // and checks the address itself.
  "/api/invites/check",
  // The footer link of every bulk email, and the one-click target mail clients
  // POST to from the List-Unsubscribe header. The reader is usually signed out.
  // The route checks a per-recipient token and throttles by IP itself.
  "/unsubscribe",
  "/api/email/unsubscribe",
  // SendGrid's delivery events, server-to-server. The route checks SendGrid's
  // signature itself, the same arrangement as the Stripe webhook below.
  "/api/email/sendgrid-events",
  // /signup remembers the address typed there before a password exists, so
  // the caller has no session by definition. Honeypot and two throttles, as
  // /api/enquiries.
  "/api/signup/lead",
  // Stripe calls this server-to-server with no session; it verifies its own
  // signature, so it must bypass the auth redirect.
  "/api/stripe/webhook",
  // Vercel Cron calls these server-to-server with no session cookie. Without
  // this entry the request 307s to /login and the cron log records a redirect
  // that looks like a successful run, so scheduled account deletions would
  // silently never happen. Each cron route checks CRON_SECRET itself, which is
  // the actual boundary -- the same arrangement as the Stripe webhook above.
  "/api/cron",
  // Google Search Console's ownership proof. Googlebot fetches this signed
  // out, and the proxy matcher excludes images and _next but NOT .html, so
  // without this entry the file 307s to /login and verification fails.
  //
  // Named exactly rather than exempting .html wholesale: a blanket rule would
  // silently unprotect any HTML asset added later. It must stay reachable for
  // as long as the property is verified, not just until it succeeds.
  "/googleeff60eae5378a4ab.html",
  // Same trap as the verification file, and confirmed the same way: both of
  // these 307'd to /login in production. The proxy matcher excludes image
  // extensions and _next, but not .xml or .txt, so every crawler asking for
  // them got the login page instead.
  //
  // This is what Search Console's "Temporary processing error" under Sitemaps
  // actually was. Not a malformed sitemap, and not a stale one: a redirect.
  "/sitemap.xml",
  "/robots.txt",
  // The plain summary for language models (app/llms.txt/route.ts). Same trap
  // again, avoided in advance.
  "/llms.txt",
  // The free tries from the landing hero. /create is the page a signed out
  // visitor makes their deck on, /made/<slug> is a resource a teacher chose to
  // share on the homepage, and /api/try/* are the guest routes. Each of those
  // routes checks the signed guest cookie, the per IP limits and the admin
  // switch itself. /api/try/claim is the exception: it is public here only so
  // a signed out call gets its own clean 401 from the route, which checks for
  // a session before anything else.
  "/create",
  "/made",
  "/api/try",
  // The public page for each tool, and their index. Information only: the
  // tools themselves stay under /tools, behind a session.
  "/teacher-tools",
  // The ambassador programme's landing page, which the short link
  // jooma.ai/ambassador shows to a signed-out visitor (rewritten in proxy.ts).
  // The person may have no account yet; the page sends them to sign up. Old
  // invite links (/ambassador/invite/...) redirect to it. The application
  // itself (/ambassador/apply) is NOT public.
  "/ambassador/join",
  "/ambassador/invite",
];

// Signed-out requests for these go to /login. Every top level segment of the
// route tree that needs a session, including the ones inside app/(app). /api/
// is handled separately: an API caller gets a 401, never a redirect.
//
// Prefix matched, the same as PUBLIC_PATHS, and PUBLIC_PATHS wins: /ambassador
// is here for the dashboard and the application, while /ambassador/join and
// /ambassador/invite stay public above.
export const PRIVATE_PREFIXES = [
  "/account",
  "/admin",
  "/ambassador",
  "/analytics",
  "/announcements",
  "/assistant",
  "/checkout",
  "/colleagues",
  "/dashboard",
  "/editor",
  "/folders",
  "/help",
  "/notifications",
  "/profile",
  // A test fixture and the loading-state test pages. Not linked anywhere, and
  // no reason for a stranger to see either.
  "/sentry-example-page",
  "/test",
  "/timetable",
  "/tools",
  "/welcome",
];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublic(pathname: string) {
  // The marketing landing page at "/" is public (exact match only — we don't
  // want "/" to prefix-match every other route).
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => matches(pathname, p));
}

/** A signed-out request for this is refused: a 401 for the API, /login for a
 *  page. False for a public path, and for a URL nothing serves. */
export function needsSession(pathname: string) {
  if (isPublic(pathname)) return false;
  if (pathname.startsWith("/api/")) return true;
  return PRIVATE_PREFIXES.some((p) => matches(pathname, p));
}
