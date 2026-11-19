/*
 * Which of the five account states is in force (Jooma 4.5 spec Step 3).
 *
 *   pro_trial  10 days of Pro, no card, 300 resources, once per email
 *   free       50 a week, never locked out
 *   standard, pro, max   paid through Stripe
 *   (school    contact sales, unchanged)
 *
 * Stored as profiles.plan plus profiles.trial_ends_at (migration
 * 20261118000000_plans_engine.sql). A trial past its end reads as Free from the
 * next request, never mid-generation: the gate reads this before a generation
 * starts, and a running one is not stopped.
 *
 * Pure: safe in client components and unit tests.
 */

import type { AccountPlan } from "@/app/lib/plan-config";
import { PLAN_TIMEZONE } from "@/app/lib/plan-config";
import { londonDate } from "@/app/lib/resource-periods";

export interface PlanRow {
  plan: string | null;
  trial_ends_at?: string | null;
  subscription_status?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
}

const KNOWN: ReadonlySet<string> = new Set(["free", "pro_trial", "standard", "pro", "max", "school"]);

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** The plan in force at `now`. Anything unrecognised is Free, never paid. */
export function planInForce(row: PlanRow | null | undefined, now: Date): AccountPlan {
  const plan = row?.plan ?? "free";
  if (!KNOWN.has(plan)) return "free";

  if (plan === "pro_trial") {
    const end = time(row?.trial_ends_at);
    // No end date would mean endless Pro. Read it as Free instead.
    return end !== null && now.getTime() < end ? "pro_trial" : "free";
  }

  // The no-card Standard trial from before 4.5 (status trialing, no Stripe
  // subscription). It still ends on time until the launch-day move tidies it.
  if (row?.subscription_status === "trialing" && !row?.stripe_subscription_id) {
    const end = time(row?.current_period_end);
    if (end !== null && end <= now.getTime()) return "free";
  }

  return plan as AccountPlan;
}

/** The plan whose FEATURES apply, for code that only knows the four plans.
 *  The trial is Pro's features with its own export mark (see plan-config). */
export function featurePlan(plan: AccountPlan): Exclude<AccountPlan, "pro_trial"> {
  return plan === "pro_trial" ? "pro" : plan;
}

/**
 * The plan the Live route checks, from a raw my_generation_gate() plan. The
 * trial is Pro's features, so it counts as Pro; anything unknown is Free.
 * asPlanId alone only knows the four sold plans and read the trial as Free.
 */
export function livePlanFor(raw: string | null | undefined): Exclude<AccountPlan, "pro_trial"> {
  const plan = raw ?? "free";
  if (!KNOWN.has(plan)) return "free";
  return featurePlan(plan as AccountPlan);
}

/** Plans whose features include the assistant and its Live voice. Mirrors
 *  `limits.assistant` in plans.ts (true on every paid plan, false on Free). */
const ASSISTANT_PLANS: ReadonlySet<string> = new Set(["standard", "pro", "max", "school"]);

/**
 * What Ask Jo offers on screen. Twin of checkAssistantAccess (the real gate):
 *   chat  every plan once the 4.5 migration is in (Free included, behind the
 *         hourly limit); before it, the paid plans only.
 *   live  the paid plans and the Pro trial; Free is refused by /api/jo/live.
 * Comped Pro (an ambassador) is plain "pro" here, the same as paying Pro.
 */
export function askJoAccess(plan: AccountPlan, v45: boolean): { chat: boolean; live: boolean } {
  const live = ASSISTANT_PLANS.has(featurePlan(plan));
  return { chat: v45 || live, live };
}

/** The sidebar chip. Owner's decision (17 Nov): "PRO TRIAL" during the trial. */
export function planChipLabel(plan: AccountPlan): string {
  return plan === "pro_trial" ? "PRO TRIAL" : plan.toUpperCase();
}

const SHORT = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLAN_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const LONG = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLAN_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

function joined(f: Intl.DateTimeFormat, d: Date): string {
  const p: Record<string, string> = {};
  for (const { type, value } of f.formatToParts(d)) p[type] = value;
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "Wed 25 Nov": the chip. The actual date, never "3 days left". */
export function trialDateShort(d: Date): string {
  return joined(SHORT, d);
}

/** "Wednesday 25 November": banners and emails. */
export function trialDateLong(d: Date): string {
  return joined(LONG, d);
}

/** UK calendar days since signup. Day 0 is the signup date. */
export function trialDay(signup: Date, now: Date): number {
  const a = londonDate(signup);
  const b = londonDate(now);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** P1: the sidebar chip on days 0 to 6, the Today banner on days 7 to 10. */
export function trialPrompt(signup: Date, now: Date): "chip" | "banner" {
  return trialDay(signup, now) >= 7 ? "banner" : "chip";
}

export interface TrialEligibility {
  /** This email (normalised, hashed) has had a trial before. */
  emailSeen: boolean;
  isAdmin: boolean;
  hasPaid: boolean;
  plan: string | null;
}

/** One trial per email, ever, and only from Free. */
export function canStartProTrial(e: TrialEligibility): boolean {
  return !e.emailSeen && !e.isAdmin && !e.hasPaid && (e.plan ?? "free") === "free";
}
