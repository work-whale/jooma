import { test, expect } from "@playwright/test";
import {
  pricingColumns,
  yearlyPerMonth,
  yearlySaving,
  pickerDefaults,
  pickerDiffLine,
  PRICING_HEADER_CTA,
  SIGNED_OUT_CHOICE,
} from "@/app/lib/pricing-view";

/*
 * Pricing page and plan picker content (plan 2g), from plan-config only.
 *
 * Edge cases: yearly per month TRUNCATES to the spec's figures (£71.99 is
 * £5.99, not £6.00); desktop and phone orders; Pro is the only highlighted
 * column; Max's Stage 2 price is £13.99; no "3 days" or "credits" anywhere;
 * the picker opens on Pro monthly whatever the current plan; diff lines for
 * every from and to, including choosing the plan you are already on.
 */

test.describe("pricing columns", () => {
  test("desktop: Free, Standard, Pro, Max; phones: Pro, Standard, Max, Free", () => {
    expect(pricingColumns("month").map((c) => c.id)).toEqual(["free", "standard", "pro", "max"]);
    expect(pricingColumns("month", { phone: true }).map((c) => c.id)).toEqual(["pro", "standard", "max", "free"]);
  });

  test("Pro alone is highlighted and Recommended; Max has its tagline", () => {
    const cols = pricingColumns("month");
    expect(cols.filter((c) => c.highlight).map((c) => c.id)).toEqual(["pro"]);
    expect(cols.find((c) => c.id === "pro")!.badge).toBe("Recommended");
    expect(cols.find((c) => c.id === "max")!.tagline).toBe("For heads of department and heavy planners");
  });

  test("buttons", () => {
    const cta = Object.fromEntries(pricingColumns("month").map((c) => [c.id, c.cta]));
    expect(cta).toEqual({ free: "Start free", standard: "Choose Standard", pro: "Choose Pro", max: "Choose Max" });
  });

  test("monthly prices, with the yearly line under each paid one", () => {
    const pro = pricingColumns("month").find((c) => c.id === "pro")!;
    expect(pro.price).toBe("£7.99");
    expect(pro.per).toBe("a month");
    expect(pro.yearlyLine).toBe("or £71.99 a year, £5.99 a month");
    expect(pricingColumns("month").find((c) => c.id === "max")!.price).toBe("£13.99");
    expect(pricingColumns("month").find((c) => c.id === "free")!.yearlyLine).toBeNull();
  });

  test("yearly toggle shows the per month figure", () => {
    const std = pricingColumns("year").find((c) => c.id === "standard")!;
    expect(std.price).toBe("£3.99");
    expect(std.per).toBe("a month, billed £47.99 a year");
  });

  test("resources lines, never credits", () => {
    const text = JSON.stringify(pricingColumns("month"));
    expect(text).toContain("50 resources a week");
    expect(text).toContain("1,000 resources a month");
    expect(text).not.toMatch(/credit|3 days|–|—/i);
  });

  test("header button", () => {
    expect(PRICING_HEADER_CTA).toBe("Start with 10 days of Pro free. No card.");
  });
});

test.describe("yearly maths", () => {
  test("per month truncates to the pence the spec shows", () => {
    expect(yearlyPerMonth(71.99)).toBe(5.99);
    expect(yearlyPerMonth(47.99)).toBe(3.99);
    expect(yearlyPerMonth(143.99)).toBe(11.99);
  });
  test("saving against twelve monthly payments", () => {
    expect(yearlySaving("pro")).toBe(23.89);
    expect(yearlySaving("standard")).toBe(11.89);
  });
});

test.describe("the plan picker", () => {
  test("opens on Pro, monthly, whoever opens it", () => {
    for (const from of ["free", "pro_trial", "standard"] as const) {
      expect(pickerDefaults(from)).toEqual({ plan: "pro", interval: "month" });
    }
  });

  test("one line on what changes", () => {
    expect(pickerDiffLine("free", "pro")).toBe(
      "Adds generated pictures, removes the Jooma mark and gives you 1,000 resources a month.",
    );
    expect(pickerDiffLine("pro_trial", "pro")).toBe(
      "Keeps generated pictures, clean exports and 1,000 resources a month.",
    );
    expect(pickerDiffLine("standard", "pro")).toBe("Doubles your resources and adds generated pictures.");
    expect(pickerDiffLine("free", "standard")).toBe(
      "Removes the Jooma mark and gives you 500 resources a month.",
    );
    expect(pickerDiffLine("pro", "max")).toBe("2,500 resources a month instead of 1,000.");
    expect(pickerDiffLine("pro", "standard")).toBe(
      "500 resources a month and library photos instead of generated pictures, from your next refill.",
    );
    expect(pickerDiffLine("pro", "pro")).toBe("This is your plan now.");
  });

  test("signed-out Choose X: one screen after signup", () => {
    expect(SIGNED_OUT_CHOICE).toEqual({
      title: "Your 10 free days of Pro are already on.",
      body: "Want to pay for Pro now instead?",
      pay: "Pay for Pro now",
      later: "Use my free days first",
    });
  });
});
