import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REASONS,
  REPORTABLE_OUTCOMES,
  RETENTION_COUPONS,
  asCancelReason,
  asReportableOutcome,
  cancelTimeline,
  ensureRetentionCoupon,
  heldOfferUntil,
  isRetentionCouponId,
  lossInventory,
  offerFor,
  offerLine,
  offerMoney,
  resolveStep,
  screenFor,
  stepNumber,
  type AccountSummary,
  type CouponClient,
  type OfferInput,
} from "@/app/lib/cancel-flow";

/*
 * The cancel flow's decisions, every one of them pure.
 *
 * What the flow must never do is as important as what it does, so each
 * refusal has its own test: an offer that slips through here is real money,
 * and a screen that can be skipped is a broken promise on the forward link.
 * The Stripe side of each row is pinned against the sandbox in
 * tests/billing/cancel-flow.spec.ts.
 */

const NOW = new Date("2026-10-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const live: OfferInput = {
  plan: "pro",
  interval: "month",
  hasSubscription: true,
  status: "active",
  ending: false,
  hasDiscount: false,
  hasPendingSchedule: false,
  lastDiscountAt: null,
  cancelledAt: null,
  now: NOW,
};

test.describe("reasons and routing", () => {
  test("every reason routes to the screen in the notes", () => {
    expect(screenFor("cost")).toBe("offer");
    expect(screenFor("other-tool")).toBe("offer");
    // Pause is not offered, so these go to the discount too.
    expect(screenFor("unused")).toBe("offer");
    expect(screenFor("term")).toBe("offer");
    expect(screenFor("missing")).toBe("fix");
    expect(screenFor("broke")).toBe("fix");
    expect(screenFor("school")).toBe("schools");
  });

  test("the reasons match the database's check constraint exactly", () => {
    // A reason the table refuses would make the cancel itself fail at the
    // last step, which is the worst place for it.
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261027000000_cancel_flow.sql"),
      "utf8",
    );
    const reasonList = sql.match(/reason in \(([\s\S]*?)\)\)/)![1];
    const allowed = [...reasonList.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(REASONS.map((r) => r.id).sort()).toEqual(allowed);

    const outcomeList = sql.match(/outcome in \(([\s\S]*?)\)\)/)![1];
    const outcomes = [...outcomeList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const o of [...REPORTABLE_OUTCOMES, "discount", "cancelled"]) {
      expect(outcomes).toContain(o);
    }
  });

  test("only known reasons and browser-reportable outcomes are accepted", () => {
    expect(asCancelReason("cost")).toBe("cost");
    expect(asCancelReason("COST")).toBeNull();
    expect(asCancelReason("")).toBeNull();
    expect(asCancelReason(undefined)).toBeNull();
    expect(asReportableOutcome("kept_offer")).toBe("kept_offer");
    // The two outcomes the cap and the held offer read are never taken on the
    // browser's word.
    expect(asReportableOutcome("discount")).toBeNull();
    expect(asReportableOutcome("cancelled")).toBeNull();
    expect(asReportableOutcome("anything")).toBeNull();
  });
});

test.describe("which screen a URL gets", () => {
  test("the reason cannot be skipped", () => {
    for (const step of ["offer", "fix", "schools", "lose", "confirm"]) {
      expect(resolveStep(step, null, false)).toBe("reason");
    }
  });

  test("an offer screen that does not belong to the reason becomes the one that does", () => {
    expect(resolveStep("schools", "cost", false)).toBe("offer");
    expect(resolveStep("offer", "missing", false)).toBe("fix");
    expect(resolveStep("fix", "school", false)).toBe("schools");
  });

  test("a plan that is not ending is never shown as cancelled", () => {
    // Straight after renewing from the cancelled screen, it reads as saved.
    expect(resolveStep("done", "cost", false)).toBe("saved");
    expect(resolveStep("done", null, false)).toBe("saved");
  });

  test("an ending plan always lands on the cancelled screen, or saved", () => {
    expect(resolveStep("reason", null, true)).toBe("done");
    expect(resolveStep("confirm", "cost", true)).toBe("done");
    expect(resolveStep("saved", "cost", true)).toBe("saved");
  });

  test("rubbish in the URL starts at the reason", () => {
    expect(resolveStep("../../admin", null, false)).toBe("reason");
    expect(resolveStep(undefined, "cost", false)).toBe("reason");
  });

  test("four counted steps, no more", () => {
    expect(stepNumber("reason")).toBe(1);
    expect(stepNumber("offer")).toBe(2);
    expect(stepNumber("lose")).toBe(3);
    expect(stepNumber("confirm")).toBe(4);
    expect(stepNumber("done")).toBeNull();
  });
});

