import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendBroadcastEmail } from "@/app/lib/email";
import { loadSchoolGroups } from "@/app/lib/school-leads-data";
import { isDigestTime, schoolsDigest } from "@/app/lib/school-groups";

// Jooma 4.5, Phase 3 (spec Step 9): every Monday at 08:00 UK, email the team
// the list of schools with 3 or more Jooma teachers. School names and counts
// only; the full list is at /admin/school-leads.
//
// vercel.json runs this at 07:00 and 08:00 UTC on Mondays; isDigestTime lets
// only the one that is 08:00 in the UK send (GMT in winter, BST in summer).
// An internal email to Jooma, not a teacher, so LIFECYCLE_EMAILS does not
// apply. Goes to SCHOOL_LEADS_TO, else info@jooma.ai.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron/school-leads] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const now = new Date();
  if (!isDigestTime(now)) return NextResponse.json({ sent: false, reason: "Not Monday 08:00 UK" });
  try {
    const groups = await loadSchoolGroups(now);
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jooma.ai";
    const to = process.env.SCHOOL_LEADS_TO || "info@jooma.ai";
    const result = await sendBroadcastEmail(to, schoolsDigest(groups, site, now), {
      purpose: "school_leads",
      oneClickUrl: null,
    });
    return NextResponse.json({ sent: result.status === "sent", schools: groups.length });
  } catch (err) {
    console.error("[cron/school-leads]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
