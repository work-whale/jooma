import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";

// An ambassador asking to end their agreement early. Records the request only;
// the 30 days' notice and the final payout are handled by a person, who sees
// "Asked to end" against them in the admin console.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase.rpc("request_end_my_ambassador_agreement");
  if (error) {
    console.error("[ambassadors/end-agreement] failed", error);
    return NextResponse.json({ error: "Could not send that request." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
