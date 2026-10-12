import { test, expect } from "@playwright/test";
import {
  AMBASSADOR_ENDING_DAYS,
  daysUntil,
  onAmbassadorPro,
  planBadgeFor,
} from "@/app/lib/plan-badge";

/*
 * The sidebar's plan pill and its button.
 *
 * Every teacher sees which plan they are on above their credits, and a button
 * to /pricing. An ambassador on their free year sees "Ambassador · Pro", the
 * date it ends, and a countdown over the last AMBASSADOR_ENDING_DAYS.
 */

const NOW = new Date("2026-10-12T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

test.describe("planBadgeFor, ordinary teachers", () => {
  test("names each plan in one word", () => {
    expect(planBadgeFor("free", null, NOW).label).toBe("No plan");
    expect(planBadgeFor("standard", null, NOW).label).toBe("Standard");
    expect(planBadgeFor("pro", null, NOW).label).toBe("Pro");
    expect(planBadgeFor("max", null, NOW).label).toBe("Max");
    expect(planBadgeFor("school", null, NOW).label).toBe("School");
  });

  test("the button always goes to /pricing, worded for where they stand", () => {
    expect(planBadgeFor("free", null, NOW).cta).toEqual({ label: "Choose a plan", href: "/pricing" });
    expect(planBadgeFor("standard", null, NOW).cta.label).toBe("Upgrade");
    expect(planBadgeFor("pro", null, NOW).cta.label).toBe("Upgrade");
    // Nothing above Max to upgrade to, but the button is still there.
    expect(planBadgeFor("max", null, NOW).cta.label).toBe("See plans");
    expect(planBadgeFor("school", null, NOW).cta.label).toBe("See plans");
  });

  test("no ambassador styling and no note", () => {
    const badge = planBadgeFor("pro", null, NOW);
    expect(badge.ambassador).toBe(false);
    expect(badge.note).toBeNull();
    expect(badge.daysLeft).toBeNull();
  });
});

test.describe("planBadgeFor, ambassadors", () => {
  const term = (proUntil: Date | null, status = "active") => ({ status, proUntil });

  test("on the free year: Ambassador · Pro, with the end date", () => {
    const badge = planBadgeFor("pro", term(days(200)), NOW);
    expect(badge.label).toBe("Ambassador · Pro");
    expect(badge.ambassador).toBe(true);
    expect(badge.note).toMatch(/^Free until \d{1,2} [A-Z][a-z]+ 2027$/);
    expect(badge.cta.label).toBe("See plans");
    expect(badge.daysLeft).toBe(200);
  });

  test("counts down over the last 30 days and offers to keep Pro", () => {
    expect(AMBASSADOR_ENDING_DAYS).toBe(30);
    const badge = planBadgeFor("pro", term(days(12)), NOW);
    expect(badge.note).toBe("Free Pro ends in 12 days");
    expect(badge.cta.label).toBe("Keep Pro");

    expect(planBadgeFor("pro", term(days(30)), NOW).note).toBe("Free Pro ends in 30 days");
    expect(planBadgeFor("pro", term(days(31)), NOW).note).toMatch(/^Free until/);
  });

  test("one day is singular, and part of a day still counts as one", () => {
    expect(planBadgeFor("pro", term(days(0.25)), NOW).note).toBe("Free Pro ends in 1 day");
    expect(daysUntil(days(0.25), NOW)).toBe(1);
  });

  test("once the free year has passed, the badge is the plan they hold", () => {
    // The cron has not run yet: still on pro, but the term is over.
    const lingering = planBadgeFor("pro", term(days(-1)), NOW);
    expect(onAmbassadorPro("pro", term(days(-1)), NOW)).toBe(false);
    expect(lingering.label).toBe("Ambassador · Pro");
    expect(lingering.note).toBeNull();
    expect(lingering.cta.label).toBe("Upgrade");

    // After the cron: no plan, still an ambassador.
    const ended = planBadgeFor("free", term(days(-1)), NOW);
    expect(ended.label).toBe("No plan");
    expect(ended.ambassador).toBe(true);
    expect(ended.cta.label).toBe("Choose a plan");
  });

  test("an ambassador paying for Max keeps the badge", () => {
    const badge = planBadgeFor("max", term(null), NOW);
    expect(badge.label).toBe("Ambassador · Max");
    expect(badge.ambassador).toBe(true);
    expect(badge.note).toBeNull();
  });

  test("a paused ambassador keeps their free year but loses the branding", () => {
    const badge = planBadgeFor("pro", term(days(100), "paused"), NOW);
    expect(badge.ambassador).toBe(false);
    expect(badge.label).toBe("Pro");
    expect(badge.note).toMatch(/^Free until/);
  });

  test("a granted term means nothing on a plan other than Pro", () => {
    expect(onAmbassadorPro("free", term(days(100)), NOW)).toBe(false);
    expect(onAmbassadorPro("max", term(days(100)), NOW)).toBe(false);
    expect(onAmbassadorPro("pro", term(null), NOW)).toBe(false);
    expect(onAmbassadorPro("pro", null, NOW)).toBe(false);
  });
});
