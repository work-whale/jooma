// The cancel flow: why a teacher is leaving, what we can offer them, and what
// they lose. Everything here is a decision or a sentence, never a request, so
// the routes, the page and tests/unit/cancel-flow.spec.ts all read the same
// answers. The flow itself is app/(app)/profile/cancel; the background is
// docs/JOOMA VERSION 3/12 jooma cancel flow notes.md.
//
// THE OFFER
// One retention discount, sized to the interval:
//
//   monthly  50% off, repeating for 3 months: the next three payments.
//   yearly   12.5% off the next renewal, once. A yearly plan has no monthly
//            payment to halve, so it gets the same value: half of 3 of 12
//            months. Taking 50% off the whole year is exactly what this avoids.
//
// The coupons are made by the code, on first use, under fixed ids, so there is
// nothing to set up in the Stripe dashboard and no environment variable. They
// carry no promotion code, so there is nothing a teacher could type or share:
// only the server, holding the secret key, can attach one.
//
// The cap is server side: one acceptance per account per 12 months, read from
// cancellation_events. Discounts do not stack, so a subscription that already
// carries one (an unspent ambassador code) is not offered another.
import { discountedPence } from "./ambassador-discount";
import { PLANS, planCredits, type BillingInterval, type PlanId } from "./plans";

// ── Reasons ──────────────────────────────────────────────────────────────────

export type CancelReason = "cost" | "other-tool" | "unused" | "term" | "missing" | "broke" | "school";

/** The screen after the reason. Pause is not offered, so "not using it" and
 *  "only this term" go to the discount with their own heading. */
export type OfferScreen = "offer" | "fix" | "schools";

export interface ReasonOption {
  id: CancelReason;
  label: string;
  screen: OfferScreen;
}

/** In the order shown. Matches the check constraint on cancellation_events. */
export const REASONS: readonly ReasonOption[] = [
  { id: "cost", label: "It costs too much", screen: "offer" },
  { id: "unused", label: "I'm not using it enough", screen: "offer" },
  { id: "term", label: "I only needed it for this term", screen: "offer" },
  { id: "missing", label: "Something I need is missing", screen: "fix" },
  { id: "broke", label: "Something went wrong", screen: "fix" },
  { id: "other-tool", label: "I've found something else", screen: "offer" },
  { id: "school", label: "My school is buying a licence", screen: "schools" },
];

export function asCancelReason(value: unknown): CancelReason | null {
  return REASONS.some((r) => r.id === value) ? (value as CancelReason) : null;
}

export function screenFor(reason: CancelReason): OfferScreen {
  return REASONS.find((r) => r.id === reason)!.screen;
}

/** The 2a heading, worded for the reason that led there. */
export function offerHeading(reason: CancelReason): string {
  switch (reason) {
    case "unused":
      return "Quiet spell? Keep it for less.";
    case "term":
      return "Back next term? Keep it for less.";
    case "other-tool":
      return "Before you switch, here is a better price.";
    default:
      return "Let us make it cheaper.";
  }
}

// ── Steps ────────────────────────────────────────────────────────────────────

/** Every screen, in the URL as ?step=. */
export type CancelStep = "reason" | OfferScreen | "lose" | "confirm" | "done" | "saved";

const STEPS: readonly CancelStep[] = [
  "reason", "offer", "fix", "schools", "lose", "confirm", "done", "saved",
];

/**
 * The screen to show for what the URL asks, so a typed or stale URL can never
 * skip the reason or show "cancelled" for a plan that is not:
 *
 *   - already ending: the cancelled screen (or saved, straight after a save);
 *   - not ending: never the cancelled screen. "done" when not ending means
 *     they have just renewed from it, so it reads as saved;
 *   - past the reason with no valid reason: back to the reason;
 *   - an offer screen that does not belong to the reason: the one that does.
 */
export function resolveStep(
  step: unknown,
  reason: CancelReason | null,
  ending: boolean,
): CancelStep {
  const asked = STEPS.includes(step as CancelStep) ? (step as CancelStep) : "reason";
  if (ending) return asked === "saved" ? "saved" : "done";
  if (asked === "done") return "saved";
  if (asked === "reason" || asked === "saved") return asked;
  if (!reason) return "reason";
  if (asked === "offer" || asked === "fix" || asked === "schools") return screenFor(reason);
  return asked;
}

/** "Step 2 of 4" for the screens that count towards leaving. */
export function stepNumber(step: CancelStep): number | null {
  if (step === "reason") return 1;
  if (step === "offer" || step === "fix" || step === "schools") return 2;
  if (step === "lose") return 3;
  if (step === "confirm") return 4;
  return null;
}

