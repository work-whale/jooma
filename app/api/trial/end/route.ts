import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

// "Switch to Free now" on the trial version of P3 (spec Step 3, rule 4): ends
// the Pro trial at once. Only the end date moves, through the service role.
// The move itself (plan free, a fresh 50, trial_ended and moved_to_free
// logged) is my_resources(), called here in the teacher's own session exactly
// as it is after 23:59 on day 10. Only the caller's own running trial.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", user.id)
    .eq("plan", "pro_trial")
    .gt("trial_ends_at", nowIso)
    .select("id");
  if (error) {
    console.error("[trial/end]", error);
    return NextResponse.json({ error: "Could not switch to Free." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "No trial is running." }, { status: 409 });
  }

  const { error: rollError } = await supabase.rpc("my_resources");
  if (rollError) console.warn("[trial/end] my_resources", rollError.message);
  return NextResponse.json({ ok: true });
}
