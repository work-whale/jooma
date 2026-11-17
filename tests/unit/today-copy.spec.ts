import { test, expect } from "@playwright/test";
import { savedPill, planNudge } from "@/app/lib/today-copy";

/*
 * Two lines on the v4 Today page.
 *
 * Time saved is an estimate, so it always says "about" (Ash's spec, Step 5),
 * and it never shows a zero: before anything is made there is nothing to say.
 *
 * The nudge card is for plans with somewhere to go. Pro and Max have none, and
 * a teacher with no plan sees the locked card instead.
 */

test.describe("savedPill", () => {
  test("nothing made: no pill at all", () => {
    expect(savedPill(0, 0)).toBeNull();
  });

  test("under an hour says so rather than 0 hours", () => {
    expect(savedPill(25, 2)).toEqual({ lead: "Under an hour", rest: " saved so far." });
  });

  test("hours, rounded, always about", () => {
    expect(savedPill(60, 3)).toEqual({ lead: "About 1 hour", rest: " you have not spent planning." });
    expect(savedPill(250, 9)).toEqual({ lead: "About 4 hours", rest: " you have not spent planning." });
  });
});

test.describe("planNudge", () => {
  test("Standard is shown Pro, priced, without promising anything Standard lacks today", () => {
    const n = planNudge("standard");
    expect(n).not.toBeNull();
    expect(n!.cta).toBe("See Pro");
    expect(n!.price).toBe("£7.99 a month");
    expect(n!.body).toContain("1,000");
    // Standard keeps clean exports (owner's note): never sell Pro on the mark.
    expect(`${n!.title} ${n!.body}`).not.toMatch(/mark/i);
  });

  test("Pro, Max, School and no plan get no card", () => {
    expect(planNudge("pro")).toBeNull();
    expect(planNudge("max")).toBeNull();
    expect(planNudge("school")).toBeNull();
    expect(planNudge("free")).toBeNull();
  });
});
