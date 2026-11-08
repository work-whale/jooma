import { test, expect } from "@playwright/test";
import {
  TRIAL_OFFER_COUPON,
  TRIAL_OFFER_DISCOUNT,
  betterFirstMonthDiscount,
  countdownParts,
  ensureTrialOfferCoupon,
  shortCountdown,
  trialOfferApplies,
  trialOfferExpiredAt,
  trialOfferFor,
  type TrialOfferRow,
} from "@/app/lib/trial-offer";
import { accountAccess, type AccessRow } from "@/app/lib/account-access";
import { planBadgeFor } from "@/app/lib/plan-badge";
import { planCardPricing, planChargeLine } from "@/app/lib/plan-copy";
import type { CouponClient } from "@/app/lib/cancel-flow";

/*
 * The end-of-trial offer: 50% off the first monthly payment, open for 7 days
 * after a no-card trial ends.
 *
 * Edge cases this is written against:
 *   - the window's two edges: the moment the trial ends (open) and the moment
 *     the offer ends (closed), and the trial still running (not yet)
 *   - everyone it must never reach: paid before, a live subscription, an admin,
 *     no offer date at all (the SQL withholds it), a date that does not parse
 *   - yearly checkouts, where a "once" coupon would halve a whole year
 *   - the price shown matching what Stripe charges (rounding of 499p)
 *   - the coupon being made once, under a race, and real errors not swallowed
 *   - the sidebar saying "trial", then "offer", then nothing
 */

const NOW = new Date("2026-11-10T12:00:00Z");
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const offerRow = (over: Partial<TrialOfferRow> = {}): TrialOfferRow => ({
  is_admin: false,
  has_paid: false,
  stripe_subscription_id: null,
  trial_ends_at: at(-24), // ended yesterday
  trial_offer_ends_at: at(6 * 24), // six days left
  ...over,
});

test.describe("trialOfferFor: the window", () => {
  test("open after the trial, with the time left", () => {
    const o = trialOfferFor(offerRow(), NOW);
    expect(o).not.toBeNull();
    expect(o!.endsAt.toISOString()).toBe(at(144));
    expect(o!.msLeft).toBe(144 * 3_600_000);
  });

  test("not while the trial is still running", () => {
    expect(trialOfferFor(offerRow({ trial_ends_at: at(2) }), NOW)).toBeNull();
  });

  test("open at the exact moment the trial ends", () => {
    expect(trialOfferFor(offerRow({ trial_ends_at: at(0) }), NOW)).not.toBeNull();
  });

  test("closed at the exact moment the offer ends, open a second before", () => {
    expect(trialOfferFor(offerRow({ trial_offer_ends_at: at(0) }), NOW)).toBeNull();
    const second = new Date(NOW.getTime() + 1000).toISOString();
    expect(trialOfferFor(offerRow({ trial_offer_ends_at: second }), NOW)?.msLeft).toBe(1000);
  });
});

test.describe("trialOfferFor: who never gets it", () => {
  for (const [name, over] of [
    ["someone who has paid before", { has_paid: true }],
    ["someone with a subscription", { stripe_subscription_id: "sub_123" }],
    ["an admin", { is_admin: true }],
    ["a row with no offer date (withheld by the SQL)", { trial_offer_ends_at: null }],
    ["a row with no trial end", { trial_ends_at: null }],
    ["a date that does not parse", { trial_offer_ends_at: "not a date" }],
    ["a row from before the migration (columns absent)", { trial_ends_at: undefined, trial_offer_ends_at: undefined }],
  ] as [string, Partial<TrialOfferRow>][]) {
    test(name, () => {
      expect(trialOfferFor(offerRow(over), NOW)).toBeNull();
    });
  }
});

test.describe("trialOfferExpiredAt", () => {
  test("null while the offer is open", () => {
    expect(trialOfferExpiredAt(offerRow(), NOW)).toBeNull();
  });
  test("the end date once it has passed", () => {
    expect(trialOfferExpiredAt(offerRow({ trial_offer_ends_at: at(-1) }), NOW)?.toISOString()).toBe(at(-1));
  });
  test("null for someone who paid, even after the date", () => {
    expect(trialOfferExpiredAt(offerRow({ trial_offer_ends_at: at(-1), has_paid: true }), NOW)).toBeNull();
  });
});

test.describe("monthly only", () => {
  test("applies to a monthly checkout, never a yearly one", () => {
    const o = trialOfferFor(offerRow(), NOW);
    expect(trialOfferApplies(o, "month")).toBe(true);
    expect(trialOfferApplies(o, "year")).toBe(false);
    expect(trialOfferApplies(null, "month")).toBe(false);
  });
});

