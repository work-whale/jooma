// Remember an address typed at /signup, before a password (and so an account)
// exists. Someone who leaves at that point used to leave no trace; this is what
// lets the signup reminders reach them. Signup reminders only: they never
// became customers, so nothing else is sent to a lead (email_audience_members).
//
// Public by definition, so it has the same three brakes as /api/enquiries:
//
//   1. A honeypot (`website`), answered with the same 200 as a real request.
//   2. A per-IP throttle here, through auth_rate under its own kind.
//   3. A per-address throttle inside record_signup_lead().
//
// The answer is always the same 200, whatever happened, so this cannot be used
// to ask whether an address has an account. The page never waits for it.
//
// The write goes through record_signup_lead(), a definer function granted to
// anon, never a table insert: signup_leads has no policies and must not get any.
import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { clientIp } from "@/app/lib/guest";

export const dynamic = "force-dynamic";

/** Per IP per hour. A school's staff can share one address and all sign up in
 *  the same training session; the per-address cap is the tighter brake. */
const IP_LIMIT = 20;

const OK = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; optOut?: unknown; website?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });

  if (typeof body.website === "string" && body.website.trim() !== "") return OK();

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) return OK();

  const ip = clientIp(req);
  if (ip !== "unknown") {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from("auth_rate")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_ip")
      .eq("identifier", ip)
      .gt("created_at", since);
    // Fails closed, unlike unsubscribe: nothing is lost by not remembering a
    // lead, and an outage is no time to accept unthrottled public writes.
    if (error || (count ?? 0) >= IP_LIMIT) return OK();
    await supabaseAdmin.from("auth_rate").insert({ kind: "lead_ip", identifier: ip });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_signup_lead", {
    p_email: email,
    p_opt_out: body.optOut === true,
  });
  if (error) console.error("[signup/lead] record failed", error);
  return OK();
}
