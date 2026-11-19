/*
 * The resources balance (Jooma 4.5 spec Step 2).
 *
 * Charging stays MEASURED. What a period has `spent` is the real model spend
 * of its generations (token_usage plus asset_cost since the period started),
 * in resources: 1 resource is 0.15p (see PENCE_PER_CREDIT in plans.ts). The
 * account row holds only:
 *
 *   plan          the plan whose allowance the NEXT refill sets
 *   periodStart   when this period's allowance was set
 *   nextRefillAt  when it is next set (the trial's end, for the trial)
 *   allowance     resources set at periodStart, raised by an upgrade
 *   anchorDay     the day of the month a paid plan refills on
 *   topupSpent    how much of the top-up pool CLOSED periods have eaten
 *
 * Top-ups never expire and are spent only after the allowance. While a period
 * is open its overspend is read live from `spent`; when it closes, that
 * overspend is moved into topupSpent. The pool itself is the sum of packs
 * bought (allowance_grants), so the ledger of purchases stays the source.
 *
 * Periods roll forward LAZILY, on read or on spend, so nothing depends on a
 * cron firing on time. The SQL twin is my_resources() in
 * supabase/migrations/20261118000000_plans_engine.sql: the two must agree, and
 * this file is the one the tests pin.
 *
 * Pure: no server, no database, no clock (every function takes `now`).
 */

import { allowanceFor, type AccountPlan } from "@/app/lib/plan-config";
import { freePeriod, londonDate, monthlyPeriod, trialEndsAt, type Period } from "@/app/lib/resource-periods";
import { roundEstimate } from "@/app/lib/tool-estimates";

export interface ResourceAccount {
  plan: AccountPlan;
  periodStart: Date;
  /** `null` only for School, which is not metered here. */
  nextRefillAt: Date | null;
  allowance: number;
  anchorDay: number;
  topupSpent: number;
}

/** What the period has used and what has ever been bought, in resources. */
export interface Usage {
  spent: number;
  topupsBought: number;
}

const PAID: ReadonlySet<AccountPlan> = new Set(["standard", "pro", "max"]);