test.describe("what the cards and charge lines say", () => {
  // Stripe rounds the discount half up: 50% of 499p is 250p off, 249p charged.
  test("Standard monthly: £2.49 first month, £4.99 struck", () => {
    const p = planCardPricing("standard", "month", TRIAL_OFFER_DISCOUNT);
    expect(p.price).toBe("£2.49");
    expect(p.was).toBe("£4.99");
    expect(p.per).toBe("for your first month");
    expect(planChargeLine("standard", "month", TRIAL_OFFER_DISCOUNT)).toBe(
      "You will be charged £2.49 today, then £4.99 a month",
    );
  });

  test("Pro and Max are halved the same way", () => {
    expect(planCardPricing("pro", "month", TRIAL_OFFER_DISCOUNT).price).toBe("£3.99");
    expect(planCardPricing("max", "month", TRIAL_OFFER_DISCOUNT).price).toBe("£7.49");
  });

  test("yearly cards ignore it", () => {
    // A yearly card has its own struck monthly price (the yearly saving), so
    // what matters is that the offer changes nothing on it.
    for (const plan of ["standard", "pro", "max"] as const) {
      expect(planCardPricing(plan, "year", TRIAL_OFFER_DISCOUNT)).toEqual(planCardPricing(plan, "year"));
      expect(planChargeLine(plan, "year", TRIAL_OFFER_DISCOUNT)).toBe(planChargeLine(plan, "year"));
    }
  });
});

