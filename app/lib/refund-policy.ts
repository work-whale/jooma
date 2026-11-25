/*
 * The refund rules, from docs/18-jooma-refund-policy.html and the public page
 * at /refunds.
 *
 * This ADVISES. The admin refund modal shows what the policy allows for a
 * charge and suggests an amount; the server never refuses a refund on policy
 * grounds, because clause 9 says "write to us anyway" and a person decides.
 *
 * One place for the numbers: the page reads REFUND_WINDOWS too, so the
 * promise on the page and the check in the console cannot drift apart.
 *
 * Amounts are pence. Pure: every function takes `now`, no clock, no database,
 * safe in a client component.
 */

import { londonDate, londonTime } from "@/app/lib/resource-periods";

export const REFUND_WINDOWS = {
  /** Clauses 3 and 4: any monthly or yearly payment, no reason needed. */
  coolingOffDays: 14,
  /** Clause 6: a renewal they did not mean to pay, if the plan was not used. */
  unwantedRenewalDays: 30,
  /** Clause 5: a top up, while none of it is spent. */
  topUpDays: 14,
} as const;

export type RefundRule =
  | "cooling_off"
  | "unwanted_renewal"
  | "topup_unspent"
  | "yearly_unused_months"
  | "our_fault";

const RULES: readonly RefundRule[] = [
  "cooling_off",
  "unwanted_renewal",
  "topup_unspent",
  "yearly_unused_months",
  "our_fault",
];

export type Interval = "month" | "year";

export interface ChargeFacts {
  kind: "subscription" | "topup" | "other";
  interval: Interval | null;
  /** Stripe billing_reason: subscription_create, subscription_cycle, subscription_update. */
  reason: "first" | "renewal" | "change" | null;
  chargedAt: Date;
  amount: number;
  amountRefunded: number;
  /** End of the period this charge paid for. */
  periodEnd: Date | null;
  /** Resources spent since the charge. `null` means unknown, never zero. */
  spentSinceCharge: number | null;
  /** The pack bought, and what is left of the teacher's unspent top up pool now. */
  topUp: { units: number; left: number } | null;
}

export interface RefundOption {
  rule: RefundRule;
  clause: number;
  /** Pence the policy would refund. */
  amount: number;
  label: string;
  note?: string;
}

/**
 * The last instant of the window: 23:59:59.999 UK time on the calendar day
 * `days` after the charge's UK date. Not `chargedAt + days * 24h`: a charge at
 * 23:30 UTC in summer is already tomorrow in the UK, and a window that spans a
 * clock change is 23 or 25 hours long on one of its days.
 */
export function windowEnd(chargedAt: Date, days: number): Date {
  const { y, m, d } = londonDate(chargedAt);
  // londonTime has minute resolution; the rest of the last minute is added.
  return new Date(londonTime({ y, m, d: d + days }, 23, 59).getTime() + 59_999);
}

/**
 * Whole months from `now` to `periodEnd`, by UK calendar date. 20 Feb to 1 Jan
 * is 10, not 10.4: the policy refunds whole months only. Never negative.
 */
export function unusedWholeMonths(now: Date, periodEnd: Date): number {
  if (periodEnd.getTime() <= now.getTime()) return 0;
  const a = londonDate(now);
  const b = londonDate(periodEnd);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return Math.max(0, months);
}

/** The clause a rule sits under. Cooling off is clause 3 monthly, 4 yearly. */
export function clauseOf(rule: RefundRule, interval: Interval | null): number {
  switch (rule) {
    case "cooling_off":
      return interval === "year" ? 4 : 3;
    case "topup_unspent":
      return 5;
    case "unwanted_renewal":
      return 6;
    case "yearly_unused_months":
      return 4;
    case "our_fault":
      return 7;
  }
}

/**
 * What the policy would refund for this charge, best first. Empty when there
 * is nothing left to refund. The "our fault" option is always last and always
 * present while any money remains: it has no time limit.
 */
