import { test, expect } from "@playwright/test";
import {
  ADMIN_ASSIGNABLE_PLANS,
  hasActivePlan,
  nextPlanDown,
  nextPlanUp,
  PLANS,
  planCredits,
  PRICEABLE_PLAN_IDS,
  SELECTABLE_PLAN_IDS,
} from "@/app/lib/plans";
import { planFeatures, planLosses, planTrialLine } from "@/app/lib/plan-copy";

/*
 * The plan ladder, and what moving down it costs.
 *
 * Both functions are pure and derived from PLANS, so they are tested here
 * rather than through the browser. planLosses in particular is worth pinning:
 * its output is read by somebody deciding whether to leave, so a bug that
 * overstates the loss tells a teacher they will lose something they actually
 * keep — which they will discover, and resent — while one that understates it
 * costs a save that could have been made.
 */

test.describe("what is on sale", () => {
  test("Standard, Pro and Max, cheapest first, and no Free", () => {
    // Free was withdrawn when Standard launched. "free" survives only as the
    // locked state of an account with no subscription, never as a plan.
    expect(SELECTABLE_PLAN_IDS).toEqual(["standard", "pro", "max"]);
    expect(PRICEABLE_PLAN_IDS).toEqual(["standard", "pro", "max"]);
  });

  test("Standard is £4.99 for 500 credits, watermarked, with every tool", () => {
    expect(PLANS.standard.priceMonthly).toBe(4.99);
    expect(planCredits("standard")).toBe(500);
    expect(PLANS.standard.limits.watermark).toBe(true);
    expect(PLANS.standard.limits.assistant).toBe(true);
    expect(PLANS.standard.limits.monthlyGenerations).toBeNull();
  });

  test("no plan can generate nothing", () => {
    expect(hasActivePlan("free")).toBe(false);
    expect(hasActivePlan("standard")).toBe(true);
    expect(PLANS.free.limits.monthlyGenerations).toBe(0);
    expect(PLANS.free.limits.assistant).toBe(false);
  });

  test("an admin can still take a plan away", () => {
    // Retired from sale, but "No plan" must stay assignable or there is no way
    // to remove a comp from the console.
    expect(ADMIN_ASSIGNABLE_PLANS.map((p) => p.id)).toEqual(["free", "standard", "pro", "max"]);
  });
});

test.describe("nextPlanDown", () => {
  test("Max steps down to Pro, Pro to Standard", () => {
    expect(nextPlanDown("max")).toBe("pro");
    expect(nextPlanDown("pro")).toBe("standard");
  });

  test("Standard has no PAID plan below it", () => {
    // Not an oversight. "No plan" is not a price to swap to: getting there means
    // cancelling and letting the subscription lapse, which is a different
    // mechanism entirely. Returning "free" here would invite a caller to hand
    // it to /api/stripe/downgrade, where priceIdFor() would throw.
    expect(nextPlanDown("standard")).toBeNull();
  });

  test("no plan has nowhere to go", () => {
    expect(nextPlanDown("free")).toBeNull();
  });

  test("is the inverse of nextPlanUp across the paid ladder", () => {
    expect(nextPlanUp(nextPlanDown("max")!)).toBe("max");
    expect(nextPlanUp(nextPlanDown("pro")!)).toBe("pro");
  });

  test("never returns a plan that costs the same or more", () => {
    for (const id of ["free", "standard", "pro", "max"] as const) {
      const down = nextPlanDown(id);
      if (!down) continue;
      expect(PLANS[down].priceMonthly ?? 0).toBeLessThan(PLANS[id].priceMonthly ?? 0);
    }
  });
});

test.describe("planLosses", () => {
  test("Max to Pro leads with the credit drop", () => {
    const losses = planLosses("max", "pro");
    const maxCredits = planCredits("max")!;
    const proCredits = planCredits("pro")!;

    expect(losses.length).toBeGreaterThan(0);
    // The number they actually feel every month goes first.
    expect(losses[0]).toContain((maxCredits - proCredits).toLocaleString("en-GB"));
    expect(losses[0]).toContain(proCredits.toLocaleString("en-GB"));
  });

  test("Max to Pro names the slideshow allowance, and nothing they keep", () => {
    const losses = planLosses("max", "pro").join(" | ");

    // Pro really does get fewer of these, so it belongs on the list.
    expect(losses).toContain(String(PLANS.pro.limits.aiImageSlideshows));

    // These are IDENTICAL on Pro and Max. Claiming any of them as a loss would
    // be telling a teacher they lose something they keep.
    expect(losses).not.toContain("watermark");
    expect(losses).not.toContain("assistant");
    expect(losses).not.toContain("priority support");
    expect(losses).not.toContain("curriculum");
  });

  test("Pro to Standard names credits, the watermark and support, and keeps the assistant", () => {
    const losses = planLosses("pro", "standard");
    const joined = losses.join(" | ");

    expect(losses[0]).toContain(planCredits("standard")!.toLocaleString("en-GB"));
    expect(joined).toContain("watermark");
    expect(joined.toLowerCase()).toContain("priority support");
    expect(joined).toContain(String(PLANS.standard.limits.aiImageSlideshows));
    // Standard keeps these, so they are not losses.
    expect(joined).not.toContain("assistant");
    expect(joined).not.toContain("curriculum");
    expect(joined).not.toContain("library");
  });

  test("cancelling says the one thing that matters", () => {
    expect(planLosses("standard", "free")).toEqual(["You won't be able to create new resources"]);
    expect(planLosses("max", "free")).toEqual(["You won't be able to create new resources"]);
  });

  test("moving UP costs nothing", () => {
    expect(planLosses("standard", "pro")).toEqual([]);
    expect(planLosses("pro", "max")).toEqual([]);
    expect(planLosses("free", "standard")).toEqual([]);
  });

  test("a plan loses nothing against itself", () => {
    expect(planLosses("pro", "pro")).toEqual([]);
    expect(planLosses("max", "max")).toEqual([]);
  });
});

test.describe("planFeatures", () => {
  test("paid plans lead with their real credit allowance", () => {
    // Derived from the spend ceiling, so a card can never advertise an
    // allowance the guard will not grant.
    for (const id of ["standard", "pro", "max"] as const) {
      expect(planFeatures(id)[0]).toBe(`${planCredits(id)!.toLocaleString("en-GB")} credits a month`);
    }
  });

  test("Standard sells every tool and says the exports are watermarked", () => {
    const features = planFeatures("standard");
    expect(features).toContain("All 35 tools");
    expect(features).toContain("Watermarked exports");
  });
});

test.describe("planTrialLine", () => {
  test("quotes the trial and the price it becomes", () => {
    expect(planTrialLine("standard")).toBe("3 days free, then £4.99 a month");
    expect(planTrialLine("pro")).toBe("3 days free, then £7.99 a month");
  });

  test("is null for anything without a self-serve price", () => {
    expect(planTrialLine("free")).toBeNull();
    expect(planTrialLine("school")).toBeNull();
  });
});
