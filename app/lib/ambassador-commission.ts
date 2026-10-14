// What an ambassador earns, and when.
//
// Pure: no Stripe client and no database, so every rule is pinned by
// tests/unit/ambassador-commission.spec.ts. The webhook asks
// commissionForInvoice() whether a paid invoice earns anything; the admin
// console, the ambassador's own tabs, the invite page and the agreement all read
// the rates from AMBASSADOR_RATES, so no screen can promise a different number
// from the one that is paid.
//
// THE RULES
//
//   Monthly plans earn the monthly rate for every month the teacher pays, while
//   the ambassador's twelve-month agreement is live. A payment made after the
//   agreement ends earns nothing, even if the teacher keeps paying.
//
//   Yearly plans earn the yearly rate once, on their first payment (which may be
//   a switch from monthly to yearly part way through).
//
//   A free trial earns nothing until the first real payment. A discounted first
//   month still earns the full rate, as markReferralPaid already treats it: the
//   ambassador brought that subscriber in either way.
//
//   Each row is snapshotted with its amount when it is earned, so changing a
//   rate here only affects payments from then on.
import { PLANS, type BillingInterval } from "./plans";

export type CommissionPlan = "standard" | "pro" | "max";
export const COMMISSION_PLANS: CommissionPlan[] = ["standard", "pro", "max"];

export type CommissionKind = "recurring" | "annual" | "adjustment";
export type CommissionStatus = "unpaid" | "paid" | "reversed";

/** Pence. Monthly is per month paid; yearly is once. */
export const AMBASSADOR_RATES: Record<BillingInterval, Record<CommissionPlan, number>> = {
  month: { standard: 150, pro: 200, max: 400 },
  year: { standard: 1800, pro: 2400, max: 4800 },
};

/** Length of an ambassador agreement, and of their free Pro. */
export const AGREEMENT_MONTHS = 12;
/** A month's balance under this rolls into the next month. */
export const MIN_PAYOUT_PENCE = 2500;
/** Payouts go out on this day of the following month. */
export const PAYOUT_DAY = 15;
/** How long an invite link works for. */
export const INVITE_TTL_DAYS = 14;

export function isCommissionPlan(plan: unknown): plan is CommissionPlan {
  return plan === "standard" || plan === "pro" || plan === "max";
}

/** £1.50, £24.00. Always two decimal places, since these are amounts owed. */
export function gbp(pence: number): string {
  return (pence / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Earning ──────────────────────────────────────────────────────────────────

export interface InvoiceFacts {
  plan: string | null;
  interval: BillingInterval | null;
  /** Stripe's billing_reason. */
  billingReason: string | null;
  paidAt: Date;
  /** The GBP 0 invoice a free trial opens with (isTrialInvoice). */
  isTrial: boolean;
}

export interface AgreementFacts {
  approvedAt: Date | null;
  agreementEndsAt: Date | null;
  /** This teacher has already earned their yearly one-off. */
  hasAnnualAlready: boolean;
}

export interface Earned {
  kind: "recurring" | "annual";
  plan: CommissionPlan;
  interval: BillingInterval;
  amountPence: number;
}

/** Monthly billing earns on the first charge and on each renewal, never on a
 *  proration (an upgrade part way through a month is still the same month). */
const MONTHLY_REASONS = new Set(["subscription_create", "subscription_cycle"]);
/** A yearly plan's first payment can also be a switch from monthly, which
 *  Stripe bills as an update. The once-only rule stops it paying twice. */
const YEARLY_REASONS = new Set(["subscription_create", "subscription_cycle", "subscription_update"]);

/**
 * What, if anything, a paid invoice earns the ambassador who referred the
 * teacher. Null means nothing is owed.
 */
export function commissionForInvoice(inv: InvoiceFacts, agreement: AgreementFacts): Earned | null {
  if (inv.isTrial) return null;
  if (!isCommissionPlan(inv.plan)) return null;
  if (inv.interval !== "month" && inv.interval !== "year") return null;

  // No agreement means no commission. Ambassadors added before the v2 programme
  // have none and were paid under the old one-payout terms.
  if (!agreement.agreementEndsAt) return null;
  if (inv.paidAt.getTime() > agreement.agreementEndsAt.getTime()) return null;
  if (agreement.approvedAt && inv.paidAt.getTime() < agreement.approvedAt.getTime()) return null;

  const reason = inv.billingReason ?? "";

  if (inv.interval === "month") {
    if (!MONTHLY_REASONS.has(reason)) return null;
    return {
      kind: "recurring",
      plan: inv.plan,
      interval: "month",
      amountPence: AMBASSADOR_RATES.month[inv.plan],
    };
  }

  if (!YEARLY_REASONS.has(reason)) return null;
  if (agreement.hasAnnualAlready) return null;
  return {
    kind: "annual",
    plan: inv.plan,
    interval: "year",
    amountPence: AMBASSADOR_RATES.year[inv.plan],
  };
}

// ── Months ───────────────────────────────────────────────────────────────────
// A period is the first of a London month, as "YYYY-MM-01", which is how the
// database stores it (ambassador_period()).

export function periodOf(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}-01`;
}

export function addMonths(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Every period from `from` to `to` inclusive, newest first. */
export function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let p = to;
  while (p >= from && out.length < 240) {
    out.push(p);
    p = addMonths(p, -1);
  }
  return out;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "October 2026", or "October" with `withYear: false`. */
export function periodLabel(period: string, withYear = true): string {
  const [y, m] = period.split("-").map(Number);
  const name = MONTHS[(m - 1 + 12) % 12];
  return withYear ? `${name} ${y}` : name;
}

/** "Oct 2026". */
export function periodShort(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[(m - 1 + 12) % 12].slice(0, 3)} ${y}`;
}

/**
 * When a month's commission is paid: the 15th of the following month, or the
 * next weekday if that falls on a weekend. Bank holidays are not modelled; the
 * agreement covers them and payouts are made by hand.
 */
export function payoutDateFor(period: string): Date {
  const next = addMonths(period, 1);
  const [y, m] = next.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, PAYOUT_DAY, 12));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** UK tax year label for a date: "2026 to 2027" for 6 April 2026 onwards. */
