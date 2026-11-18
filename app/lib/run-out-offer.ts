/*
 * The second run-out offer (Jooma 4.5 spec Step 5 P3b, Step 6 E9b, config
 * OFFER): a Free teacher who runs out of resources a second time, in a
 * different UK week (Sunday 00:00 to Sunday 00:00), is offered their first
 * month of Pro at half price. Once per account, open for seven days, Pro
 * monthly only. The app applies the coupon at checkout; nobody types it.
 *
 * Pure. The run-out route (/api/run-out) reads the account's events and asks
 * runOutDecision(); checkout asks offerIsOpen() of the stored end date.
 */

import { OFFER, type AccountPlan } from "@/app/lib/plan-config";
import { freePeriod, londonDate, londonTime } from "@/app/lib/resource-periods";

/** The UK week an instant falls in, named by its Sunday: "2026-11-29". */
export function ukWeekKey(at: Date): string {
  const d = londonDate(freePeriod(at).start);
  return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}

export interface RunOutInput {
  plan: AccountPlan;
  hasPaid: boolean;
  isAdmin: boolean;
  /** Earlier run-outs ON FREE (credits_ran_out with plan free), not this one. */
  earlierRunOuts: Date[];
  /** When the offer was opened, if it ever was. */
  offerOpenedAt: Date | null;
  now: Date;
}

export interface RunOutDecision {
  prompt: "P3" | "P3b";
  openOffer: boolean;
}

export function runOutDecision(i: RunOutInput): RunOutDecision {
  const p3 = { prompt: "P3", openOffer: false } as const;
  if (i.plan !== "free" || i.hasPaid || i.isAdmin || i.offerOpenedAt) return p3;
  const thisWeek = ukWeekKey(i.now);
  const earlierWeek = i.earlierRunOuts.some(
    (d) => d.getTime() <= i.now.getTime() && ukWeekKey(d) !== thisWeek,
  );
  return earlierWeek ? { prompt: "P3b", openOffer: true } : p3;
}

/** 23:59:59 UK time on the seventh UK day after the offer opened. */
export function offerEndsAt(openedAt: Date): Date {
  const d = londonDate(openedAt);
  const end = londonTime({ y: d.y, m: d.m, d: d.d + OFFER.validDays }, 23, 59);
  return new Date(end.getTime() + 59_000);
}

export function offerIsOpen(
  row: { offerEndsAt: Date | null; hasPaid: boolean; hasSubscription: boolean },
  now: Date,
): boolean {
  if (!row.offerEndsAt || row.hasPaid || row.hasSubscription) return false;
  return now.getTime() < row.offerEndsAt.getTime();
}