/** Never let a bad number from a row hand out more than the allowance. */
function clean(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The period that contains `now`, for a plan.
 *
 * The trial's "period" is the whole trial, from signup to trial end; pass its
 * start in `opts.trialStartedAt` (it defaults to `now`).
 */
export function periodFor(
  plan: AccountPlan,
  anchorDay: number,
  now: Date,
  opts: { trialStartedAt?: Date } = {},
): { start: Date; next: Date | null } {
  if (plan === "free") return freePeriod(now);
  if (plan === "pro_trial") {
    const start = opts.trialStartedAt ?? now;
    return { start, next: trialEndsAt(start) };
  }
  if (plan === "school") return { start: monthlyPeriod(anchorDay, now).start, next: null };
  return monthlyPeriod(anchorDay, now);
}

/**
 * A brand new allowance that starts NOW, not at the period's natural start:
 * a teacher moved to Free on a Wednesday gets 50 from that minute, and the
 * spend before it is not counted against them.
 */
export function startAccount(plan: AccountPlan, now: Date, topupSpent = 0): ResourceAccount {
  const anchorDay = londonDate(now).d;
  const period = periodFor(plan, anchorDay, now, { trialStartedAt: now });
  return {
    plan,
    periodStart: now,
    nextRefillAt: period.next,
    allowance: allowanceFor(plan) ?? 0,
    anchorDay,
    topupSpent,
  };
}

export interface RollResult {
  account: ResourceAccount;
  /** A refill happened. */
  rolled: boolean;
  /** The trial's window has closed: the caller moves the account to Free. */
  trialOver: boolean;
}

/** Overspend in a period that is closing, capped by what the pool still has. */
function closingOverspend(acc: ResourceAccount, usage: Usage): number {
  const over = Math.max(0, clean(usage.spent) - acc.allowance);
  const poolLeft = Math.max(0, clean(usage.topupsBought) - acc.topupSpent);
  return Math.min(over, poolLeft);
}

/**
 * Roll the account to the period that contains `now`.
 *
 * `usage.spent` is the spend of the period being CLOSED (since periodStart).
 * A row untouched for weeks lands on the current period, not the next one:
 * the weeks in between had no spend, so they have nothing to settle.
 */
export function rollForward(acc: ResourceAccount, usage: Usage, now: Date): RollResult {
  if (!acc.nextRefillAt || now.getTime() < acc.nextRefillAt.getTime()) {
    return { account: acc, rolled: false, trialOver: false };
  }
  if (acc.plan === "pro_trial") {
    // One window, never refilled. Moving to Free is a plan change, which the
    // caller makes (and records as an event), not a refill.
    return { account: acc, rolled: false, trialOver: true };
  }

  const topupSpent = acc.topupSpent + closingOverspend(acc, usage);
  const period = periodFor(acc.plan, acc.anchorDay, now);
  return {
    account: {
      ...acc,
      // Never before the refill that closed the old period, so no spend is
      // ever counted in two periods.
      periodStart: new Date(Math.max(period.start.getTime(), acc.nextRefillAt.getTime())),
      nextRefillAt: period.next,
      allowance: allowanceFor(acc.plan) ?? 0,
      topupSpent,
    },
    rolled: true,
    trialOver: false,
  };
}

export interface Balance {
  allowanceLeft: number;
  topupLeft: number;
  /** What the meter shows: whole resources, never below 0. */
  total: number;
}

export function balance(acc: ResourceAccount, usage: Usage): Balance {
  const spent = clean(usage.spent);
  const pool = Math.max(0, clean(usage.topupsBought) - acc.topupSpent);
  const allowanceLeft = Math.max(0, acc.allowance - spent);
  const over = Math.max(0, spent - acc.allowance);
  const topupLeft = Math.max(0, pool - over);
  return {
    allowanceLeft: Math.floor(allowanceLeft),
    topupLeft: Math.floor(topupLeft),
    total: Math.floor(allowanceLeft + topupLeft),
  };
}

/**
 * A plan change, as billing reports it.
 *
 *   to Free             a fresh 50 from now (trial end, cancel, failed payment)
 *   Free/trial to paid  the full allowance from now, anchored on today
 *   paid up             the difference added now, refill date unchanged
 *   paid down           nothing now; the next refill sets the new allowance
 */
export function changePlan(
  acc: ResourceAccount,
  from: AccountPlan,
  to: AccountPlan,
  now: Date,
): ResourceAccount {
  if (from === to) return acc;
  if (to === "free" || to === "pro_trial" || !PAID.has(from)) {
    return startAccount(to, now, acc.topupSpent);
  }
  const before = allowanceFor(from) ?? 0;
  const after = allowanceFor(to) ?? 0;
  if (after > before) return { ...acc, plan: to, allowance: acc.allowance + (after - before) };
  return { ...acc, plan: to };
}

export type EstimateCheck =
  | { ok: true }
  | { ok: false; needed: number; left: number; message: string };

/**
 * Whether a tool's typical cost fits what is left. Uses the same rounding as
 * the "about N resources" chip, so the line and the check never disagree.
 * A generation that has started always finishes; this runs before it starts.
 */
export function estimateCheck(estimate: number, left: number): EstimateCheck {
  const needed = roundEstimate(estimate);
  const have = Math.max(0, Math.floor(left));
  if (needed <= have) return { ok: true };
  return { ok: false, needed, left: have, message: `This usually needs about ${needed}. You have ${have}.` };
}

export interface OutOfResources {
  /** The prompt the client opens. `null` for paid plans, which top up. */
  prompt: "P3" | null;
  variant: "free" | "trial" | "topup";
  needed: number;
  left: number;
  refillAt: string | null;
}

/** The 402 body's prompt part, so the server and the sheet agree. */
export function outOfResourcesPayload(
  plan: AccountPlan,
  p: { needed: number; left: number; refillAt: Date | null },
): OutOfResources {
  const base = { needed: p.needed, left: p.left, refillAt: p.refillAt ? p.refillAt.toISOString() : null };
  if (plan === "free") return { prompt: "P3", variant: "free", ...base };
  if (plan === "pro_trial") return { prompt: "P3", variant: "trial", ...base };
  return { prompt: null, variant: "topup", ...base };
}

export type { Period };
