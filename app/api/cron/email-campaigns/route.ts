import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDue } from "@/app/lib/email-campaigns";

// The automatic signup reminders, once a day at midnight UTC (midnight in the
// UK in winter, 1am in summer). That is all it does: every other bulk email is
// sent by hand from /admin/emails, and a manual send interrupted by a closed
// tab is resumed from History, not here.
//
// SETUP THIS DEPENDS ON, the same as /api/cron/process-deletions:
//   - vercel.json registers it. Crons only register from a PRODUCTION deploy.
//     Daily is within the Hobby plan's limit.
//   - CRON_SECRET set in Vercel, production scope.
//   - /api/cron is in PUBLIC_PATHS in proxy.ts.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Stop starting new batches after this, leaving headroom under maxDuration.
 *  A reminder cohort bigger than one run can send finishes the next night. */
const BUDGET_MS = 240_000;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so check that first.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // Loud rather than open: a deploy that forgot the secret must fail, not turn
  // this into an unauthenticated endpoint that mails every teacher.
  if (!process.env.CRON_SECRET) {
    console.error("[cron/email-campaigns] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runDue(BUDGET_MS);
  return NextResponse.json(summary);
}

// Vercel Cron issues GETs. Same work, same auth.
export async function GET(req: NextRequest) {
  return POST(req);
}
