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
 * Rules for every email:
 *   - Nothing between 21:00 and 07:00 UK time.
 *   - The moment a teacher pays, every trial and Free email stops.
 *   - Marketing only to teachers who ticked the box, at most one a day.
 *     (All Phase 1 emails are account emails; the rule is here for Phase 2.)
 *   - Each email once per key. E8 is keyed per Sunday ("E8:2026-11-29").
 *   - A send more than 12 hours late is dropped, never sent days late.
 *
 * NOTHING SENDS unless LIFECYCLE_EMAILS=on (see sendingEnabled). The owner
 * turns it on after approving the wording.
 *
 * Pure: the cron (app/api/cron/lifecycle) reads the teachers and the sent log
 * and asks this file what to send.
 */

import type { AccountPlan } from "@/app/lib/plan-config";
import { PLAN_TIMEZONE } from "@/app/lib/plan-config";
import { londonDate, londonTime, type CalendarDate } from "@/app/lib/resource-periods";

export type LifecycleId = "E1" | "E5" | "E6" | "E7" | "E8" | "E12" | "E13" | "E14";
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
}

export interface DueEmail {
  id: LifecycleId;
  /** Dedupe key in the sent log. */
  key: string;
  kind: EmailKind;
}

const LATE_LIMIT_MS = 12 * 60 * 60 * 1000;

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

export function sendingEnabled(env: Record<string, string | undefined>): boolean {
  return env.LIFECYCLE_EMAILS === "on";
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
  }
  return out;
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
