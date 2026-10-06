import { test, expect } from "@playwright/test";
import { DEFAULT_INTERVAL, isBillingInterval, PLANS } from "@/app/lib/plans";
import {
  maxYearlySavingPercent,
  planCardPer,
  planCardPrice,
  planCardPricing,
  planTrialLine,
  planWasPrice,
  planYearlyNote,
  planYearlyPerMonth,
  planYearlySaving,
  yearlySavingPercent,
} from "@/app/lib/plan-copy";

/*
 * Yearly billing, as a card shows it.
 *
 * Every figure on a yearly card is derived from priceMonthly and priceYearly in
 * PLANS: the struck-through price (twelve monthly payments), what the yearly
 * price works out at each month, and the saving. Pinned here because a card
 * that claims a bigger saving than Stripe gives is the kind of mistake a
 * teacher notices on their statement.
 */

test.describe("yearly prices", () => {
  test("match the Stripe yearly prices", () => {
    expect(PLANS.standard.priceYearly).toBe(47.99);
    expect(PLANS.pro.priceYearly).toBe(71.99);
    expect(PLANS.max.priceYearly).toBe(143.99);
  });

  test("the stored per-month figure agrees with the yearly price", () => {
    for (const id of ["standard", "pro", "max"] as const) {
      // Rounded down, as the card shows it: £47.99 a year is £3.99 a month.
      const derived = Math.floor((PLANS[id].priceYearly! * 100) / 12) / 100;
      expect(PLANS[id].priceYearlyPerMonth).toBe(derived);
    }
  });

  test("the struck price is twelve monthly payments, to the penny", () => {
    // 4.99 * 12 is 59.879999… in floating point, which must not leak through.
    expect(planWasPrice("standard")).toBe("£59.88");
    expect(planWasPrice("pro")).toBe("£95.88");
    expect(planWasPrice("max")).toBe("£179.88");
  });

  test("each works out at a .99 figure a month, rounded down", () => {
    expect(planYearlyPerMonth("standard")).toBe("£3.99");
    expect(planYearlyPerMonth("pro")).toBe("£5.99");
    expect(planYearlyPerMonth("max")).toBe("£11.99");
    expect(planYearlyNote("pro")).toBe("Just £5.99 a month, billed yearly");
  });

  test("the saving is computed, never rounded up past what Stripe gives", () => {
    expect(yearlySavingPercent("standard")).toBe(20);
    expect(yearlySavingPercent("pro")).toBe(25);
    expect(yearlySavingPercent("max")).toBe(20);
    expect(planYearlySaving("pro")).toBe("Save 25%");
    expect(maxYearlySavingPercent(["standard", "pro", "max"])).toBe(25);
  });

  test("plans with no yearly price have no yearly copy", () => {
    for (const id of ["free", "school"] as const) {
      expect(planWasPrice(id)).toBeNull();
      expect(planYearlyNote(id)).toBeNull();
      expect(planYearlySaving(id)).toBeNull();
    }
  });
});

test.describe("the card at each interval", () => {
  test("yearly leads with the monthly figure, the yearly total under it", () => {
    expect(planCardPrice("standard", "year")).toBe("£47.99");
    expect(planCardPer("standard", "year")).toBe("a year");
    expect(planTrialLine("standard", "year")).toBe("3 days free, then £47.99 a year");
    expect(planCardPricing("standard", "year")).toEqual({
      price: "£3.99",
      per: "a month",
      was: "£4.99",
      saving: "Save 20%",
      note: "£47.99 billed yearly",
    });
  });

  test("monthly is exactly what it was before yearly existed", () => {
    expect(planCardPrice("pro")).toBe("£7.99");
    expect(planCardPer("pro")).toBe("a month");
    expect(planTrialLine("pro")).toBe("3 days free, then £7.99 a month");
    expect(planCardPricing("pro", "month")).toEqual({ price: "£7.99", per: "a month" });
  });

  test("School stays an enquiry whichever interval is chosen", () => {
    expect(planCardPrice("school", "year")).toBe("Talk to us");
    expect(planCardPer("school", "year")).toBe("Priced by size");
  });
});

test.describe("the interval itself", () => {
  test("choosers open on yearly", () => {
    expect(DEFAULT_INTERVAL).toBe("year");
  });

  test("only month and year are accepted from a request body", () => {
    expect(isBillingInterval("month")).toBe(true);
    expect(isBillingInterval("year")).toBe(true);
    for (const bad of ["week", "yearly", "", null, undefined, 12, { interval: "year" }]) {
      expect(isBillingInterval(bad)).toBe(false);
    }
  });
});
