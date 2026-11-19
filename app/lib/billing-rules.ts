/*
 * The Stripe decisions of Jooma 4.5 (spec Step 4), pure so the webhook and the
 * checkout route only wire them up.
 *
 *   - customer.subscription.deleted, or a subscription Stripe has given up on,
 *     moves the account to Free with a fresh 50. past_due keeps the plan while
 *     Stripe retries; P12 and E14 run in that window.
 *   - Upgrades apply now (the allowance difference is added, see resources.ts);
 *     downgrades apply at the next refill.
 *   - One discount per checkout. The app adds PRO-HALF-FIRST-MONTH itself, for
 *     Pro monthly only; teachers never type it.
 *   - ?ref=CODE is an alias of ?code=CODE.
 *   - Top-up packs: Standard, Pro and Max only, and only the packs in config.
 */

import {
  OFFER,
  PLAN_CONFIG,
  TOP_UP_PACKS,
  topUpsAllowed,
  type AccountPlan,
  type TopUpPackId,
} from "@/app/lib/plan-config";

const PAID: readonly AccountPlan[] = ["standard", "pro", "max"];

function rank(plan: AccountPlan): number {
  return PAID.includes(plan) ? PLAN_CONFIG[plan as "standard" | "pro" | "max"].monthly : 0;
}

export type PlanChangeKind = "start" | "upgrade" | "downgrade" | "to_free" | "same";

export function planChangeKind(from: AccountPlan, to: AccountPlan): PlanChangeKind {
  if (from === to) return "same";
  if (to === "free") return "to_free";
  if (!PAID.includes(from)) return "start";
  return rank(to) > rank(from) ? "upgrade" : "downgrade";
}

/** Statuses under which a paid plan stays in force. */
const KEEPS_PLAN = new Set(["active", "trialing", "past_due"]);

/**
 * The plan to store after a subscription event. Anything Stripe reports that
 * is not clearly live (deleted, unpaid, incomplete_expired, an unknown status)
 * is Free: an unknown state must never grant a paid plan.
 */
export function planAfterStripeEvent(e: { type: string; plan: string; status: string }): AccountPlan {
  if (e.type === "customer.subscription.deleted") return "free";
  if (!PAID.includes(e.plan as AccountPlan)) return "free";
  return KEEPS_PLAN.has(e.status) ? (e.plan as AccountPlan) : "free";
}

export function offerAppliesTo(plan: string, interval: "month" | "year"): boolean {
  return plan === OFFER.plan && interval === OFFER.interval;
}

export type CheckoutDiscount =
  | { kind: "ambassador"; code: string }
  | { kind: "offer"; code: typeof OFFER.code }
  | { kind: "none" };

/**
 * Only one discount can apply. An ambassador code wins over the offer: both
 * halve the first month, and the code also pays the ambassador their
 * commission, which the offer would silently take away.
 */
export function checkoutDiscount(p: {
  plan: string;
  interval: "month" | "year";
  offerOpen: boolean;
  ambassadorCode: string | null;
}): CheckoutDiscount {
  if (p.ambassadorCode) return { kind: "ambassador", code: p.ambassadorCode };
  if (p.offerOpen && offerAppliesTo(p.plan, p.interval)) return { kind: "offer", code: OFFER.code };
  return { kind: "none" };
}

const CODE_SHAPE = /^[A-Z0-9_-]{1,40}$/;

/** The discount code from a signup or pricing link: ?code= first, then ?ref=. */
export function discountCodeFrom(params: URLSearchParams): string | null {
  const raw = (params.get("code") || params.get("ref") || "").trim().toUpperCase();
  return CODE_SHAPE.test(raw) ? raw : null;
}

/** The pack, if this plan may buy it. Re-checked on the server, always. */
export function topUpPackFor(plan: AccountPlan, packId: string | null | undefined) {
  if (!topUpsAllowed(plan) || !packId) return null;
  return TOP_UP_PACKS.find((p) => p.id === (packId as TopUpPackId)) ?? null;
}
