import { test, expect } from "@playwright/test";
import {
  discountOfCoupon,
  discountOfPromotion,
  discountedPence,
} from "@/app/lib/ambassador-discount";
import {
  firstMonthPrice,
  firstPaymentCopy,
  planCardPricing,
  planTrialLine,
} from "@/app/lib/plan-copy";

/*
 * What a teacher sees once an ambassador code is applied: the first monthly
 * payment, with the full price struck beside it. The rounding has to be
 * Stripe's, or the card quotes a figure checkout does not charge.
 */

const HALF = { percentOff: 50 };

test.describe("Stripe's rounding", () => {
  // Measured with a test-mode invoice preview, October 2026: 499 -> 249,
  // 799 -> 399, 1499 -> 749. Stripe rounds the discount, halves up.
  test("50% off charges what Stripe charges", () => {
    expect(discountedPence(499, HALF)).toBe(249);
    expect(discountedPence(799, HALF)).toBe(399);
    expect(discountedPence(1499, HALF)).toBe(749);
  });

  test("an amount off never goes below zero", () => {
    expect(discountedPence(499, { amountOffPence: 200 })).toBe(299);
    expect(discountedPence(499, { amountOffPence: 9999 })).toBe(0);
  });

  test("coupons and promotion codes read as discounts", () => {
    expect(discountOfCoupon({ percent_off: 50, amount_off: null })).toEqual(HALF);
    expect(discountOfCoupon({ percent_off: null, amount_off: 300 })).toEqual({ amountOffPence: 300 });
    expect(discountOfCoupon(null)).toBeNull();
    expect(discountOfPromotion({ promotion: { coupon: { percent_off: 50 } } })).toEqual(HALF);
    expect(discountOfPromotion({ promotion: { coupon: "co_123" } })).toBeNull();
  });
});

test.describe("plan cards with a code", () => {
  test("monthly strikes the full price and shows the first payment", () => {
    expect(planCardPricing("pro", "month", HALF)).toEqual({
      price: "£3.99",
      per: "for your first month",
      was: "£7.99",
      note: "Then £7.99 a month",
    });
    expect(firstMonthPrice("standard", HALF)).toBe(2.49);
  });

  test("the trial line names the first payment, then the price after", () => {
    expect(planTrialLine("pro", "month", HALF)).toBe(
      "3 days free, then £3.99 for your first month, then £7.99 a month",
    );
  });

  test("yearly and no code are unchanged", () => {
    expect(planCardPricing("pro", "year", HALF)).toEqual(planCardPricing("pro", "year"));
    expect(planCardPricing("pro", "month", null)).toEqual({ price: "£7.99", per: "a month" });
    expect(planTrialLine("pro", "month")).toBe("3 days free, then £7.99 a month");
  });
});

test.describe("billing overview, first payment", () => {
  test("names the struck full price, the real first payment and the code", () => {
    expect(
      firstPaymentCopy({
        renews: "18 October 2026",
        fullPence: 499,
        nextPence: 249,
        interval: "month",
        code: "FAMFAMB",
      }),
    ).toEqual({
      lead: "Your free trial ends on 18 October 2026. First payment",
      was: "£4.99",
      now: "£2.49",
      tail: " with FAMFAMB, then £4.99 a month.",
    });
  });

  test("yearly says a year, and reads fine without a code", () => {
    const c = firstPaymentCopy({ renews: "1 May 2027", fullPence: 4799, nextPence: 4599, interval: "year" });
    expect(c.tail).toBe(", then £47.99 a year.");
  });
});
