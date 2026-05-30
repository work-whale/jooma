import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client for auth. Unlike the shared client in
// `app/lib/supabase.ts` (storage/DB, no session), this persists the session in
// cookies via `@supabase/ssr` so the proxy and server components can read it.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
