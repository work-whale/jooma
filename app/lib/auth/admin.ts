import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/auth/server";

// Server-side gate for the /admin area. Confirms a session and the is_admin flag
// on the caller's profile; non-admins are bounced to the app. Returns the
// authenticated Supabase client so callers can immediately run admin_* RPCs (each
// of which independently re-checks is_admin() in the database — this is the UX
// gate, not the security boundary).
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!data?.is_admin) redirect("/tools");
  return { supabase, user };
}