// ── Outcomes ─────────────────────────────────────────────────────────────────

export type CancelOutcome =
  | "discount"
  | "downgrade"
  | "switch_annual"
  | "kept_offer"
  | "kept_inventory"
  | "kept_confirm"
  | "support_message"
  | "schools_contact"
  | "cancelled";

/** The outcomes the browser may report itself. The rest are written by the
 *  route that did the thing (offer, cancel), never on the browser's word. */
export const REPORTABLE_OUTCOMES: readonly CancelOutcome[] = [
  "downgrade",
  "switch_annual",
  "kept_offer",
  "kept_inventory",
  "kept_confirm",
  "support_message",
  "schools_contact",
];

export function asReportableOutcome(value: unknown): CancelOutcome | null {
  return REPORTABLE_OUTCOMES.includes(value as CancelOutcome) ? (value as CancelOutcome) : null;
}

// ── Coupons ──────────────────────────────────────────────────────────────────

export interface RetentionCoupon {
  id: string;
  percentOff: number;
  duration: "repeating" | "once";
  durationInMonths?: number;
  name: string;
}

/** Fixed ids. A coupon cannot be edited in Stripe, so changing the offer means
 *  a new id (…-v2); discounts already given keep the old coupon. */
export const RETENTION_COUPONS: Record<BillingInterval, RetentionCoupon> = {
  month: {
    id: "jooma-retention-monthly-50-3m",
    percentOff: 50,
    duration: "repeating",
    durationInMonths: 3,
    name: "Half price for 3 months",
  },
  year: {
    id: "jooma-retention-yearly-12_5-once",
    percentOff: 12.5,
    duration: "once",
    name: "12.5% off your next renewal",
  },
};

export function isRetentionCouponId(id: string | null | undefined): boolean {
  return id === RETENTION_COUPONS.month.id || id === RETENTION_COUPONS.year.id;
}

/** The two Stripe calls ensureRetentionCoupon makes, so a test can stand in. */
export interface CouponClient {
  coupons: {
    retrieve(id: string): Promise<{ id: string }>;
    create(params: {
      id: string;
      percent_off: number;
      duration: "repeating" | "once";
      duration_in_months?: number;
      name: string;
      metadata: Record<string, string>;
    }): Promise<{ id: string }>;
  };
}

function stripeCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

/**
 * The coupon for this interval, made in Stripe the first time anyone needs it.
 *
 * Retrieve first; on resource_missing, create it under its fixed id. Two
 * teachers accepting at the same moment can both find it missing, and the
 * second create then fails with resource_already_exists, which means the first
 * one worked: retrieve again. Any other error is the caller's to report.
 */
export async function ensureRetentionCoupon(
  client: CouponClient,
  interval: BillingInterval,
): Promise<string> {
  const spec = RETENTION_COUPONS[interval];
  try {
    return (await client.coupons.retrieve(spec.id)).id;
  } catch (err) {
    if (stripeCode(err) !== "resource_missing") throw err;
  }
  try {
    const created = await client.coupons.create({
      id: spec.id,
      percent_off: spec.percentOff,
      duration: spec.duration,
      ...(spec.durationInMonths ? { duration_in_months: spec.durationInMonths } : {}),
      name: spec.name,
      metadata: { source: "cancel_flow" },
    });
    return created.id;
  } catch (err) {
    if (stripeCode(err) !== "resource_already_exists") throw err;
    return (await client.coupons.retrieve(spec.id)).id;
  }
}

// ── Eligibility ──────────────────────────────────────────────────────────────

/** Days the offer stays open after cancelling. Said on screen, so honoured. */
export const HELD_OFFER_DAYS = 14;

export interface OfferInput {
  plan: PlanId;
  interval: BillingInterval;
  /** A live Stripe subscription id on the profile. */
  hasSubscription: boolean;
  /** Stripe's status: only active and trialing can take a discount. */
  status: string | null;
  /** Already scheduled to end (cancel_at_period_end, or a future cancel_at). */
  ending: boolean;
  /** The subscription already carries a discount (an ambassador code). */
  hasDiscount: boolean;
  /** A downgrade or interval switch is waiting on a schedule. Its next phase
   *  would replace the discount, so taking one now would vanish at renewal. */
  hasPendingSchedule: boolean;
  /** Their latest `discount` row. */
  lastDiscountAt: Date | null;
  /** Their latest `cancelled` row, for the held offer. */
  cancelledAt: Date | null;
  now: Date;
}

