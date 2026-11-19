import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { sendBroadcastEmail } from "@/app/lib/email";
import { lifecycleHtml } from "@/app/lib/lifecycle-html";
import { dropOptedOutMarketing, dueEmails, e11Due, eventEmails, isMarketingKey, sendingEnabled, type LifecycleTeacher } from "@/app/lib/lifecycle";
import { ideaFor, pickIdea, type Idea } from "@/app/lib/e10-ideas";
import { signUnsubToken, unsubSecret } from "@/app/lib/unsub-link";
import { renderLifecycleEmail, type LifecycleVars } from "@/app/lib/lifecycle-emails";
import { planInForce, trialDateLong } from "@/app/lib/account-plan";
import { MINUTES_SAVED_PER_BAND, allowanceFor, type AccountPlan } from "@/app/lib/plan-config";

// Jooma 4.5 lifecycle emails (spec Step 6). Phase 1: the scheduled E1, E5,
// E6, E7 and E8, and the event emails E12, E13 and E14, which the Stripe
// webhook logs as app_events (subscribed, cancelled, payment_failed) and this
// sends within 15 minutes, outside quiet hours. Meant to run every 15 minutes; the rules are in lib/lifecycle.ts.
//
// SAFE BY DEFAULT. Unless LIFECYCLE_EMAILS=on, this is a dry run: it works out
// who is due and returns the count, and sends and records nothing. The owner
// turns it on after approving the wording.
//
// Scheduled every 15 minutes in vercel.json (the team is on Vercel Pro, which
// allows sub-daily crons).
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
  last_seen_at: string | null;
}

const html = lifecycleHtml;
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });

async function run(): Promise<{ enabled: boolean; due: number; sent: number; failed: number }> {
  const enabled = sendingEnabled(process.env);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jooma.ai";
  const started = Date.now();
  const now = new Date();
  const unsubKey = unsubSecret(process.env);
  if (!unsubKey) console.warn("[cron/lifecycle] no unsubscribe secret, marketing emails are skipped");
  let due = 0;
  let sent = 0;
  let failed = 0;
  // E10: this UK week's idea, from the admin list (lifecycle_ideas), or the
  // defaults in e10-ideas.ts when the list is empty or unreadable.
  const { data: ideaRows } = await supabaseAdmin
    .from("lifecycle_ideas")
    .select("text, tool_slug")
    .eq("kind", "e10")
    .eq("active", true)
    .order("sort");
  const ideas: Idea[] = (ideaRows ?? []).map((r) => ({ text: r.text as string, toolSlug: r.tool_slug as string }));
  const idea = ideaFor(pickIdea(ideas, now));

  for (let from = 0; Date.now() - started < BUDGET_MS; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, first_name, plan, created_at, trial_ends_at, free_trial_started_at, subscription_status, stripe_subscription_id, current_period_end, marketing_consent, sunday_emails, last_seen_at",
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
    const { data: log } = await supabaseAdmin.from("lifecycle_email_log").select("user_id, key, sent_at").in("user_id", ids);
    // E9a and E9b (Phase 2): run-outs on Free in the last 13 days (E9a is at
    // most 12 hours late), and the second run-out offer if one opened.
    const { data: runOuts } = await supabaseAdmin
      .from("app_events")
      .select("user_id, name, props, created_at")
      .in("user_id", ids)
      .in("name", ["credits_ran_out", "offer_opened"])
      .gte("created_at", new Date(now.getTime() - 13 * 86_400_000).toISOString())
      .order("created_at");
    const ranOut = new Map<string, Date[]>();
    const offers = new Map<string, { opened: Date; ends: Date }>();
    for (const e of runOuts ?? []) {
      const p = (e.props ?? {}) as { plan?: string; ends_at?: string };
      if (e.name === "credits_ran_out" && p.plan === "free") {
        ranOut.set(e.user_id, [...(ranOut.get(e.user_id) ?? []), new Date(e.created_at)]);
      } else if (e.name === "offer_opened" && p.ends_at && !offers.has(e.user_id)) {
        offers.set(e.user_id, { opened: new Date(e.created_at), ends: new Date(p.ends_at) });
      }
    }
    // E2a or E2b (Phase 2): what each trial teacher has made, and the first
    // title for E2b. One read per page, trial teachers only.
    const trialIds = rows.filter((r) => r.plan === "pro_trial").map((r) => r.id);
    const madeBy = new Map<string, { count: number; first: string | null }>();
    if (trialIds.length) {
      const { data: runs } = await supabaseAdmin
        .from("tool_runs")
        .select("user_id, title, created_at")
        .in("user_id", trialIds)
        .order("created_at")
        .limit(5000);
      for (const run of runs ?? []) {
        const m = madeBy.get(run.user_id) ?? { count: 0, first: null };
        m.count += 1;
        m.first ??= typeof run.title === "string" && run.title.trim() ? run.title.trim().slice(0, 80) : null;
        madeBy.set(run.user_id, m);
      }
    }
    const today = DAY_KEY.format(now);
    const marketingToday = new Set(
      (log ?? []).filter((l) => isMarketingKey(l.key) && l.sent_at && DAY_KEY.format(new Date(l.sent_at)) === today).map((l) => l.user_id),
    );
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
        marketingSentToday: marketingToday.has(r.id),
        made: madeBy.get(r.id)?.count ?? 0,
        ranOutAt: ranOut.get(r.id) ?? [],
        offerOpenedAt: offers.get(r.id)?.opened ?? null,
        offerEndsAt: offers.get(r.id)?.ends ?? null,
        lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at) : null,
      };
      let emails = dueEmails(t, sentKeys.get(r.id) ?? new Set(), now);
      due += emails.length;
      if (!enabled || emails.length === 0) continue;

      const { data: auth } = await supabaseAdmin.auth.admin.getUserById(r.id);
      const to = auth?.user?.email;
      if (!to) continue;
      // Marketing (E9a, E9b): never to an address on the opt-out list, and
      // never without a signed unsubscribe link.
      if (emails.some((e) => e.kind === "marketing")) {
        const { data: optOut } = await supabaseAdmin
          .from("email_opt_outs")
          .select("email")
          .eq("email", to.toLowerCase())
          .maybeSingle();
        emails = dropOptedOutMarketing(emails, Boolean(optOut) || !unsubKey);
      }
      const unsubToken = unsubKey ? signUnsubToken(r.id, unsubKey) : undefined;
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
        offerEnds: t.offerEndsAt ? trialDateLong(t.offerEndsAt) : undefined,
        firstTitle: madeBy.get(r.id)?.first ?? undefined,
        offerEndsDay: t.offerEndsAt ? trialDateLong(t.offerEndsAt).split(" ")[0] : undefined,
        idea,
      };

      for (const e of emails) {
        const result = await sendOne(r.id, to, e.key, renderLifecycleEmail(e.id, vars, { unsubToken }), site);
        if (result === "sent") sent += 1;
        else if (result === "failed") failed += 1;
      }
    }
    if (rows.length < PAGE) break;
  }

  const events = await sendEventEmails(enabled, site, now);
  const standard = await sendStandardEmails(enabled, site, now);
  return {
    enabled,
    due: due + events.due + standard.due,
    sent: sent + events.sent + standard.sent,
    failed: failed + events.failed + standard.failed,
  };
}