export function taxYearOf(at: Date): string {
  const y = at.getUTCFullYear();
  const startsThisYear = at.getTime() >= Date.UTC(y, 3, 6);
  const start = startsThisYear ? y : y - 1;
  return `${start} to ${start + 1}`;
}

// ── Statements ───────────────────────────────────────────────────────────────

export interface LedgerRow {
  period: string;
  kind: CommissionKind;
  plan: string | null;
  billing_interval: string | null;
  amount_pence: number;
  status: CommissionStatus;
  paid_at: string | null;
}

export interface Statement {
  period: string;
  /** Earned that month, before adjustments. */
  commissionPence: number;
  /** Refunds taken back that month. Zero or negative. */
  adjustmentsPence: number;
  /** commission + adjustments. */
  netPence: number;
  /** How much of that has been marked paid. */
  paidPence: number;
  status: "paid" | "part_paid" | "due";
  /** When the last of it was marked paid. */
  paidOn: string | null;
}

/** One statement per month that has anything in it, newest first. Refunded
 *  rows are left out: they were never owed. */
export function statementsFrom(rows: LedgerRow[]): Statement[] {
  const by = new Map<string, Statement>();
  for (const r of rows) {
    if (r.status === "reversed") continue;
    const s =
      by.get(r.period) ??
      ({
        period: r.period,
        commissionPence: 0,
        adjustmentsPence: 0,
        netPence: 0,
        paidPence: 0,
        status: "due",
        paidOn: null,
      } as Statement);
    if (r.kind === "adjustment") s.adjustmentsPence += r.amount_pence;
    else s.commissionPence += r.amount_pence;
    s.netPence += r.amount_pence;
    if (r.status === "paid") {
      s.paidPence += r.amount_pence;
      if (r.paid_at && (!s.paidOn || r.paid_at > s.paidOn)) s.paidOn = r.paid_at;
    }
    by.set(r.period, s);
  }
  for (const s of by.values()) {
    const unpaid = rows.some(
      (r) => r.period === s.period && r.status === "unpaid",
    );
    const anyPaid = rows.some((r) => r.period === s.period && r.status === "paid");
    s.status = !unpaid ? "paid" : anyPaid ? "part_paid" : "due";
  }
  return [...by.values()].sort((a, b) => (a.period < b.period ? 1 : -1));
}

export interface NextPayout {
  /** Owed from months that have closed. */
  closedPence: number;
  /** Earned so far this month, still moving until the month ends. */
  runningPence: number;
  /** The month the next payment covers (this month). */
  period: string;
  /** When it leaves us, if it reaches the minimum. */
  payoutOn: Date;
  /** closed + running is under the minimum, so it rolls into next month. */
  rollsForward: boolean;
}

