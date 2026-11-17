/*
 * What the pricing page and the in-app plan picker say (Jooma 4.5 spec Step 4),
 * built from plan-config so no screen restates a number.
 *
 * Pure: safe on the landing page, /pricing and the picker.
 */

import { PLAN_CONFIG, TOOL_BANDS, TRIAL, type AccountPlan } from "@/app/lib/plan-config";

export type Interval = "month" | "year";
type Paid = "standard" | "pro" | "max";
type ColumnId = "free" | Paid;

export const PRICING_HEADER_CTA = `Start with ${TRIAL.days} days of Pro free. No card.`;

/** After a signed-out "Choose X": signup first, then this one screen. */
export const SIGNED_OUT_CHOICE = {
  title: `Your ${TRIAL.days} free days of Pro are already on.`,
  body: "Want to pay for Pro now instead?",
  pay: "Pay for Pro now",
  later: "Use my free days first",
} as const;

const TOOL_COUNT = Object.keys(TOOL_BANDS).length;

const n = (v: number) => v.toLocaleString("en-GB");
const gbp = (v: number) => `£${v.toFixed(2)}`;

/** A yearly price as a monthly figure, truncated to the pence: £71.99 is £5.99. */
export function yearlyPerMonth(yearly: number): number {
  return Math.floor((yearly * 100) / 12) / 100;
}

/** What a year costs less than twelve monthly payments, in pounds. */
export function yearlySaving(plan: Paid): number {
  const p = PLAN_CONFIG[plan];
  return Math.round((p.monthly * 12 - p.yearly) * 100) / 100;
}

export interface PricingColumn {
  id: ColumnId;
  name: string;
  price: string;
  per: string;
  /** "or £71.99 a year, £5.99 a month", under a monthly price. */
  yearlyLine: string | null;
  cta: string;
  highlight: boolean;
  badge: string | null;
  tagline: string | null;
  features: string[];
}

const NAMES: Record<ColumnId, string> = { free: "Free", standard: "Standard", pro: "Pro", max: "Max" };

function features(id: ColumnId): string[] {
  const p = PLAN_CONFIG[id];
  const amount = id === "free" ? `${n(p.resources)} resources a week` : `${n(p.resources)} resources a month`;
  return [
    amount,
    `All ${TOOL_COUNT} tools`,
    p.pictures ? "Generated pictures in decks" : "Library photos in decks",
    p.exportMark ? "Small Jooma mark on exports" : "Clean exports, no Jooma mark",
    p.refinesPerWeek === null ? "Refine with Jo as often as you like" : `${p.refinesPerWeek} refines a week`,
    ...(p.topUps ? ["Top up whenever you need more"] : []),
  ];
}

export function pricingColumns(interval: Interval, opts: { phone?: boolean } = {}): PricingColumn[] {
  const order: ColumnId[] = opts.phone ? ["pro", "standard", "max", "free"] : ["free", "standard", "pro", "max"];
  return order.map((id) => {
    const p = PLAN_CONFIG[id];
    const badge = "badge" in p ? p.badge : null;
    const tagline = "tagline" in p ? p.tagline : null;
    if (id === "free") {
      return {
        id,
        name: NAMES[id],
        price: "£0",
        per: "for ever",
        yearlyLine: null,
        cta: "Start free",
        highlight: false,
        badge: null,
        tagline: null,
        features: features(id),
      };
    }
    const yearly = PLAN_CONFIG[id].yearly;
    const perMonth = yearlyPerMonth(yearly);
    return {
      id,
      name: NAMES[id],
      price: interval === "month" ? gbp(p.monthly) : gbp(perMonth),
      per: interval === "month" ? "a month" : `a month, billed ${gbp(yearly)} a year`,
      yearlyLine: interval === "month" ? `or ${gbp(yearly)} a year, ${gbp(perMonth)} a month` : null,
      cta: `Choose ${NAMES[id]}`,
      highlight: id === "pro",
      badge: badge ?? null,
      tagline: tagline ?? null,
      features: features(id),
    };
  });
}

/** Every upgrade button opens the picker on Pro, monthly. */
// The plan in force is taken so a future rule can depend on it; today it does not.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pickerDefaults(_from: AccountPlan): { plan: Paid; interval: Interval } {
  return { plan: "pro", interval: "month" };
}

/** One line on what changes against the plan in force now. */
export function pickerDiffLine(from: AccountPlan, to: Paid): string {
  if (from === to) return "This is your plan now.";
  const t = PLAN_CONFIG[to];
  const res = `${n(t.resources)} resources a month`;

  if (from === "pro_trial") {
    if (to === "standard") return `${res}, clean exports and library photos instead of generated pictures.`;
    return `Keeps generated pictures, clean exports and ${res}.`;
  }
  if (from === "free" || from === "school") {
    return t.pictures
      ? `Adds generated pictures, removes the Jooma mark and gives you ${res}.`
      : `Removes the Jooma mark and gives you ${res}.`;
  }

  const f = PLAN_CONFIG[from];
  if (t.resources > f.resources) {
    if (t.resources === f.resources * 2 && t.pictures && !f.pictures) {
      return "Doubles your resources and adds generated pictures.";
    }
    if (t.pictures && !f.pictures) return `Adds generated pictures and gives you ${res}.`;
    return `${res} instead of ${n(f.resources)}.`;
  }
  const lose = f.pictures && !t.pictures ? " and library photos instead of generated pictures" : "";
  return `${res}${lose}, from your next refill.`;
}
