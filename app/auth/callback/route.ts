import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";

// OAuth (Google) and email-link callbacks land here. Supabase returns a `code`
// in the query string; we exchange it for a session, then send the user on.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A first-time Google user has no profile row yet. Route them through
      // the same onboarding as email sign-ups: set a password (so they can
      // also log in with email later), then complete their profile. Returning
      // users already have a profile, so send them straight on.
      //
      // Resolve the user id robustly: depending on the SDK/flow the freshly
      // exchanged user can sit on `data.user` OR `data.session.user`. Fall back
      // to getUser() so we never skip onboarding just because `data.user` was
      // null — that bug sent brand-new Google users straight to the home page.
      let userId: string | undefined = data.user?.id ?? data.session?.user?.id;
      if (!userId) {
        const { data: u } = await supabase.auth.getUser();
        userId = u.user?.id;
      }
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (!profile) {
          return NextResponse.redirect(`${origin}/create-password`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