/**
 * The next payment. Anything owed from earlier months rides along with this
 * month's, and the whole balance rolls forward while it is under the £25
 * minimum (the agreement's clause on payment).
 */
export function nextPayout(rows: LedgerRow[], now: Date): NextPayout {
  const current = periodOf(now);
  let closed = 0;
  let running = 0;
  for (const r of rows) {
    if (r.status !== "unpaid") continue;
    if (r.period < current) closed += r.amount_pence;
    else running += r.amount_pence;
  }
  return {
    closedPence: closed,
    runningPence: running,
    period: current,
    payoutOn: payoutDateFor(current),
    rollsForward: closed + running < MIN_PAYOUT_PENCE,
  };
}

/** Under the minimum for one month, for the admin's "rolls forward" hint. */
export function belowMinimum(pence: number): boolean {
  return pence > 0 && pence < MIN_PAYOUT_PENCE;
}

/** Paid commission per UK tax year, newest first. */
export function taxYearTotals(rows: LedgerRow[]): { taxYear: string; paidPence: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "paid" || !r.paid_at) continue;
    const ty = taxYearOf(new Date(r.paid_at));
    by.set(ty, (by.get(ty) ?? 0) + r.amount_pence);
  }
  return [...by.entries()]
    .map(([taxYear, paidPence]) => ({ taxYear, paidPence }))
    .sort((a, b) => (a.taxYear < b.taxYear ? 1 : -1));
}

// ── The rate card against the plan's own price ───────────────────────────────

export interface RateShare {
  plan: CommissionPlan;
  priceMonthlyPence: number;
  priceYearlyPence: number;
  monthlyRatePence: number;
  yearlyRatePence: number;
  /** Commission as a share of that plan's price, monthly and yearly averaged. */
  sharePct: number;
}

export function rateShares(): RateShare[] {
  return COMMISSION_PLANS.map((plan) => {
    const monthly = Math.round((PLANS[plan].priceMonthly ?? 0) * 100);
    const yearly = Math.round((PLANS[plan].priceYearly ?? 0) * 100);
    const m = monthly ? AMBASSADOR_RATES.month[plan] / monthly : 0;
    const y = yearly ? AMBASSADOR_RATES.year[plan] / yearly : 0;
    return {
      plan,
      priceMonthlyPence: monthly,
      priceYearlyPence: yearly,
      monthlyRatePence: AMBASSADOR_RATES.month[plan],
      yearlyRatePence: AMBASSADOR_RATES.year[plan],
      sharePct: ((m + y) / 2) * 100,
    };
  });
}

// ── The worked example on the invite page ────────────────────────────────────

/** Teachers signed per month in the example. Sums to 1,000. */
export const EXAMPLE_INTAKE = [120, 30, 300, 90, 60, 150, 40, 80, 25, 45, 20, 40];
/** Monthly churn used by the "with real churn" view. */
export const EXAMPLE_CHURN = 0.04;

export interface ExampleMonth {
  month: number;
  signed: number;
  paying: number;
  earnedPence: number;
  cumulativePence: number;
  /** What that month's intake alone earns if they all stay to the end of the
   *  agreement. Shrinks each month, because the agreement ends at month 12. */
  intakeToEndPence: number;
  /** Paying teachers by intake month, for the stacked chart. */
  byIntake: number[];
}

/**
 * A thousand teachers on Pro monthly, arriving over the agreement's twelve
 * months. Arithmetic from the rate, not a forecast. Earnings stop when the
 * agreement does, so a teacher signed in month 12 pays the ambassador once.
 */
export function workedExample(churn: number): ExampleMonth[] {
  const rate = AMBASSADOR_RATES.month.pro;
  const cohorts: number[] = [];
  const out: ExampleMonth[] = [];
  let cumulative = 0;
  for (let i = 0; i < AGREEMENT_MONTHS; i++) {
    for (let c = 0; c < cohorts.length; c++) cohorts[c] = cohorts[c] * (1 - churn);
    const signed = EXAMPLE_INTAKE[i] ?? 0;
    cohorts.push(signed);
    const byIntake = cohorts.map((n) => Math.round(n));
    const paying = byIntake.reduce((a, b) => a + b, 0);
    const earned = paying * rate;
    cumulative += earned;
    out.push({
      month: i + 1,
      signed,
      paying,
      earnedPence: earned,
      cumulativePence: cumulative,
      intakeToEndPence: signed * rate * (AGREEMENT_MONTHS - i),
      byIntake,
    });
  }
  return out;
}
