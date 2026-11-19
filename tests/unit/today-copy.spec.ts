import { test, expect } from "@playwright/test";
import { planNudge } from "@/app/lib/today-copy";

/*
 * The plan nudge on the v4 Today page. (The time-saved line is now P8, pinned
 * in prompts-phase2.spec.ts.)
 *
 * The nudge card is for plans with somewhere to go. Pro and Max have none, and
 * a teacher with no plan sees the locked card instead.
 */

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
