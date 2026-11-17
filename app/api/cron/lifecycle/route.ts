import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { sendBroadcastEmail } from "@/app/lib/email";
import { dueEmails, sendingEnabled, type LifecycleTeacher } from "@/app/lib/lifecycle";
import { renderLifecycleEmail, type LifecycleVars } from "@/app/lib/lifecycle-emails";
import { planInForce, trialDateLong } from "@/app/lib/account-plan";
import { MINUTES_SAVED_PER_BAND } from "@/app/lib/plan-config";

// Jooma 4.5 lifecycle emails (spec Step 6), Phase 1 scheduled ones: E1, E5,
// E6, E7, E8. Meant to run every 15 minutes; the rules are in lib/lifecycle.ts.
//
// SAFE BY DEFAULT. Unless LIFECYCLE_EMAILS=on, this is a dry run: it works out
// who is due and returns the count, and sends and records nothing. The owner
// turns it on after approving the wording.
//
// NOT SCHEDULED YET: a 15 minute cron needs Vercel Pro (Hobby allows daily
// crons only, and a sub-daily entry in vercel.json fails the deploy). Add
//   { "path": "/api/cron/lifecycle", "schedule": "*/15 * * * *" }
// to vercel.json once the plan is confirmed.
//
// Needs migration 20261118000000_plans_engine.sql (lifecycle_email_log and
// the 4.5 profile columns).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const PAGE = 500;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Row {
  id: string;
  first_name: string | null;
  plan: string | null;
  created_at: string;
  trial_ends_at: string | null;
  free_trial_started_at: string | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  marketing_consent: boolean | null;
  sunday_emails: boolean | null;
}

function html(subject: string, body: string, button: string, url: string, footerUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1D1730;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:22px">${esc(subject)}</h1><p style="font-size:16px;line-height:1.5">${esc(body)}</p>
<p><a href="${url}" style="display:inline-block;background:#1E1138;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none">${esc(button)}</a></p>
<p style="font-size:12px;color:#8E87A4"><a href="${footerUrl}" style="color:#8E87A4">Email settings</a></p></body></html>`;
}

async function run(): Promise<{ enabled: boolean; due: number; sent: number; failed: number }> {
  const enabled = sendingEnabled(process.env);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jooma.ai";
  const started = Date.now();
  const now = new Date();
  let due = 0;
  let sent = 0;
  let failed = 0;

  for (let from = 0; Date.now() - started < BUDGET_MS; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, first_name, plan, created_at, trial_ends_at, free_trial_started_at, subscription_status, stripe_subscription_id, current_period_end, marketing_consent, sunday_emails",
      )
      .in("plan", ["pro_trial", "free"])
      .is("suspended_at", null)
      .is("deletion_scheduled_for", null)
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { data: log } = await supabaseAdmin.from("lifecycle_email_log").select("user_id, key").in("user_id", ids);
    const sentKeys = new Map<string, Set<string>>();
    for (const l of log ?? []) {
      if (!sentKeys.has(l.user_id)) sentKeys.set(l.user_id, new Set());
      sentKeys.get(l.user_id)!.add(l.key);
    }

    for (const r of rows) {
      const plan = planInForce(r, now);
      const t: LifecycleTeacher = {
        plan,
        signupAt: new Date(r.free_trial_started_at ?? r.created_at),
        trialEndsAt: r.trial_ends_at ? new Date(r.trial_ends_at) : null,
        fromTrial: plan === "free" && Boolean(r.trial_ends_at),
        hasPaid: Boolean(r.stripe_subscription_id),
        marketingConsent: Boolean(r.marketing_consent),
        sundayEmails: r.sunday_emails !== false,
      };
      const emails = dueEmails(t, sentKeys.get(r.id) ?? new Set(), now);
      due += emails.length;
      if (!enabled || emails.length === 0) continue;

      const { data: auth } = await supabaseAdmin.auth.admin.getUserById(r.id);
      const to = auth?.user?.email;
      if (!to) continue;
      const { count } = await supabaseAdmin
        .from("tool_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", r.id);
      const made = count ?? 0;
      const end = t.trialEndsAt ?? now;
      const vars: LifecycleVars = {
        firstName: r.first_name ?? "",
        trialEnds: trialDateLong(end),
        trialEndsDay: trialDateLong(end).split(" ")[0],
        made,
        // Approximate: every resource at the standard band until the per-tool
        // count is read here (Phase 2, with P8).
        hours: Math.round((made * MINUTES_SAVED_PER_BAND.standard) / 60),
        plan: "Pro",
        resources: 0,
        refill: "",
        planEnds: "",
      };

      for (const e of emails) {
        // The log row is the lock: a second run cannot insert the same key.
        const { error: lockError } = await supabaseAdmin
          .from("lifecycle_email_log")
          .insert({ user_id: r.id, key: e.key, status: "sent" });
        if (lockError) continue;
        const m = renderLifecycleEmail(e.id, vars);
        const result = await sendBroadcastEmail(
          to,
          { subject: m.subject, html: html(m.subject, m.body, m.button, site + m.path, site + m.footerPath), text: `${m.body}\n\n${m.button}: ${site}${m.path}` },
          { purpose: "lifecycle", oneClickUrl: null },
        );
        if (result.status === "sent") sent += 1;
        else {
          failed += 1;
          await supabaseAdmin
            .from("lifecycle_email_log")
            .update({ status: result.status === "skipped" ? "skipped" : "failed" })
            .eq("user_id", r.id)
            .eq("key", e.key);
        }
      }
    }
    if (rows.length < PAGE) break;
  }
  return { enabled, due, sent, failed };
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron/lifecycle] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (err) {
    console.error("[cron/lifecycle]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