export function refundOptions(f: ChargeFacts, now: Date): RefundOption[] {
  const remaining = f.amount - f.amountRefunded;
  if (!(remaining > 0)) return [];

  const options: RefundOption[] = [];
  const at = now.getTime();
  const cooling = REFUND_WINDOWS.coolingOffDays;
  const inCooling = at <= windowEnd(f.chargedAt, cooling).getTime();

  if (f.kind === "subscription" && inCooling) {
    const clause = clauseOf("cooling_off", f.interval);
    options.push({
      rule: "cooling_off",
      clause,
      amount: remaining,
      label: `Within ${cooling} days of payment (clause ${clause})`,
    });
  }

  if (
    f.kind === "subscription" &&
    f.reason === "renewal" &&
    f.spentSinceCharge === 0 &&
    at <= windowEnd(f.chargedAt, REFUND_WINDOWS.unwantedRenewalDays).getTime()
  ) {
    options.push({
      rule: "unwanted_renewal",
      clause: 6,
      amount: remaining,
      label: `Unwanted renewal, plan unused, within ${REFUND_WINDOWS.unwantedRenewalDays} days (clause 6)`,
    });
  }

  if (
    f.kind === "topup" &&
    f.amountRefunded === 0 &&
    f.topUp !== null &&
    f.topUp.units > 0 &&
    f.topUp.left >= f.topUp.units &&
    at <= windowEnd(f.chargedAt, REFUND_WINDOWS.topUpDays).getTime()
  ) {
    options.push({
      rule: "topup_unspent",
      clause: 5,
      amount: remaining,
      label: `Unspent top up within ${REFUND_WINDOWS.topUpDays} days (clause 5)`,
    });
  }

  if (f.kind === "subscription" && f.interval === "year" && !inCooling && f.periodEnd && f.periodEnd.getTime() > at) {
    const months = unusedWholeMonths(now, f.periodEnd);
    if (months >= 1) {
      options.push({
        rule: "yearly_unused_months",
        clause: 4,
        amount: Math.min(remaining, Math.round((f.amount * months) / 12)),
        label: `Yearly plan, ${months} unused whole ${months === 1 ? "month" : "months"} (clause 4)`,
        note:
          "Only if they are leaving teaching or on long term leave, now covered by a school licence, " +
          "or made redundant. No evidence needed.",
      });
    }
  }

  options.push({
    rule: "our_fault",
    clause: 7,
    amount: remaining,
    label: "Our fault, no time limit (clause 7)",
    note: "Charged twice, charged after cancelling, a price they did not agree to, or Jooma broken for a meaningful stretch.",
  });

  return options;
}

/**
 * Whether the charge is inside one of the plain windows. The fault and
 * pro rata options need a person's judgement, so they do not count: a charge
 * with only those is "outside the windows" in the console.
 */
export function inPolicy(options: RefundOption[]): boolean {
  return options.some((o) => o.rule !== "our_fault" && o.rule !== "yearly_unused_months");
}

/** A value from a request body, or null. Anything but the five rules is null. */
export function parseRule(value: unknown): RefundRule | null {
  return typeof value === "string" && (RULES as readonly string[]).includes(value) ? (value as RefundRule) : null;
}

/** The audit log line: the rule's clause in front of the person's own words. */
export function auditReason(rule: RefundRule | null, interval: Interval | null, reason: string): string {
  return rule ? `Clause ${clauseOf(rule, interval)}: ${reason}` : reason;
}

/** What a charge was, in a few words, for the console. */
export function describeCharge(
  f: Pick<ChargeFacts, "kind" | "interval" | "reason">,
  planLabel: string | null,
  topUpUnits: number | null,
): string {
  if (f.kind === "topup") {
    return topUpUnits ? `Top up, ${topUpUnits.toLocaleString("en-GB")} resources` : "Top up";
  }
  if (f.kind === "other") return "Payment";
  const parts: string[] = [planLabel ?? "Subscription"];
  if (f.interval) parts.push(f.interval === "year" ? "yearly" : "monthly");
  if (f.reason) parts.push(f.reason === "first" ? "first payment" : f.reason === "renewal" ? "renewal" : "plan change");
  return parts.join(", ");
}

const WORDS: Record<number, string> = {
  7: "Seven",
  10: "Ten",
  14: "Fourteen",
  30: "Thirty",
};

/** A number of days as a sentence opening, so the page can say "Fourteen days"
 *  from the constant instead of typing it. Unknown numbers stay as digits. */
export function daysInWords(n: number): string {
  return WORDS[n] ?? String(n);
}

export interface PurchaseRow {
  user_id: string;
  units: number;
  created_at: string;
}

export interface GrantRow {
  id: string;
  user_id: string;
  kind: string;
  amount: number;
  granted_by: string | null;
  created_at: string;
}

/**
 * The one allowance grant a refunded top up created, or null.
 *
 * Same user, kind `resources_topup`, the pack's units, bought (granted_by is
 * null, so a goodwill grant from an admin is never taken back) and created
 * within 60 seconds of the purchase row. If several match, the closest in time.
 */
export function topUpGrantToReverse(purchase: PurchaseRow, grants: GrantRow[]): string | null {
  const bought = new Date(purchase.created_at).getTime();
  let best: { id: string; gap: number } | null = null;
  for (const g of grants) {
    if (g.user_id !== purchase.user_id) continue;
    if (g.kind !== "resources_topup") continue;
    if (g.amount !== purchase.units) continue;
    if (g.granted_by !== null) continue;
    const gap = Math.abs(new Date(g.created_at).getTime() - bought);
    if (!Number.isFinite(gap) || gap > 60_000) continue;
    if (!best || gap < best.gap) best = { id: g.id, gap };
  }
  return best ? best.id : null;
}

/** Stripe's invoice billing_reason as the policy sees it. Anything else
 *  (a manual or one off invoice, say) is null, and null earns no renewal rule. */
export function reasonFromBilling(billingReason: string | null | undefined): ChargeFacts["reason"] {
  if (billingReason === "subscription_create") return "first";
  if (billingReason === "subscription_cycle") return "renewal";
  if (billingReason === "subscription_update") return "change";
  return null;
}

/** A Stripe price's recurring interval. Weeks and days are not sold, so null. */
export function intervalFromStripe(interval: string | null | undefined): Interval | null {
  return interval === "month" || interval === "year" ? interval : null;
}
