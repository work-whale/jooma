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

/* ── The pricing page cards (screenshot 2, with the red notes) ────────────── */

export const PRICING_HEADLINE = "Start with ten days of Pro. No card, nothing to cancel.";
export const PRICING_SUBHEAD =
  "When the ten days are up your account moves to Free and keeps everything you made. Nobody gets locked out of their own work.";
export const PRICING_NOTE = {
  lead: "Prices include VAT.",
  body:
    `Every new account starts with ten days of Pro and ${n(TRIAL.resources)} resources, with no card needed. ` +
    `When the ten days end your account moves to Free with ${PLAN_CONFIG.free.resources} resources a week, ` +
    "and everything you have made stays in your library. Cancel a paid plan whenever you like.",
} as const;
export const SCHOOLS_ROW = {
  name: "Schools",
  per: "Priced by size, invoiced yearly",
  features: ["Resources pooled across staff", "Admin dashboard and usage", "One invoice, one renewal"],
  cta: "Talk to us",
} as const;

/** on: ticked. pic: ticked in orange (picture slides). off: a locked, greyed row. */
export type FeatureKind = "on" | "pic" | "off";

export interface PricingCard {
  id: ColumnId;
  name: string;
  tagline: string;
  price: string;
  per: string;
  note: string;
  cta: string;
  highlight: boolean;
  badge: string | null;
  features: { text: string; kind: FeatureKind }[];
}

const TAGLINES: Record<ColumnId, string> = {
  free: "For trying it properly, with no deadline",
  standard: "For one teacher, one class, every week",
  pro: "For the planning that eats your evenings",
  max: "For heads of department and heavy planners",
};

function cardFeatures(id: ColumnId): PricingCard["features"] {
  const p = PLAN_CONFIG[id];
  const on = (text: string) => ({ text, kind: "on" as const });
  const off = (text: string) => ({ text, kind: "off" as const });
  const pic = { text: "Picture slides in your decks", kind: "pic" as const };
  const clean = on("Clean exports, no Jooma mark");
  if (id === "free") {
    return [
      on(`${n(p.resources)} resources a week, refilled every Sunday`),
      on(`All ${TOOL_COUNT} tools, nothing held back`),
      on("Full curriculum alignment"),
      on(`${p.refinesPerWeek} refines a week with Jo`),
      off("Jooma mark on exports"),
      off("No picture slides"),
    ];
  }
  if (id === "max") return [on(`${n(p.resources)} resources a month`), pic, on("Everything in Pro")];
  const rows: PricingCard["features"] = [on(`${n(p.resources)} resources a month`)];
  if (id === "standard") rows.push(on(`All ${TOOL_COUNT} tools`), on("Full curriculum alignment"));
  if (p.pictures) rows.push(pic);
  rows.push(clean, on("Refining is always free"), on("Top up any time"));
  if (!p.pictures) rows.push(off("No picture slides"));
  return rows;
}

export function pricingCards(interval: Interval): PricingCard[] {
  return (["free", "standard", "pro", "max"] as const).map((id) => {
    const base = {
      id,
      name: NAMES[id],
      tagline: TAGLINES[id],
      highlight: id === "pro",
      badge: id === "pro" ? "Recommended" : null,
      features: cardFeatures(id),
    };
    if (id === "free") {
      return { ...base, price: "£0", per: "a month", note: "No card, no end date", cta: "Start free" };
    }
    const p = PLAN_CONFIG[id];
    const perMonth = yearlyPerMonth(p.yearly);
    return {
      ...base,
      price: interval === "month" ? gbp(p.monthly) : gbp(perMonth),
      per: "a month",
      note: interval === "month" ? `or ${gbp(p.yearly)} a year, ${gbp(perMonth)} a month` : `${gbp(p.yearly)} billed yearly`,
      cta: `Choose ${NAMES[id]}`,
    };
  });
}

/** The toggle's "Save up to N%": the best yearly saving, rounded. */
export function maxYearlySaving(): number {
  return Math.max(
    ...(["standard", "pro", "max"] as const).map((id) =>
      Math.round((yearlySaving(id) / (PLAN_CONFIG[id].monthly * 12)) * 100),
    ),
  );
}