export type OfferRefusal =
  | "no_subscription"
  | "not_self_serve"
  | "not_billing"
  | "has_discount"
  | "pending_change"
  | "recently_used"
  | "offer_expired";

export type OfferDecision =
  | { ok: true; interval: BillingInterval; coupon: RetentionCoupon }
  | { ok: false; why: OfferRefusal };

/** A date exactly 12 calendar months on. */
function twelveMonthsAfter(d: Date): Date {
  const next = new Date(d);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export function heldOfferUntil(cancelledAt: Date): Date {
  return new Date(cancelledAt.getTime() + HELD_OFFER_DAYS * 24 * 60 * 60 * 1000);
}

/** Whether the retention discount can be applied now, and which one. The same
 *  function decides whether the page shows it and whether the route applies
 *  it, so the two cannot disagree. */
export function offerFor(input: OfferInput): OfferDecision {
  if (!input.hasSubscription) return { ok: false, why: "no_subscription" };
  if (input.plan !== "standard" && input.plan !== "pro" && input.plan !== "max") {
    return { ok: false, why: "not_self_serve" };
  }
  if (input.status !== "active" && input.status !== "trialing") {
    return { ok: false, why: "not_billing" };
  }
  if (input.hasDiscount) return { ok: false, why: "has_discount" };
  if (input.hasPendingSchedule) return { ok: false, why: "pending_change" };
  if (input.lastDiscountAt && input.now < twelveMonthsAfter(input.lastDiscountAt)) {
    return { ok: false, why: "recently_used" };
  }
  if (input.ending) {
    // Ending is only a yes inside the held window, and only when we know when
    // they cancelled: an old portal cancellation has no row and no offer.
    if (!input.cancelledAt || input.now > heldOfferUntil(input.cancelledAt)) {
      return { ok: false, why: "offer_expired" };
    }
  }
  return { ok: true, interval: input.interval, coupon: RETENTION_COUPONS[input.interval] };
}

export const OFFER_REFUSAL_MESSAGE: Record<OfferRefusal, string> = {
  no_subscription: "There's no subscription to discount.",
  not_self_serve: "This plan can't take the discount.",
  not_billing: "Your subscription isn't billing right now, so the discount can't be added.",
  has_discount: "Your subscription already has a discount on it.",
  pending_change: "You have a plan change waiting, so the discount can't be added.",
  recently_used: "You've had this discount in the last 12 months.",
  offer_expired: "This offer has closed.",
};

// ── Money ────────────────────────────────────────────────────────────────────

function unitPence(plan: PlanId, interval: BillingInterval): number {
  const price = interval === "year" ? PLANS[plan].priceYearly : PLANS[plan].priceMonthly;
  return Math.round((price ?? 0) * 100);
}

export interface OfferMoney {
  /** One payment at full price. */
  fullPence: number;
  /** One discounted payment, as Stripe will charge it. */
  discountedPence: number;
  /** How many payments are discounted. */
  payments: number;
  /** The whole saving. */
  savedPence: number;
}

/** What the discount is worth, rounded the way Stripe rounds it (see
 *  discountedPence). */
export function offerMoney(plan: PlanId, interval: BillingInterval): OfferMoney {
  const coupon = RETENTION_COUPONS[interval];
  const full = unitPence(plan, interval);
  const discounted = discountedPence(full, { percentOff: coupon.percentOff });
  const payments = coupon.duration === "repeating" ? (coupon.durationInMonths ?? 1) : 1;
  return {
    fullPence: full,
    discountedPence: discounted,
    payments,
    savedPence: (full - discounted) * payments,
  };
}

export function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/** The offer in one line, e.g. "£3.99 a month for your next 3 months, instead
 *  of £7.99" or "£9.00 off your renewal on 3 March 2027". */
export function offerLine(plan: PlanId, interval: BillingInterval, renews: string | null): string {
  const m = offerMoney(plan, interval);
  if (interval === "year") {
    return `${gbp(m.savedPence)} off your renewal${renews ? ` on ${renews}` : ""}, so ${gbp(m.discountedPence)} instead of ${gbp(m.fullPence)}`;
  }
  return `${gbp(m.discountedPence)} a month for your next ${m.payments} months, instead of ${gbp(m.fullPence)}`;
}

/** The Overview's line for a retention discount already on the subscription. */
export function activeOfferLine(interval: BillingInterval): string {
  return interval === "year"
    ? `${RETENTION_COUPONS.year.percentOff}% off your next renewal, from the offer you accepted.`
    : `Half price for ${RETENTION_COUPONS.month.durationInMonths} months, from the offer you accepted.`;
}

// ── What you lose ────────────────────────────────────────────────────────────

export interface AccountSummary {
  plan: PlanId;
  /** current_period_end, formatted, or null if unknown. */
  periodEnd: string | null;
  trialing: boolean;
  resources: number;
  minutesSaved: number;
  badges: number;
  streak: number;
}

export interface InventoryTile {
  id: "resources" | "hours" | "badges" | "streak" | "credits" | "exports";
  figure: string;
  label: string;
  /** What happens to it, in a sentence. */
  fate: string;
  /** Kept is said in green, lost in orange. One honest reassurance makes the
   *  rest believable, so the kept tiles are not hidden. */
  tone: "kept" | "lost";
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

/**
 * The "what you lose" tiles, from the real account and the real locked state.
 *
 * Every fate is derived from PLANS.free, which is what the account becomes when
 * the period ends. Nothing is deleted on a schedule, so nothing here says it
 * is. An empty account shows fewer tiles rather than "0 badges".
 */
export function lossInventory(a: AccountSummary): InventoryTile[] {
  const locked = PLANS.free.limits;
  const until = a.periodEnd ? ` after ${a.periodEnd}` : "";
  const tiles: InventoryTile[] = [];

  if (a.resources > 0) {
    const canExport = locked.exportFormats.length > 0;
    tiles.push({
      id: "resources",
      figure: a.resources.toLocaleString("en-GB"),
      label: a.resources === 1 ? "resource you have made" : "resources you have made",
      fate: canExport
        ? `Kept. You can still open and export them${locked.watermark ? ", with a watermark" : ""}${
            locked.editableOutputs ? "" : ", but not edit them"
          }.`
        : `Kept, but you can't open them${until}.`,
      tone: "kept",
    });
  }

  const hours = Math.round(a.minutesSaved / 60);
  if (hours > 0) {
    tiles.push({
      id: "hours",
      figure: plural(hours, "hour", "hours"),
      label: "of planning saved",
      fate: "Yours. That doesn't go anywhere.",
      tone: "kept",
    });
  }

  if (a.badges > 0) {
    tiles.push({
      id: "badges",
      figure: plural(a.badges, "badge", "badges"),
      label: "earned",
      fate: "Kept. They stay on your profile.",
      tone: "kept",
    });
  }

  if (a.streak > 0) {
    tiles.push({
      id: "streak",
      figure: plural(a.streak, "day", "days"),
      label: "in your current streak",
      fate:
        locked.dailyGenerations === 0
          ? "Stops, because you can't make anything new without a plan."
          : "Carries on while you keep making things.",
      tone: locked.dailyGenerations === 0 ? "lost" : "kept",
    });
  }

  const credits = planCredits(a.plan);
  if (credits !== null && credits > 0) {
    tiles.push({
      id: "credits",
      figure: credits.toLocaleString("en-GB"),
      label: "credits a month",
      fate: `Stop${until}. Unused credits don't roll over.`,
      tone: "lost",
    });
  }

  if (!PLANS[a.plan].limits.watermark && locked.watermark) {
    tiles.push({
      id: "exports",
      figure: "Clean exports",
      label: "PowerPoint, Word and PDF with no watermark",
      fate: "Back to watermarked.",
      tone: "lost",
    });
  }

  return tiles;
}

export interface TimelineStep {
  when: string;
  what: string;
  tone: "now" | "later" | "kept";
}

/** "What happens, and when." Dated where we know the date. */
export function cancelTimeline(a: Pick<AccountSummary, "plan" | "periodEnd" | "trialing">): TimelineStep[] {
  const planName = PLANS[a.plan].name;
  const end = a.periodEnd ?? "the end of your billing period";
  return [
    {
      when: "Today",
      what: a.trialing
        ? `Nothing changes. You keep ${planName} until your free trial ends on ${end}, and you won't be charged.`
        : `Nothing changes. You keep ${planName} until ${end}, the end of the period you have paid for.`,
      tone: "now",
    },
    {
      when: a.periodEnd ? `${a.periodEnd}, when your plan ends` : "When your plan ends",
      what: "You can still sign in, open everything you have made and export it. You can't make or edit anything until you subscribe again.",
      tone: "later",
    },
    {
      when: "Any time after that",
      what: "Subscribe again and your library is there, exactly as you left it. Nothing is deleted unless you delete your account.",
      tone: "kept",
    },
  ];
}
