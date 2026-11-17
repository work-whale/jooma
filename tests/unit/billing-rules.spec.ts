import { test, expect } from "@playwright/test";
import {
  planChangeKind,
  checkoutDiscount,
  offerAppliesTo,
  discountCodeFrom,
  topUpPackFor,
  planAfterStripeEvent,
} from "@/app/lib/billing-rules";

/*
 * Stripe decisions (plan 2e), pure so the webhook and checkout routes only
 * wire them up.
 *
 * Edge cases: the offer on Pro monthly only (not yearly, not Standard, not
 * Max); offer and ambassador code together give ONE discount; ?ref= is the
 * same as ?code=, junk codes are dropped; packs refused on Free and the trial
 * and for an unknown id; every route to Free; an unknown subscription status
 * never grants a plan.
 */

test.describe("plan changes", () => {
  test("kinds", () => {
    expect(planChangeKind("standard", "pro")).toBe("upgrade");
    expect(planChangeKind("pro", "max")).toBe("upgrade");
    expect(planChangeKind("max", "pro")).toBe("downgrade");
    expect(planChangeKind("pro", "standard")).toBe("downgrade");
    expect(planChangeKind("free", "pro")).toBe("start");
    expect(planChangeKind("pro_trial", "standard")).toBe("start");
    expect(planChangeKind("pro", "free")).toBe("to_free");
    expect(planChangeKind("pro_trial", "free")).toBe("to_free");
    expect(planChangeKind("pro", "pro")).toBe("same");
  });

  test("subscription deleted or unpaid moves to Free; active keeps the plan", () => {
    expect(planAfterStripeEvent({ type: "customer.subscription.deleted", plan: "pro", status: "canceled" })).toBe("free");
    expect(planAfterStripeEvent({ type: "customer.subscription.updated", plan: "pro", status: "unpaid" })).toBe("free");
    expect(planAfterStripeEvent({ type: "customer.subscription.updated", plan: "pro", status: "active" })).toBe("pro");
    // past_due keeps the plan while Stripe retries: P12 and E14 run meanwhile.
    expect(planAfterStripeEvent({ type: "customer.subscription.updated", plan: "max", status: "past_due" })).toBe("max");
    expect(planAfterStripeEvent({ type: "customer.subscription.updated", plan: "pro", status: "weird" })).toBe("free");
    expect(planAfterStripeEvent({ type: "customer.subscription.updated", plan: "gold", status: "active" })).toBe("free");
  });
});

test.describe("the offer and discounts", () => {
  test("PRO-HALF-FIRST-MONTH applies to Pro monthly and nothing else", () => {
    expect(offerAppliesTo("pro", "month")).toBe(true);
    expect(offerAppliesTo("pro", "year")).toBe(false);
    expect(offerAppliesTo("standard", "month")).toBe(false);
    expect(offerAppliesTo("max", "month")).toBe(false);
  });

  test("one discount only: an ambassador code beats the offer", () => {
    expect(
      checkoutDiscount({ plan: "pro", interval: "month", offerOpen: true, ambassadorCode: "MRSJ" }),
    ).toEqual({ kind: "ambassador", code: "MRSJ" });
  });

  test("the offer is used when it is open and fits", () => {
    expect(checkoutDiscount({ plan: "pro", interval: "month", offerOpen: true, ambassadorCode: null })).toEqual({
      kind: "offer",
      code: "PRO-HALF-FIRST-MONTH",
    });
    expect(checkoutDiscount({ plan: "pro", interval: "year", offerOpen: true, ambassadorCode: null })).toEqual({
      kind: "none",
    });
    expect(checkoutDiscount({ plan: "pro", interval: "month", offerOpen: false, ambassadorCode: null })).toEqual({
      kind: "none",
    });
  });

  test("?ref=CODE is an alias of ?code=; ?code= wins; junk is dropped", () => {
    expect(discountCodeFrom(new URLSearchParams("ref=mrsj"))).toBe("MRSJ");
    expect(discountCodeFrom(new URLSearchParams("code=abc&ref=mrsj"))).toBe("ABC");
    expect(discountCodeFrom(new URLSearchParams("ref=<script>"))).toBeNull();
    expect(discountCodeFrom(new URLSearchParams("ref="))).toBeNull();
    expect(discountCodeFrom(new URLSearchParams(`ref=${"A".repeat(41)}`))).toBeNull();
  });
});

test.describe("top-up packs", () => {
  test("Standard, Pro and Max may buy each pack", () => {
    for (const p of ["standard", "pro", "max"] as const) {
      expect(topUpPackFor(p, "pack-1500")).toMatchObject({ id: "pack-1500", resources: 1500, price: 5.99 });
    }
  });
  test("Free, the trial and unknown packs are refused", () => {
    expect(topUpPackFor("free", "pack-500")).toBeNull();
    expect(topUpPackFor("pro_trial", "pack-500")).toBeNull();
    expect(topUpPackFor("pro", "pack-99")).toBeNull();
    expect(topUpPackFor("pro", null)).toBeNull();
  });
});
