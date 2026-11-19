/*
 * When each lifecycle email is due (Jooma 4.5 spec Step 6). Phase 1:
 *
 *   E1   straight after signup             Pro trial
 *   E5   day 8, 16:30                      Pro trial
 *   E6   day 10, 07:30                     Pro trial
 *   E7   day 11, 07:30                     Free, just moved from the trial
 *   E8   every Sunday 16:00, from the first Sunday after the trial   Free
 *   E12  payment succeeds for a new plan   (event)
 *   E13  teacher cancels                   (event)
 *   E14  payment fails                     (event)
 *
 * Phase 2 (built 19 Nov):
 *   E2a  day 1, 16:30, nothing made yet    Pro trial
 *   E2b  day 1, 16:30, something made      Pro trial (never both)
 *   E3   day 3, 16:30                      Pro trial
 *   E4   day 5, 16:30                      Pro trial
 *   E9a  1 hour after running out, at most once a UK week     Free (marketing)
 *   E9b  1 hour after the second run-out opened the offer, once  Free (marketing)
 *   E10  16:30 UK, 14 days after the last visit, once per absence  Free (marketing)
 *   E11  80% of the allowance used, >7 days to refill, per period  Standard (e11Due)
 *   Still to build: E10 (14 days away), E11 (80% used, paid plans).
 *
 * Rules for every email:
 *   - Nothing between 21:00 and 07:00 UK time.
 *   - The moment a teacher pays, every trial and Free email stops.
 *   - Marketing only to teachers who ticked the box, at most one a day.
 *     (All Phase 1 emails are account emails; the rule is here for Phase 2.)
 *   - Each email once per key. E8 is keyed per Sunday ("E8:2026-11-29").
 *   - A send more than 12 hours late is dropped, never sent days late.
 *
 * NOTHING SENDS until it is switched on in Admin, Emails & templates
 * (lib/lifecycle-switch.ts), as a whole and per email.
 *
 * Pure: the cron (app/api/cron/lifecycle) reads the teachers and the sent log
 * and asks this file what to send.
 */

import type { AccountPlan } from "@/app/lib/plan-config";
import { PLAN_TIMEZONE } from "@/app/lib/plan-config";
import { londonDate, londonTime, type CalendarDate } from "@/app/lib/resource-periods";
import { runningLow } from "@/app/lib/prompt-views";
import { ukWeekKey } from "@/app/lib/run-out-offer";

export type LifecycleId = "E1" | "E2a" | "E2b" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9a" | "E9b" | "E10" | "E11" | "E12" | "E13" | "E14";
export type EmailKind = "account" | "marketing";

export interface LifecycleTeacher {
  plan: AccountPlan;
  signupAt: Date;
  /** When the Pro trial ends or ended. Null if they never had one. */
  trialEndsAt: Date | null;
  /** On Free because the trial ended (not a cancel or a failed payment). */
  fromTrial: boolean;
  /** Has ever paid, or holds a paid plan now. */
  hasPaid: boolean;
  marketingConsent: boolean;
  /** E8's own switch in email settings. */
  sundayEmails: boolean;
  /** A marketing email already went to them today (UK date). */
  marketingSentToday?: boolean;
  /** Resources made so far (E2a when none, E2b when some). */
  made?: number;
  /** Run-outs ON FREE (credits_ran_out with plan free), for E9a. */
  ranOutAt?: Date[];
  /** The second run-out offer (P3b, E9b): when it opened and ends. */
  offerOpenedAt?: Date | null;
  offerEndsAt?: Date | null;
  /** The last visit (profiles.last_seen_at), for E10. Null: not recorded. */
  lastSeenAt?: Date | null;
}

export interface DueEmail {
  id: LifecycleId;
  /** Dedupe key in the sent log. */
  key: string;
  kind: EmailKind;
}

const LATE_LIMIT_MS = 12 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function hourMinute(at: Date): number {
  const p: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-GB", {
    timeZone: PLAN_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at)) {
    p[type] = value;
  }
  return Number(p.hour) * 60 + Number(p.minute);
}

/** 21:00 to 07:00 UK time. */
export function inQuietHours(now: Date): boolean {
  const t = hourMinute(now);
  return t >= 21 * 60 || t < 7 * 60;
}

export function mayReceive(kind: EmailKind, t: LifecycleTeacher): boolean {
  if (kind === "account") return true;
  return t.marketingConsent && !t.marketingSentToday;
}

const PAID: ReadonlySet<AccountPlan> = new Set(["standard", "pro", "max", "school"]);