test.describe("who gets the offer", () => {
  test("monthly gets the 3 month coupon, yearly the once-off one", () => {
    const monthly = offerFor(live);
    expect(monthly).toMatchObject({ ok: true, interval: "month" });
    expect(monthly.ok && monthly.coupon.id).toBe("jooma-retention-monthly-50-3m");

    const yearly = offerFor({ ...live, interval: "year" });
    expect(yearly.ok && yearly.coupon.id).toBe("jooma-retention-yearly-12_5-once");
    // Never the repeating half price on a whole year.
    expect(yearly.ok && yearly.coupon.duration).toBe("once");
    expect(yearly.ok && yearly.coupon.percentOff).toBe(12.5);
  });

  test("trialing teachers get it on both intervals", () => {
    expect(offerFor({ ...live, status: "trialing" }).ok).toBe(true);
    expect(offerFor({ ...live, status: "trialing", interval: "year" }).ok).toBe(true);
  });

  test("Standard and Max get it as well as Pro", () => {
    expect(offerFor({ ...live, plan: "standard" }).ok).toBe(true);
    expect(offerFor({ ...live, plan: "max" }).ok).toBe(true);
  });

  const refusals: [string, Partial<OfferInput>, string][] = [
    ["no subscription", { hasSubscription: false }, "no_subscription"],
    ["no plan", { plan: "free" }, "not_self_serve"],
    ["the School plan", { plan: "school" }, "not_self_serve"],
    ["a past due subscription", { status: "past_due" }, "not_billing"],
    ["an unknown status", { status: null }, "not_billing"],
    ["a discount already on it", { hasDiscount: true }, "has_discount"],
    ["a plan change waiting", { hasPendingSchedule: true }, "pending_change"],
    ["already ending, with no record of when", { ending: true }, "offer_expired"],
  ];
  for (const [name, patch, why] of refusals) {
    test(`refused: ${name}`, () => {
      expect(offerFor({ ...live, ...patch })).toEqual({ ok: false, why });
    });
  }

  test("once per 12 months, to the day", () => {
    const at = (daysAgo: number) => offerFor({ ...live, lastDiscountAt: new Date(NOW.getTime() - daysAgo * DAY) });
    expect(at(0)).toEqual({ ok: false, why: "recently_used" });
    expect(at(364)).toEqual({ ok: false, why: "recently_used" });
    expect(at(366).ok).toBe(true);
  });

  test("the held offer after cancelling lasts 14 days", () => {
    const cancelled = (daysAgo: number) =>
      offerFor({ ...live, ending: true, cancelledAt: new Date(NOW.getTime() - daysAgo * DAY) });
    expect(cancelled(0).ok).toBe(true);
    expect(cancelled(13).ok).toBe(true);
    expect(cancelled(15)).toEqual({ ok: false, why: "offer_expired" });
    expect(heldOfferUntil(new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  test("the 12 month cap still applies inside the held window", () => {
    expect(
      offerFor({
        ...live,
        ending: true,
        cancelledAt: new Date(NOW.getTime() - DAY),
        lastDiscountAt: new Date(NOW.getTime() - 30 * DAY),
      }),
    ).toEqual({ ok: false, why: "recently_used" });
  });
});

test.describe("what the offer is worth", () => {
  // Worked by hand from Stripe's rule (round the discount, halves up), not
  // from discountedPence, so a change to that helper cannot pass by itself.
  const cases: [string, "standard" | "pro" | "max", "month" | "year", number, number, number][] = [
    ["Standard monthly", "standard", "month", 499, 249, 750],
    ["Pro monthly", "pro", "month", 799, 399, 1200],
    ["Max monthly", "max", "month", 1499, 749, 2250],
    ["Standard yearly", "standard", "year", 4799, 4199, 600],
    ["Pro yearly", "pro", "year", 7199, 6299, 900],
    ["Max yearly", "max", "year", 14399, 12599, 1800],
  ];
  for (const [name, plan, interval, full, discounted, saved] of cases) {
    test(name, () => {
      expect(offerMoney(plan, interval)).toEqual({
        fullPence: full,
        discountedPence: discounted,
        payments: interval === "month" ? 3 : 1,
        savedPence: saved,
      });
    });
  }

  test("the line on screen quotes those figures", () => {
    expect(offerLine("pro", "month", null)).toBe(
      "£3.99 a month for your next 3 months, instead of £7.99",
    );
    expect(offerLine("pro", "year", "3 March 2027")).toBe(
      "£9.00 off your renewal on 3 March 2027, so £62.99 instead of £71.99",
    );
  });
});

test.describe("the coupons", () => {
  test("both ids are recognised, and nothing else is", () => {
    expect(isRetentionCouponId(RETENTION_COUPONS.month.id)).toBe(true);
    expect(isRetentionCouponId(RETENTION_COUPONS.year.id)).toBe(true);
    expect(isRetentionCouponId("SAVE50")).toBe(false);
    expect(isRetentionCouponId(null)).toBe(false);
  });

  function client(opts: {
    exists?: boolean;
    createError?: string;
    retrieveError?: string;
  }) {
    const calls: { retrieve: string[]; create: unknown[] } = { retrieve: [], create: [] };
    let exists = opts.exists ?? false;
    const fake: CouponClient = {
      coupons: {
        async retrieve(id) {
          calls.retrieve.push(id);
          if (opts.retrieveError) throw Object.assign(new Error("boom"), { code: opts.retrieveError });
          if (!exists) throw Object.assign(new Error("No such coupon"), { code: "resource_missing" });
          return { id };
        },
        async create(params) {
          calls.create.push(params);
          if (opts.createError) {
            // A race: someone else made it a moment ago.
            if (opts.createError === "resource_already_exists") exists = true;
            throw Object.assign(new Error("create failed"), { code: opts.createError });
          }
          exists = true;
          return { id: params.id };
        },
      },
    };
    return { fake, calls };
  }

  test("an existing coupon is reused, never re-made", async () => {
    const { fake, calls } = client({ exists: true });
    expect(await ensureRetentionCoupon(fake, "month")).toBe(RETENTION_COUPONS.month.id);
    expect(calls.create).toHaveLength(0);
  });

  test("a missing coupon is made with the exact terms", async () => {
    const { fake, calls } = client({ exists: false });
    expect(await ensureRetentionCoupon(fake, "month")).toBe("jooma-retention-monthly-50-3m");
    expect(calls.create).toEqual([
      {
        id: "jooma-retention-monthly-50-3m",
        percent_off: 50,
        duration: "repeating",
        duration_in_months: 3,
        name: "Half price for 3 months",
        metadata: { source: "cancel_flow" },
      },
    ]);

    const yearly = client({ exists: false });
    await ensureRetentionCoupon(yearly.fake, "year");
    // A once-off coupon must not carry a month count.
    expect(yearly.calls.create).toEqual([
      {
        id: "jooma-retention-yearly-12_5-once",
        percent_off: 12.5,
        duration: "once",
        name: "12.5% off your next renewal",
        metadata: { source: "cancel_flow" },
      },
    ]);
  });

  test("losing the race to make it reads it back instead of failing", async () => {
    const { fake, calls } = client({ exists: false, createError: "resource_already_exists" });
    expect(await ensureRetentionCoupon(fake, "year")).toBe(RETENTION_COUPONS.year.id);
    expect(calls.retrieve).toHaveLength(2);
  });

  test("any other Stripe error is passed on, not swallowed", async () => {
    await expect(
      ensureRetentionCoupon(client({ retrieveError: "api_key_expired" }).fake, "month"),
    ).rejects.toThrow("boom");
    await expect(
      ensureRetentionCoupon(client({ exists: false, createError: "parameter_invalid" }).fake, "month"),
    ).rejects.toThrow("create failed");
  });
});

test.describe("what you lose", () => {
  const busy: AccountSummary = {
    plan: "pro",
    periodEnd: "2 November 2026",
    trialing: false,
    resources: 143,
    minutesSaved: 42 * 60,
    badges: 7,
    streak: 12,
  };

  test("a full account shows every tile, kept and lost said honestly", () => {
    const tiles = lossInventory(busy);
    const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
    expect(Object.keys(byId).sort()).toEqual(
      ["badges", "credits", "exports", "hours", "resources", "streak"],
    );
    expect(byId.resources.figure).toBe("143");
    expect(byId.resources.tone).toBe("kept");
    expect(byId.resources.fate).toBe("Kept. You can still open and export them, with a watermark, but not edit them.");
    expect(byId.hours.figure).toBe("42 hours");
    expect(byId.hours.tone).toBe("kept");
    expect(byId.badges.tone).toBe("kept");
    expect(byId.streak.tone).toBe("lost");
    expect(byId.credits.fate).toContain("after 2 November 2026");
    expect(byId.exports.fate).toBe("Back to watermarked.");
  });

  test("a brand new account shows fewer tiles, never a zero", () => {
    const tiles = lossInventory({ ...busy, resources: 0, minutesSaved: 0, badges: 0, streak: 0 });
    for (const t of tiles) expect(t.figure).not.toMatch(/^0\b/);
    expect(tiles.map((t) => t.id).sort()).toEqual(["credits", "exports"]);
  });

  test("Standard already has watermarks, so it loses no clean exports", () => {
    expect(lossInventory({ ...busy, plan: "standard" }).some((t) => t.id === "exports")).toBe(false);
  });

  test("one of anything is singular", () => {
    const tiles = lossInventory({ ...busy, resources: 1, minutesSaved: 60, badges: 1, streak: 1 });
    const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
    expect(byId.resources.label).toBe("resource you have made");
    expect(byId.hours.figure).toBe("1 hour");
    expect(byId.badges.figure).toBe("1 badge");
    expect(byId.streak.figure).toBe("1 day");
  });

  test("nothing on the screen claims a deletion that does not happen", () => {
    const words = [
      ...lossInventory(busy).map((t) => t.fate),
      ...cancelTimeline(busy).map((s) => s.what),
    ].join(" ");
    expect(words).not.toMatch(/\bdeleted (after|on|in)\b/i);
    expect(words).not.toMatch(/\bwill be deleted\b/i);
    expect(words).toContain("Nothing is deleted unless you delete your account");
  });

  test("a trial says it will not be charged", () => {
    const [today] = cancelTimeline({ ...busy, trialing: true });
    expect(today.what).toContain("won't be charged");
    expect(cancelTimeline(busy)[0].what).not.toContain("won't be charged");
  });
});
