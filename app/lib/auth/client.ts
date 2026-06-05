import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client for auth. Unlike the shared client in
// `app/lib/supabase.ts` (storage/DB, no session), this persists the session in
// cookies via `@supabase/ssr` so the proxy and server components can read it.
//
// Memoised: every call returns the SAME instance. Creating a fresh
// createBrowserClient per call spawns multiple GoTrueClient instances on the
// same storage key, which Supabase warns can race on token refresh.
function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let browserClient: ReturnType<typeof makeClient> | undefined;

export function createClient() {
  if (!browserClient) browserClient = makeClient();
  return browserClient;
}
