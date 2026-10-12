import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

// Ends an ambassador's free Pro once their twelve months are up. Daily.
//
// The free year is a comp (see app/api/admin/ambassadors/grant-pro): plan
// 'pro' with no Stripe subscription, and an end date on the ambassador row.
// Nothing else would ever take it off, so this does, for every ambassador
// whose pro_until has passed AND whose plan is still that comp.
//
// An ambassador who subscribed in the meantime has a Stripe subscription id,
// and Stripe owns their plan from then on (their checkout billed from the day
// the free year ended). They are skipped, by the same test teacher_mrr() uses
// to tell a comp from a payer.
//
// Idempotent: a second run the same day finds nothing left to end.
//
// SETUP, as for the other crons (see mrr-snapshot):
//   - registered in vercel.json; crons only register from a PRODUCTION deploy.
//   - CRON_SECRET set in Vercel, production scope.
//   - /api/cron is in PUBLIC_PATHS in proxy.ts.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  // Loud rather than open: a deploy that forgot the secret must fail, not turn
  // this into an unauthenticated endpoint that removes plans.
  if (!process.env.CRON_SECRET) {
    console.error("[cron/ambassador-terms] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("ambassadors")
    .select("id, user_id")
    .not("user_id", "is", null)
    .not("pro_until", "is", null)
    .lt("pro_until", now);
  if (error) {
    console.error("[cron/ambassador-terms] could not read ambassadors", error);
    return NextResponse.json({ error: "Could not read ambassadors" }, { status: 500 });
  }

  const userIds = [...new Set((due ?? []).map((a) => a.user_id as string))];
  if (userIds.length === 0) return NextResponse.json({ ok: true, ended: 0 });

  // The guard lives in the WHERE, not in a read beforehand, so a subscription
  // that lands between the two cannot be overwritten.
  const { data: ended, error: endError } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: null,
      cancel_at_period_end: false,
      current_period_end: null,
      updated_at: now,
    })
    .in("id", userIds)
    .eq("plan", "pro")
    .is("stripe_subscription_id", null)
    .select("id");
  if (endError) {
    console.error("[cron/ambassador-terms] could not end terms", endError);
    return NextResponse.json({ error: "Could not end terms" }, { status: 500 });
  }

  // The admin audit log (admin_log) needs an admin session, which a cron does
  // not have, so the record of what ended is the function log. pro_until on
  // the ambassador row already says when, for the admin table.
  const endedIds = (ended ?? []).map((row) => row.id);
  if (endedIds.length > 0) {
    console.info("[cron/ambassador-terms] ended free Pro for", endedIds);
  }

  return NextResponse.json({ ok: true, ended: endedIds.length });
}

// Vercel Cron sends GET. POST is kept for a manual run with the same secret,
// matching the other cron routes.
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