test.describe("countdowns", () => {
  test("short form for the sidebar and the chip", () => {
    expect(shortCountdown((3 * 24 + 4) * 3_600_000 + 59_000)).toBe("3d 4h");
    expect(shortCountdown(4 * 3_600_000 + 12 * 60_000)).toBe("4h 12m");
    expect(shortCountdown(12 * 60_000 + 30_000)).toBe("12m");
  });

  test("the last minute reads 1m, never 0m", () => {
    expect(shortCountdown(10_000)).toBe("1m");
  });

  test("parts never go negative", () => {
    expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(countdownParts(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
  });
});

test.describe("ensureTrialOfferCoupon", () => {
  const stripeError = (code: string) => Object.assign(new Error(code), { code });

  function client(state: "exists" | "missing" | "race" | "broken") {
    const calls: { create: unknown[] } = { create: [] };
    let made = state === "exists";
    const fake: CouponClient = {
      coupons: {
        async retrieve(id) {
          if (state === "broken") throw stripeError("api_error");
          if (!made) throw stripeError("resource_missing");
          return { id };
        },
        async create(params) {
          calls.create.push(params);
          if (state === "race") {
            made = true;
            throw stripeError("resource_already_exists");
          }
          made = true;
          return { id: params.id };
        },
      },
    };
    return { fake, calls };
  }

  test("an existing coupon is reused, nothing made", async () => {
    const { fake, calls } = client("exists");
    expect(await ensureTrialOfferCoupon(fake)).toBe(TRIAL_OFFER_COUPON.id);
    expect(calls.create).toHaveLength(0);
  });

  test("a missing coupon is made with the exact terms: 50%, once", async () => {
    const { fake, calls } = client("missing");
    expect(await ensureTrialOfferCoupon(fake)).toBe("jooma-trial-end-50-once");
    expect(calls.create).toEqual([
      {
        id: "jooma-trial-end-50-once",
        percent_off: 50,
        duration: "once",
        name: "Half price first month",
        metadata: { source: "trial_offer" },
      },
    ]);
  });

  test("losing a race to make it still returns it", async () => {
    const { fake } = client("race");
    expect(await ensureTrialOfferCoupon(fake)).toBe(TRIAL_OFFER_COUPON.id);
  });

  test("any other Stripe error is the caller's to handle", async () => {
    const { fake } = client("broken");
    await expect(ensureTrialOfferCoupon(fake)).rejects.toThrow("api_error");
  });
});

test.describe("accountAccess carries the offer", () => {
  const row = (over: Partial<AccessRow> = {}): AccessRow => ({
    plan: "free",
    is_admin: false,
    subscription_status: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    free_trial_started_at: at(-4 * 24),
    has_paid: false,
    had_ambassador_pro: false,
    had_review_trial: false,
    free_tries_used: 0,
    trial_ends_at: at(-24),
    trial_offer_ends_at: at(6 * 24),
    ...over,
  });

  test("a tidied, ended trial is locked with the offer open", () => {
    const a = accountAccess(row(), NOW);
    expect(a.state).toBe("locked");
    expect(a.hadTrial).toBe(true);
    expect(a.trialOffer?.endsAt.toISOString()).toBe(at(144));
    expect(a.trialOfferExpiredAt).toBeNull();
  });

  test("a running trial has no offer yet", () => {
    const a = accountAccess(
      row({
        plan: "standard",
        subscription_status: "trialing",
        current_period_end: at(24),
        trial_ends_at: at(24),
        trial_offer_ends_at: at(8 * 24),
      }),
      NOW,
    );
    expect(a.state).toBe("trial");
    expect(a.trialOffer).toBeNull();
  });

  test("a lapsed customer never sees it", () => {
    const a = accountAccess(row({ has_paid: true }), NOW);
    expect(a.trialOffer).toBeNull();
    expect(a.lapsed).toBe(true);
  });

  test("after the window it is reported as expired, once", () => {
    const a = accountAccess(row({ trial_offer_ends_at: at(-2) }), NOW);
    expect(a.trialOffer).toBeNull();
    expect(a.trialOfferExpiredAt?.toISOString()).toBe(at(-2));
  });
});

test.describe("the sidebar plan card", () => {
  const d = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

  test("in the trial: Free trial, days left, a trial clock", () => {
    const b = planBadgeFor("standard", null, NOW, {
      trialEndsAt: d(30),
      trialStartedAt: d(-42),
      offerEndsAt: null,
    });
    expect(b.label).toBe("Free trial");
    expect(b.note).toBe("2 days left of your free trial");
    expect(b.cta.label).toBe("Choose a plan");
    expect(b.countdown?.kind).toBe("trial");
  });

  test("the last hours of the trial still say 1 day", () => {
    const b = planBadgeFor("standard", null, NOW, { trialEndsAt: d(3), offerEndsAt: null });
    expect(b.note).toBe("1 day left of your free trial");
  });

  test("after the trial, with the offer open: claim it, an offer clock", () => {
    const b = planBadgeFor("free", null, NOW, { trialEndsAt: null, offerEndsAt: d(100) });
    expect(b.label).toBe("No plan");
    expect(b.cta.label).toBe("Claim 50% off");
    expect(b.countdown).toEqual({ kind: "offer", endsAt: d(100) });
  });

  test("once the offer has gone: the ordinary card, no clock", () => {
    const b = planBadgeFor("free", null, NOW, { trialEndsAt: null, offerEndsAt: d(-1) });
    expect(b.cta.label).toBe("Choose a plan");
    expect(b.countdown).toBeNull();
  });

  test("a paying teacher never sees an offer clock, whatever is passed", () => {
    const b = planBadgeFor("pro", null, NOW, { trialEndsAt: null, offerEndsAt: d(100) });
    expect(b.label).toBe("Pro");
    expect(b.countdown).toBeNull();
  });

  test("no trial status at all leaves the card exactly as before", () => {
    expect(planBadgeFor("free", null, NOW, null)).toEqual(planBadgeFor("free", null, NOW));
  });
});

test.describe("the offer and an ambassador code: the bigger saving wins", () => {
  // Standard, 499p. The offer charges 249p.
  const STD = 499;

  test("a smaller code loses to the offer", () => {
    expect(betterFirstMonthDiscount(STD, true, { percentOff: 20 })).toBe("offer");
    expect(betterFirstMonthDiscount(STD, true, { amountOffPence: 100 })).toBe("offer");
  });

  test("a bigger code wins: percent or fixed", () => {
    expect(betterFirstMonthDiscount(STD, true, { percentOff: 100 })).toBe("code");
    // £3 off leaves 199p, under the offer's 249p.
    expect(betterFirstMonthDiscount(STD, true, { amountOffPence: 300 })).toBe("code");
  });

  test("a tie goes to the code the teacher chose", () => {
    expect(betterFirstMonthDiscount(STD, true, { percentOff: 50 })).toBe("code");
  });

  test("a fixed code can win on one plan and lose on another", () => {
    // £3 off Standard (499p -> 199p) beats half price; on Max (1499p -> 1199p) it does not.
    expect(betterFirstMonthDiscount(499, true, { amountOffPence: 300 })).toBe("code");
    expect(betterFirstMonthDiscount(1499, true, { amountOffPence: 300 })).toBe("offer");
  });

  test("only one of them, or neither", () => {
    expect(betterFirstMonthDiscount(STD, true, null)).toBe("offer");
    expect(betterFirstMonthDiscount(STD, false, { percentOff: 20 })).toBe("code");
    expect(betterFirstMonthDiscount(STD, false, null)).toBeNull();
  });
});
