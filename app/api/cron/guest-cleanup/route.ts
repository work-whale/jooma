import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { trialRetentionCutoff, TRIAL_RETENTION_DAYS } from "@/app/lib/trial-retention";
import { planTrialCleanup } from "@/app/lib/trial-cleanup";
import { sweepablePaths } from "@/app/lib/storageSweep";

// Reclaims the pictures in guests' free tries once they are past keeping.
//
// WHY
//
// A visitor's deck from /create stores its pictures in the `images` bucket and
// waits in trial_generations for them to sign up. Most never do. In Nov 2026
// 270 unclaimed tries on production held 378 MB, over a third of the free
// plan's 1 GB, and nothing ever removed them.
//
// WHAT IT DOES
//
// For every try older than TRIAL_RETENTION_DAYS that still has an output:
//   1. read the output and collect the Storage files it names;
//   2. set output to null. The ROW stays: the admin funnel, the daily cap and
//      the per IP limit all count rows, and nulling output is what takes the try
//      off "Your creations" and out of claimGuestWork;
//   3. ask storage_paths_in_use() which of those files anything else still uses
//      (a teacher's deck, the image library, a newer guest try; uploads are
//      content addressed, so sharing is normal) and remove only the rest.
// Claimed tries are cleared too: their deck was copied into the teacher's
// presentations row, which owns the pictures from then on.
//
// Order matters as in /api/resources/delete: the rows are the only index of
// their files, so they are read before they are cleared.
//
// SETUP: registered in vercel.json (crons only register from a production
// deploy), CRON_SECRET in Vercel production, /api/cron in PUBLIC_PATHS.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Rows per page. A deck's output can be several hundred kB. */
const PAGE = 20;

/** Upper bound per run, so a backlog drains over a few nights rather than
 *  running into maxDuration part way through. */
const MAX_ROWS = 400;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(): Promise<{ cleared: number; candidates: number; removed: number; kept: number; errors: number }> {
  const cutoff = trialRetentionCutoff().toISOString();
  let cleared = 0;
  let candidates = 0;
  let removed = 0;
  let kept = 0;
  let errors = 0;

  while (cleared < MAX_ROWS) {
    // Always the first page: every processed row drops out of the filter.
    const { data: rows, error } = await supabaseAdmin
      .from("trial_generations")
      .select("id, output")
      .lte("created_at", cutoff)
      .not("output", "is", null)
      .order("created_at", { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(`Could not read expired tries: ${error.message}`);
    if (!rows || rows.length === 0) break;

    const plan = planTrialCleanup(rows as { id: string; output: unknown }[]);

    // 2. Clear first, so this batch's own rows no longer count as references.
    //    The created_at bound is repeated so a row can never be cleared early.
    const { error: clearErr } = await supabaseAdmin
      .from("trial_generations")
      .update({ output: null })
      .in("id", plan.ids)
      .lte("created_at", cutoff);
    if (clearErr) throw new Error(`Could not clear expired tries: ${clearErr.message}`);
    cleared += plan.ids.length;
    candidates += plan.refs.length;

    if (plan.refs.length === 0) continue;

    // 3. Keep anything still used elsewhere. A failed check removes nothing:
    //    the files leak, which the compaction script's orphan pass can reclaim.
    const { data: live, error: checkErr } = await supabaseAdmin.rpc("storage_paths_in_use", {
      p_paths: plan.refs.map((r) => r.path),
    });
    const inUse = checkErr ? null : new Set(((live ?? []) as { path: string }[]).map((r) => r.path));
    if (checkErr) {
      errors++;
      console.error("[cron/guest-cleanup] reference check failed, keeping files", checkErr);
    }

    const byBucket = sweepablePaths(plan.refs, inUse);
    let thisBatch = 0;
    for (const [bucket, paths] of byBucket) {
      const { error: rmErr } = await supabaseAdmin.storage.from(bucket).remove(paths);
      if (rmErr) {
        errors++;
        console.error("[cron/guest-cleanup] storage remove failed", bucket, paths.length, rmErr);
        continue;
      }
      thisBatch += paths.length;
    }
    removed += thisBatch;
    kept += plan.refs.length - thisBatch;
  }

  return { cleared, candidates, removed, kept, errors };
}

async function handle(req: NextRequest) {
  // Loud rather than open: a missing secret must fail, not expose the endpoint.
  if (!process.env.CRON_SECRET) {
    console.error("[cron/guest-cleanup] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await run();
    console.log("[cron/guest-cleanup]", { retentionDays: TRIAL_RETENTION_DAYS, ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/guest-cleanup] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// Vercel Cron sends GET; POST for a manual run with the same bearer token.
export const GET = handle;
export const POST = handle;
