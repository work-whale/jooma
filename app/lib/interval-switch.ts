// Switching a live subscription between monthly and yearly billing.
//
// Pure, with no Stripe client and no database, so every rule here is pinned by
// tests/unit/interval-switch.spec.ts rather than by a live subscription. The
// route that acts on the answer is app/api/stripe/switch-interval.
//
// THE TWO DIRECTIONS ARE NOT MIRROR IMAGES
//
// Monthly to yearly is like an upgrade: it happens now. Stripe moves the billing
// date to today, credits the unused part of the month, and charges the yearly
// price (sandbox: £71.99 less £7.99 unused = £64.00 for Pro).
//
// Yearly to monthly is like a downgrade: it happens at renewal. They have paid
// for a year, so they keep it, and monthly billing starts when it runs out. No
// refund to calculate, nothing taken away early.
//
// During the free trial neither direction charges anything, so both are an
// immediate price swap that keeps the trial's end date.
//
// WITH A PLAN CHANGE AT THE SAME TIME
// The profile's plan cards can show the other interval, so a teacher can pick,
// say, Pro yearly while on Standard monthly. The plan rule from the downgrade
// route wins first: a CHEAPER plan always waits for renewal, because its
// allowance cannot drop mid-month (see app/api/stripe/downgrade). Otherwise the
// interval decides, exactly as above: to yearly now, to monthly at renewal.
import type { BillingInterval } from "./plans";

/** How a switch is carried out. */
export type IntervalSwitchKind =
  /** Swap the price now and charge the prorated difference today. */
  | "now"
  /** Swap the price now, keep the trial, charge nothing. */
  | "trial"
  /** Park the new price on a schedule that starts at renewal. */
  | "at_renewal";

/** Why a switch is refused. */
export type IntervalSwitchRefusal =
  /** Already billed at that interval, on that plan. */
  | "same"
  /** Same interval, different plan: the upgrade and downgrade routes' job. */
  | "not_interval"
  /** The subscription has ended. */
  | "canceled"
  /** Cancelled but not yet ended: renewing comes first. */
  | "ending"
  /** A plan or billing change is already waiting on a schedule. */
  | "scheduled"
  /** Past due, incomplete, paused: anything not active or trialing. */
  | "inactive";

export type IntervalSwitchDecision =
  | { ok: true; kind: IntervalSwitchKind }
  | { ok: false; reason: IntervalSwitchRefusal };

/**
 * Decide whether, and how, a subscription can move to another interval.
 *
 * The refusals are checked in the order a teacher would need to resolve them:
 * an ended subscription cannot be renewed into a switch, a cancelling one must
 * be renewed first, and a waiting schedule must land or be undone before a
 * second change is stacked on it (Stripe allows one schedule per subscription,
 * and replacing it would silently drop the change already promised).
 */
export function intervalSwitchKind({
  from,
  to,
  status,
  cancelAtPeriodEnd,
  hasSchedule,
  planMove = "same",
}: {
  from: BillingInterval;
  to: BillingInterval;
  status: string | null | undefined;
  cancelAtPeriodEnd: boolean;
  hasSchedule: boolean;
  /** Whether the plan changes too, compared by monthly price. */
  planMove?: PlanMove;
}): IntervalSwitchDecision {
  if (from === to) {
    return { ok: false, reason: planMove === "same" ? "same" : "not_interval" };
  }
  if (status === "canceled") return { ok: false, reason: "canceled" };
  if (cancelAtPeriodEnd) return { ok: false, reason: "ending" };
  if (hasSchedule) return { ok: false, reason: "scheduled" };
  if (status !== "active" && status !== "trialing") return { ok: false, reason: "inactive" };
  // A cheaper plan waits for renewal, trial or not, as every downgrade does.
  if (planMove === "down") return { ok: true, kind: "at_renewal" };
  if (status === "trialing") return { ok: true, kind: "trial" };
  return { ok: true, kind: to === "year" ? "now" : "at_renewal" };
}

/** Which way a plan change goes, by monthly price. */
export type PlanMove = "same" | "up" | "down";

/** Compare two plans' monthly prices. Equal prices count as the same plan's
 *  rung, which only happens for the same plan. */
export function planMoveOf(fromMonthly: number, toMonthly: number): PlanMove {
  if (toMonthly > fromMonthly) return "up";
  if (toMonthly < fromMonthly) return "down";
  return "same";
}

/** What a teacher is told when a switch is refused. */
export function intervalSwitchRefusalMessage(reason: IntervalSwitchRefusal): string {
  switch (reason) {
    case "same":
      return "You're already billed that way.";
    case "not_interval":
      return "That's a plan change, not a billing change.";
    case "canceled":
      return "This subscription has ended. Please subscribe again.";
    case "ending":
      return "Your plan is set to end. Renew it first, then you can change how you're billed.";
    case "scheduled":
      return "You already have a change waiting. Undo it first, then try again.";
    case "inactive":
      return "Your last payment didn't go through. Update your card first, then try again.";
  }
}

/**
 * Whether a proration date sent back from the preview may be used.
 *
 * The preview stamps a proration date so the charge matches what the teacher
 * was shown to the penny (Stripe prorates to the second). It comes back through
 * the browser, so it is only trusted inside a short window: never in the
 * future, and never older than the preview could plausibly be. Anything else
 * is ignored and the switch prorates from now, which can only differ by pence.
 */
export function usableProrationDate(
  value: unknown,
  nowSeconds: number,
  maxAgeSeconds = 15 * 60,
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value > nowSeconds) return null;
  if (nowSeconds - value > maxAgeSeconds) return null;
  return value;
}
