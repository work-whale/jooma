// Service-role Supabase client. Bypasses RLS, so it must NEVER be imported into
// client code or a route that echoes its results unfiltered. Used only by the
// Stripe webhook, which has no user session yet must update `profiles`.
import "server-only";
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
