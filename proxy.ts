import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isGenerationRequest, checkGenerationQuota } from "@/app/lib/generation-guard";

// Routes reachable without a session. Everything else redirects to /login.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/verify",
  "/create-password",
  "/complete-profile",
  "/auth",
  "/terms",
  "/privacy",
  "/pricing",
  // Stripe calls this server-to-server with no session; it verifies its own
  // signature, so it must bypass the auth redirect.
  "/api/stripe/webhook",
];

function isPublic(pathname: string) {
  // The marketing landing page at "/" is public (exact match only — we don't
  // want "/" to prefix-match every other route).
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
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

  // Unauthenticated request to a protected route.
  if (!user && !isPublic(pathname)) {
    // API routes must NOT be redirected to the HTML login page — the caller
    // does res.json() and would choke on "<!DOCTYPE html>". Return a clean
    // 401 JSON instead so the error is legible.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already signed in but sitting on login/signup -> send into the app.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/tools";
    return NextResponse.redirect(url);
  }

  // Enforce the monthly AI-generation cap for free users. Runs only on the tool
  // generation POSTs, and only once we know there's a user. Free users over the
  // limit get a 402 the client turns into an upgrade prompt; paid plans are
  // unlimited (checkGenerationQuota returns null).
  if (user && isGenerationRequest(request.method, pathname)) {
    const quota = await checkGenerationQuota(supabase, user.id);
    if (quota?.blocked) {
      return NextResponse.json(
        {
          error: `You've used all ${quota.limit} of your free generations this month. Upgrade to Pro for unlimited generations.`,
          code: "generation_limit_reached",
          used: quota.used,
          limit: quota.limit,
        },
        { status: 402, headers: { "x-upgrade-required": "1" } },
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next internals, static assets, and image files.
    "/((?!_next/static|_next/image|favicon.ico|svgs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