/**
 * E11 (Phase 2): Standard with 80% of the allowance used and more than 7 days
 * to the refill, once per allowance period. An account email. The spend is
 * read with resources_spent() under the service role, the same sum
 * my_resources() uses; only accounts without this period's E11 are read.
 */
async function sendStandardEmails(
  enabled: boolean,
  site: string,
  now: Date,
): Promise<{ due: number; sent: number; failed: number }> {
  let due = 0;
  let sent = 0;
  let failed = 0;
  const { data: rows, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name")
    .eq("plan", "standard")
    .is("suspended_at", null)
    .is("deletion_scheduled_for", null)
    .limit(5000);
  if (error) throw new Error(error.message);
  const ids = (rows ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { due, sent, failed };

  const [{ data: accounts }, { data: log }] = await Promise.all([
    supabaseAdmin.from("resource_accounts").select("user_id, plan, allowance, period_start, next_refill_at").in("user_id", ids),
    supabaseAdmin.from("lifecycle_email_log").select("user_id, key").in("user_id", ids).like("key", "E11:%"),
  ]);
  const sentKeys = new Map<string, Set<string>>();
  for (const l of log ?? []) {
    if (!sentKeys.has(l.user_id)) sentKeys.set(l.user_id, new Set());
    sentKeys.get(l.user_id)!.add(l.key);
  }
  const names = new Map((rows ?? []).map((r) => [r.id as string, (r.first_name as string | null) ?? ""]));

  for (const a of accounts ?? []) {
    if (a.plan !== "standard" || !a.period_start) continue;
    const periodStart = new Date(a.period_start);
    const sentForUser = sentKeys.get(a.user_id) ?? new Set<string>();
    // This period's E11 already went: skip the spend read. Same key as e11Due.
    if (sentForUser.has(`E11:${DAY_KEY.format(periodStart)}`)) continue;
    const { data: spent, error: spentError } = await supabaseAdmin.rpc("resources_spent", {
      p_uid: a.user_id,
      p_since: a.period_start,
    });
    if (spentError) {
      console.warn("[cron/lifecycle] resources_spent failed", a.user_id, spentError.message);
      continue;
    }
    const e = e11Due(
      {
        plan: "standard",
        allowance: Number(a.allowance ?? 0),
        spent: Number(spent ?? 0),
        periodStart,
        nextRefillAt: a.next_refill_at ? new Date(a.next_refill_at) : null,
      },
      sentForUser,
      now,
    );
    if (!e) continue;
    due += 1;
    if (!enabled) continue;
    const { data: auth } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
    const to = auth?.user?.email;
    if (!to) continue;
    const allowance = Number(a.allowance ?? 0);
    const vars: LifecycleVars = {
      firstName: names.get(a.user_id) ?? "",
      trialEnds: "",
      trialEndsDay: "",
      made: 0,
      hours: 0,
      plan: "Standard",
      resources: allowance,
      used: Math.min(allowance, Math.round(Number(spent ?? 0))),
      refill: a.next_refill_at ? DATE.format(new Date(a.next_refill_at)) : "your next refill",
      planEnds: "",
    };
    const result = await sendOne(a.user_id, to, e.key, renderLifecycleEmail(e.id, vars), site);
    if (result === "sent") sent += 1;
    else if (result === "failed") failed += 1;
  }
  return { due, sent, failed };
}

const PLAN_NAMES: Record<string, string> = { standard: "Standard", pro: "Pro", max: "Max" };
const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long" });

/** E12 to E14: one email per logged event, at most 12 hours late. */
async function sendEventEmails(
  enabled: boolean,
  site: string,
  now: Date,
): Promise<{ due: number; sent: number; failed: number }> {
  let due = 0;
  let sent = 0;
  let failed = 0;
  const since = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("app_events")
    .select("id, user_id, name, created_at")
    .in("name", ["subscribed", "cancelled", "payment_failed"])
    .gte("created_at", since)
    .not("user_id", "is", null)
    .order("id")
    .limit(1000);
  if (error) throw new Error(error.message);
  const byUser = new Map<string, { id: number; name: string; createdAt: Date }[]>();
  for (const r of rows ?? []) {
    const list = byUser.get(r.user_id) ?? [];
    list.push({ id: Number(r.id), name: r.name, createdAt: new Date(r.created_at) });
    byUser.set(r.user_id, list);
  }

  for (const [userId, list] of byUser) {
    const [{ data: profile }, { data: log }, { data: account }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("first_name, plan, payment_failed_at, current_period_end, deletion_scheduled_for")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin.from("lifecycle_email_log").select("key").eq("user_id", userId),
      supabaseAdmin.from("resource_accounts").select("next_refill_at").eq("user_id", userId).maybeSingle(),
    ]);
    if (!profile || profile.deletion_scheduled_for) continue;
    const emails = eventEmails(list, new Set((log ?? []).map((l) => l.key)), now, {
      paymentFailing: Boolean(profile.payment_failed_at),
    });
    due += emails.length;
    if (!enabled || emails.length === 0) continue;

    const { data: auth } = await supabaseAdmin.auth.admin.getUserById(userId);
    const to = auth?.user?.email;
    if (!to) continue;
    const plan = (profile.plan ?? "free") as AccountPlan;
    const vars: LifecycleVars = {
      firstName: profile.first_name ?? "",
      trialEnds: "",
      trialEndsDay: "",
      made: 0,
      hours: 0,
      plan: PLAN_NAMES[plan] ?? "your plan",
      resources: allowanceFor(plan) ?? 0,
      refill: account?.next_refill_at ? DATE.format(new Date(account.next_refill_at)) : "your next billing date",
      planEnds: profile.current_period_end ? DATE.format(new Date(profile.current_period_end)) : "the end of this period",
    };
    for (const e of emails) {
      const result = await sendOne(userId, to, e.key, renderLifecycleEmail(e.id, vars), site);
      if (result === "sent") sent += 1;
      else if (result === "failed") failed += 1;
    }
  }
  return { due, sent, failed };
}

/** Lock, send and record one email. The log row is the lock. */
async function sendOne(
  userId: string,
  to: string,
  key: string,
  m: ReturnType<typeof renderLifecycleEmail>,
  site: string,
): Promise<"sent" | "failed" | "locked"> {
  const { error: lockError } = await supabaseAdmin
    .from("lifecycle_email_log")
    .insert({ user_id: userId, key, status: "sent" });
  if (lockError) return "locked";
  const result = await sendBroadcastEmail(
    to,
    {
      subject: m.subject,
      html: html(m.subject, m.body, m.button, site + m.path, site + m.footerPath),
      text: `${m.body}\n\n${m.button}: ${site}${m.path}`,
    },
    { purpose: "lifecycle", oneClickUrl: null },
  );
  if (result.status === "sent") return "sent";
  await supabaseAdmin
    .from("lifecycle_email_log")
    .update({ status: result.status === "skipped" ? "skipped" : "failed" })
    .eq("user_id", userId)
    .eq("key", key);
  return "failed";
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