function addDays(d: CalendarDate, days: number): CalendarDate {
  const x = new Date(Date.UTC(d.y, d.m - 1, d.d + days));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

function iso(d: CalendarDate): string {
  return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}

function isDue(dueAt: Date, now: Date): boolean {
  const late = now.getTime() - dueAt.getTime();
  return late >= 0 && late <= LATE_LIMIT_MS;
}

/** An address on email_opt_outs (a broadcast unsubscribe, a bounce, a spam
 *  report, or this email's own link) gets no marketing, whatever the profile's
 *  consent flag says. Account mail still goes. The cron only knows the address
 *  after dueEmails, so this runs second. */
export function dropOptedOutMarketing(emails: DueEmail[], optedOut: boolean): DueEmail[] {
  return optedOut ? emails.filter((e) => e.kind !== "marketing") : emails;
}

/** What to send to this teacher now, given the keys already sent. */
export function dueEmails(t: LifecycleTeacher, sent: ReadonlySet<string>, now: Date): DueEmail[] {
  if (inQuietHours(now)) return [];
  // Paying stops every trial and Free email. E12 to E14 are event emails.
  if (t.hasPaid || PAID.has(t.plan)) return [];

  const out: DueEmail[] = [];
  const add = (id: LifecycleId, key: string, dueAt: Date, kind: EmailKind = "account") => {
    if (!sent.has(key) && isDue(dueAt, now) && mayReceive(kind, t)) out.push({ id, key, kind });
  };

  const day0 = londonDate(t.signupAt);
  if (t.plan === "pro_trial") {
    add("E1", "E1", t.signupAt);
    // Phase 2 onboarding tips, 16:30 UK time: E2a or E2b on day 1 (never
    // both), E3 on day 3, E4 on day 5.
    if (!sent.has("E2a") && !sent.has("E2b")) {
      const id = (t.made ?? 0) > 0 ? "E2b" : "E2a";
      add(id, id, londonTime(addDays(day0, 1), 16, 30));
    }
    add("E3", "E3", londonTime(addDays(day0, 3), 16, 30));
    add("E4", "E4", londonTime(addDays(day0, 5), 16, 30));
    add("E5", "E5", londonTime(addDays(day0, 8), 16, 30));
    add("E6", "E6", londonTime(addDays(day0, 10), 7, 30));
  }

  if (t.plan === "free") {
    if (t.fromTrial) add("E7", "E7", londonTime(addDays(day0, 11), 7, 30));

    const today = londonDate(now);
    const weekday = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
    const afterTrial = !t.trialEndsAt || iso(today) > iso(londonDate(t.trialEndsAt));
    if (weekday === 0 && afterTrial && t.sundayEmails) {
      add("E8", `E8:${iso(today)}`, londonTime(today, 16, 0));
    }

    // E9b: an hour after the second run-out opened the offer, once, while it
    // is open. It stands in for that week's E9a.
    const offerWeek = t.offerOpenedAt ? ukWeekKey(t.offerOpenedAt) : null;
    if (t.offerOpenedAt && t.offerEndsAt && now.getTime() < t.offerEndsAt.getTime()) {
      add("E9b", "E9b", new Date(t.offerOpenedAt.getTime() + HOUR_MS), "marketing");
    }
    // E9a: an hour after running out, at most once a UK week.
    for (const ran of t.ranOutAt ?? []) {
      const week = ukWeekKey(ran);
      if (week === offerWeek) continue;
      add("E9a", `E9a:${week}`, new Date(ran.getTime() + HOUR_MS), "marketing");
    }

    // E10 (Phase 2): 14 days with no visit, 16:30 UK on day 14, once per
    // absence. Never without a recorded visit: accounts from before visits
    // were tracked would otherwise all be "away" on the first run.
    if (t.lastSeenAt) {
      const seen = londonDate(t.lastSeenAt);
      add("E10", `E10:${iso(seen)}`, londonTime(addDays(seen, 14), 16, 30), "marketing");
    }
  }
  // At most one marketing email a day, and one per week key.
  const seen = new Set<string>();
  let marketing = 0;
  return out.filter((e) => {
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    if (e.kind !== "marketing") return true;
    marketing += 1;
    return marketing === 1;
  });
}

/** Keys in lifecycle_email_log that count towards "one marketing email a day". */
export function isMarketingKey(key: string): boolean {
  return /^(E9a|E9b|E10)(:|$)/.test(key);
}

/** The Standard allowance as the cron reads it (service role). */
export interface StandardAccount {
  plan: AccountPlan;
  allowance: number;
  /** Resources spent this period (resources_spent), allowance first. */
  spent: number;
  periodStart: Date;
  nextRefillAt: Date | null;
}

/**
 * E11 (Phase 2): Standard with 80% of the allowance used and more than 7 days
 * to the refill (the same rule as P9), once per allowance period. An account
 * email, so no consent check; never in quiet hours.
 */
export function e11Due(a: StandardAccount, sent: ReadonlySet<string>, now: Date): DueEmail | null {
  if (a.plan !== "standard" || inQuietHours(now)) return null;
  const key = `E11:${iso(londonDate(a.periodStart))}`;
  if (sent.has(key)) return null;
  const low = runningLow({
    allowance: a.allowance,
    allowanceLeft: a.allowance - a.spent,
    nextRefillAt: a.nextRefillAt,
    now,
  });
  return low ? { id: "E11", key, kind: "account" } : null;
}

/** The event that sends an email at once. */
export function emailForEvent(event: string): LifecycleId | null {
  if (event === "subscribed") return "E12";
  if (event === "cancelled") return "E13";
  if (event === "payment_failed") return "E14";
  return null;
}

/** An app_events row the event emails are sent from. */
export interface LoggedEvent {
  id: number;
  name: string;
  createdAt: Date;
}

/**
 * E12 to E14, from the events the webhook logged (subscribed, cancelled,
 * payment_failed). One per event (the key carries the event id), never in
 * quiet hours, never more than 12 hours late, and E14 only while the payment
 * is still failing.
 */
export function eventEmails(
  events: readonly LoggedEvent[],
  sent: ReadonlySet<string>,
  now: Date,
  state: { paymentFailing: boolean },
): (DueEmail & { eventId: number })[] {
  if (inQuietHours(now)) return [];
  const out: (DueEmail & { eventId: number })[] = [];
  for (const e of events) {
    const id = emailForEvent(e.name);
    if (!id) continue;
    if (id === "E14" && !state.paymentFailing) continue;
    const key = `${id}:${e.id}`;
    if (sent.has(key) || !isDue(e.createdAt, now)) continue;
    out.push({ id, key, kind: "account", eventId: e.id });
  }
  return out;
}
