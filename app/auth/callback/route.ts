import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/app/lib/auth/server";
import { safeNextPath } from "@/app/lib/safe-next";

// OAuth (Google) and email-link callbacks land here. Supabase returns a `code`
// in the query string; we exchange it for a session, then send the user on.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only ever a path on this site. Used straight, `next=@evil.com` became
  // `https://www.jooma.ai@evil.com`, which a browser treats as evil.com.
  const next = safeNextPath(searchParams.get("next"), "/");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // A suspended account fails the exchange with user_banned. Distinguish it,
    // or a banned teacher signing in with Google lands back on the login form
    // with a generic "could not sign you in" and no idea their account was
    // suspended — the password path tells them, so this one has to as well.
    if (error?.code === "user_banned") {
      return NextResponse.redirect(`${origin}/login?error=suspended`);
    }
    if (!error) {
      // A first-time user has no profile row yet, and where they go next
      // depends on how they got here — see the redirect below.
      //
      // Resolve the user robustly: depending on the SDK/flow the freshly
      // exchanged user can sit on `data.user` OR `data.session.user`. Fall back
      // to getUser() so we never skip onboarding just because `data.user` was
      // null — that bug sent brand-new Google users straight to the home page.
      let authUser: User | null = data.user ?? data.session?.user ?? null;
      if (!authUser) {
        const { data: u } = await supabase.auth.getUser();
        authUser = u.user ?? null;
      }
      const userId: string | undefined = authUser?.id;
      // `provider` is the method used for THIS sign-in; `providers` is every
      // method linked to the account. Check both — an account that also has an
      // email identity must still skip the password step when it arrived here
      // through Google.
      const isGoogle =
        authUser?.app_metadata?.provider === "google" ||
        authUser?.app_metadata?.providers?.includes("google") === true;
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, suspended_at")
          .eq("id", userId)
          .maybeSingle();
        if (!profile) {
          // A Google user has already proved who they are. Making them invent a
          // Jooma password adds a credential they will never use — Google is
          // their sign-in method, and the login form points them back to it if
          // they try the password field. Email sign-ups still go via
          // /create-password: that page is where their account is created at
          // all, so it can't be skipped.
          return NextResponse.redirect(
            `${origin}${isGoogle ? "/complete-profile" : "/create-password"}`,
          );
        }
        // Belt and braces alongside the user_banned check above: if a session
        // was somehow issued to a suspended account (a ban applied mid-flow, or
        // a token minted just before it), don't let them through. Costs nothing
        // — this row was already being fetched.
        if (profile.suspended_at) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?error=suspended`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
