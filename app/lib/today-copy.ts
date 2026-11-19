import { PLANS, planCredits, type PlanId } from "./plans";

/*
 * Two lines on the v4 Today page, pure so they can be tested.
 */

export interface PlanNudge {
  title: string;
  body: string;
  cta: string;
  price: string;
}

const gbp = (n: number) => `£${n.toFixed(2)}`;

/**
 * The card near the foot of Today, for a plan with somewhere to go.
 *
 * Standard only for now: no plan sees the locked card, and Pro and Max are
 * where we want teachers. Standard keeps clean exports (owner's note on the
 * 4.5 spec), so Pro is sold on resources, never on the Jooma mark.
 */
export function planNudge(plan: PlanId): PlanNudge | null {
  if (plan !== "standard") return null;
  const pro = (planCredits("pro") ?? 0).toLocaleString("en-GB");
  const std = (planCredits("standard") ?? 0).toLocaleString("en-GB");
  return {
    title: "A busy month coming up?",
    body: `Pro gives you ${pro} resources a month instead of ${std}, for a few pounds more.`,
    cta: "See Pro",
    price: `${gbp(PLANS.pro.priceMonthly ?? 0)} a month`,
  };
}
