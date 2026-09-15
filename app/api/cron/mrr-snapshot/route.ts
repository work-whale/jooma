import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { loadTrueMrr } from "@/app/admin/trueMrr";

// Today's MRR, written once a day.
//
// Nothing has ever stored a revenue figure over time: teacher_mrr() computes
// one live and discards it. This captures it so the Stats page can eventually
// draw a line rather than a single number.
//
// WHY DAILY AND NOT MONTHLY
//
// A month-end snapshot captures one instant, so a cancellation on the 31st
// silently rewrites what that month looked like. Daily gives a real curve, and
// a missed run costs one cosmetic gap rather than a whole month. 365 small rows
// a year is nothing.
//
// SETUP THIS DEPENDS ON, all of it easy to get wrong silently:
//   - vercel.json registers it. Crons only register from a PRODUCTION deploy.
//   - CRON_SECRET set in Vercel, production scope. Vercel then sends it as a
//     bearer token automatically.
//   - /api/cron is in PUBLIC_PATHS in proxy.ts. Without that the request 307s to
//     /login and the cron log records a redirect that LOOKS like success.

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

export async function POST(req: NextRequest) {
  // Loud rather than open: a deploy that forgot the secret must fail, not turn
  // this into an unauthenticated endpoint that writes revenue rows.
  if (!process.env.CRON_SECRET) {
    console.error("[cron/mrr] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // List prices and head counts. Always available, no external dependency.
  const { data: mrrRows, error: mrrError } = await supabaseAdmin.rpc("teacher_mrr");
  if (mrrError) {
    console.error("[cron/mrr] teacher_mrr failed", mrrError);
    return NextResponse.json({ error: "Could not read MRR" }, { status: 500 });
  }

  const row = (mrrRows ?? [])[0] as
    | {
        paying_gbp?: number;
        paying_count?: number;
        comped_gbp?: number;
        comped_count?: number;
        ending_gbp?: number;
        ending_count?: number;
        paying_sub_ids?: string[];
      }
    | undefined;

  // What Stripe actually bills, discounts applied. Reuses the dashboard's
  // reader rather than reimplementing discount handling, so the snapshot and
  // the live figure can never disagree about the same day.
  //
  // Never rejects: returns { gbp: null } when Stripe cannot be read, and that
  // null is stored as null. A day Stripe was down is not a day nobody paid, and
  // the column is nullable precisely so the chart can show the difference.
  const trueMrr = await loadTrueMrr(row?.paying_sub_ids ?? []);
  if (trueMrr.error) {
    console.warn("[cron/mrr] Stripe unavailable, storing list price only", trueMrr.error);
  }

  const snapshot = {
    captured_on: new Date().toISOString().slice(0, 10),
    list_gbp: Number(row?.paying_gbp ?? 0),
    billed_gbp: trueMrr.gbp,
    paying_count: Number(row?.paying_count ?? 0),
    comped_gbp: Number(row?.comped_gbp ?? 0),
    comped_count: Number(row?.comped_count ?? 0),
    ending_gbp: Number(row?.ending_gbp ?? 0),
    ending_count: Number(row?.ending_count ?? 0),
  };

  // Upsert on the date: a retry or a second run the same day corrects the row
  // rather than failing on the primary key or doubling the day.
  const { error: writeError } = await supabaseAdmin
    .from("mrr_snapshots")
    .upsert(snapshot, { onConflict: "captured_on" });

  if (writeError) {
    console.error("[cron/mrr] could not write snapshot", writeError);
    return NextResponse.json({ error: "Could not write snapshot" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    captured_on: snapshot.captured_on,
    list_gbp: snapshot.list_gbp,
    billed_gbp: snapshot.billed_gbp,
    stripe: trueMrr.error ? "unavailable" : "ok",
  });
}
