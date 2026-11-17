import { test, expect } from "@playwright/test";
import {
  PLAN_CONFIG,
  TRIAL,
  TOP_UP_PACKS,
  OFFER,
  MINUTES_SAVED_PER_BAND,
  TOOL_BANDS,
  exportMarkFor,
  picturesAllowed,
  refinesPerWeek,
  topUpsAllowed,
  allowanceFor,
  minutesSavedFor,
  type AccountPlan,
} from "@/app/lib/plan-config";
import { planCredits } from "@/app/lib/plans";
import { V2_TOOLS } from "@/app/lib/tools";

/*
 * Jooma 4.5 plans config (Ash's build spec, Step 1, with the owner's red notes).
 *
 * Every number a teacher sees about a plan comes from here, so these tests pin
 * the values the owner signed off. A test that fails after an intended change
 * is the one-line edit's second line.
 */

test.describe("the four plans", () => {
  test("allowances: Free 50 a week, Standard 500, Pro 1,000, Max 2,500 a month", () => {
    expect(PLAN_CONFIG.free).toMatchObject({ resources: 50, refill: "weekly_sunday_0000" });
    expect(PLAN_CONFIG.standard).toMatchObject({ resources: 500, refill: "monthly_on_start_day" });
    expect(PLAN_CONFIG.pro).toMatchObject({ resources: 1000, refill: "monthly_on_start_day" });
    expect(PLAN_CONFIG.max).toMatchObject({ resources: 2500, refill: "monthly_on_start_day" });
  });

  test("prices: Max is £13.99 for new monthly payers, yearly prices unchanged", () => {
    expect(PLAN_CONFIG.free.monthly).toBe(0);
    expect(PLAN_CONFIG.free.yearly).toBeNull();
    expect([PLAN_CONFIG.standard.monthly, PLAN_CONFIG.standard.yearly]).toEqual([4.99, 47.99]);
    expect([PLAN_CONFIG.pro.monthly, PLAN_CONFIG.pro.yearly]).toEqual([7.99, 71.99]);
    expect([PLAN_CONFIG.max.monthly, PLAN_CONFIG.max.yearly]).toEqual([13.99, 143.99]);
  });

  test("paid allowances agree with the spend ceilings in plans.ts", () => {
    // 1 resource = 0.15p of model spend; the two files must never disagree.
    for (const id of ["standard", "pro", "max"] as const) {
      expect(planCredits(id), id).toBe(PLAN_CONFIG[id].resources);
    }
  });

  test("Pro is the recommended plan; Max carries its tagline and nothing about priority", () => {
    expect(PLAN_CONFIG.pro.badge).toBe("Recommended");
    expect(PLAN_CONFIG.max.tagline).toBe("For heads of department and heavy planners");
    expect(JSON.stringify(PLAN_CONFIG)).not.toMatch(/priority/i);
  });

  test("custom deck themes are left alone: off everywhere", () => {
    for (const p of Object.values(PLAN_CONFIG)) expect(p.customThemes).toBe(false);
  });
});

test.describe("the Pro trial", () => {
  test("Pro, 10 days, 300 resources once, one per email", () => {
    expect(TRIAL).toMatchObject({ plan: "pro", days: 10, resources: 300, oncePerEmail: true });
  });
});

test.describe("features by plan (red notes win over the spec table)", () => {
  const plans: AccountPlan[] = ["free", "pro_trial", "standard", "pro", "max"];

  test("the Jooma mark: on Free and the trial, off on Standard, Pro and Max", () => {
    expect(plans.map(exportMarkFor)).toEqual([true, true, false, false, false]);
  });

  test("generated pictures: trial, Pro and Max only", () => {
    expect(plans.map(picturesAllowed)).toEqual([false, true, false, true, true]);
  });

  test("refines: Free 10 a week, everyone else unlimited", () => {
    expect(plans.map(refinesPerWeek)).toEqual([10, null, null, null, null]);
  });

  test("top-ups: paid plans only", () => {
    expect(plans.map(topUpsAllowed)).toEqual([false, false, true, true, true]);
  });

  test("allowances by account state, trial included", () => {
    expect(plans.map(allowanceFor)).toEqual([50, 300, 500, 1000, 2500]);
  });

  test("a school account is clean, with pictures, and is not metered here", () => {
    expect(exportMarkFor("school")).toBe(false);
    expect(picturesAllowed("school")).toBe(true);
    expect(allowanceFor("school")).toBeNull();
  });
});

test.describe("top-up packs and the offer", () => {
  test("three packs, cheapest per resource at the top end", () => {
    expect(TOP_UP_PACKS.map((p) => [p.resources, p.price])).toEqual([
      [500, 2.49],
      [1500, 5.99],
      [4000, 12.99],
    ]);
    const each = TOP_UP_PACKS.map((p) => p.price / p.resources);
    expect(each[0]).toBeGreaterThan(each[1]);
    expect(each[1]).toBeGreaterThan(each[2]);
  });

  test("pack ids are stable and unique, since they ride Stripe metadata", () => {
    const ids = TOP_UP_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  test("the only discount: half the first month of Pro monthly, once per account", () => {
    expect(OFFER).toMatchObject({
      code: "PRO-HALF-FIRST-MONTH",
      plan: "pro",
      interval: "month",
      firstMonthPrice: 3.99,
      validDays: 7,
      oncePerAccount: true,
    });
  });
});

test.describe("time saved", () => {
  test("Ash's minutes per band", () => {
    expect(MINUTES_SAVED_PER_BAND).toEqual({ quick: 10, standard: 20, longForm: 40, decks: 45 });
  });

  test("every tool on the Make page has a band, and nothing else does", () => {
    const slugs = V2_TOOLS.map((t) => t.href.replace("/tools/", "")).sort();
    expect(Object.keys(TOOL_BANDS).sort()).toEqual(slugs);
  });

  test("decks are Slides and Staff Slides; the quiz and letters are quick", () => {
    expect(TOOL_BANDS.slideshow).toBe("decks");
    expect(TOOL_BANDS["cpd-slideshow"]).toBe("decks");
    expect(TOOL_BANDS["quiz-generator"]).toBe("quick");
    expect(TOOL_BANDS["letter-writer"]).toBe("quick");
    expect(TOOL_BANDS["lesson-planner"]).toBe("longForm");
  });

  test("minutes for a tool, and a cautious standard for one not in the list", () => {
    expect(minutesSavedFor("slideshow")).toBe(45);
    expect(minutesSavedFor("quiz-generator")).toBe(10);
    expect(minutesSavedFor("no-such-tool")).toBe(20);
  });
});
