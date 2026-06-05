import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Session-less client for Storage/DB only. A distinct `storageKey` keeps its
// GoTrue instance off the auth client's key (sb-<ref>-auth-token), so the two
// never collide and trigger the "Multiple GoTrueClient instances" warning.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: "jooma-storage-noauth",
  },
});
