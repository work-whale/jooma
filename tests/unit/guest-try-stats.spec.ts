import { test, expect } from "@playwright/test";
import {
  summariseGuestFunnel,
  summariseGuestTries,
  type GuestFunnelRow,
  type GuestTryRow,
} from "@/app/admin/stats/guestTries";

/*
 * The "Free tries from the hero" panel on /admin/stats. The rows are what
 * admin_guest_try_stats() returns, one per month per tool.
 */

function row(month: string, tool: string, n: Partial<GuestTryRow> = {}): GuestTryRow {
  return {
    month_start: month,
    label: month,
    tool,
    tries: 0,
    succeeded: 0,
    failed: 0,
    claimed: 0,
    guests: 0,
    ...n,
  };
}

test.describe("free tries summary", () => {
  test("totals each tool across the range", () => {
    const s = summariseGuestTries([
      row("2026-09-01", "slideshow", { tries: 10, succeeded: 8, failed: 2, claimed: 2, guests: 9 }),
      row("2026-10-01", "slideshow", { tries: 5, succeeded: 4, failed: 1, claimed: 2, guests: 5 }),
      row("2026-09-01", "comprehension-generator", { tries: 4, succeeded: 4, claimed: 1, guests: 4 }),
      row("2026-10-01", "comprehension-generator"),
    ]);

    const slides = s.tools.find((t) => t.tool === "slideshow")!;
    expect(slides).toMatchObject({ label: "Slides", tries: 15, succeeded: 12, failed: 3, claimed: 4 });
    expect(s.total).toEqual({ tries: 19, succeeded: 16, failed: 3 });
  });

  test("runs carry no signup rate: claims count logins and every deck (regression)", () => {
    // Production in October: five claimed runs read as "5 signed up after"
    // when they were one new account and one existing teacher logging in.
    const s = summariseGuestTries([row("2026-10-01", "slideshow", { tries: 9, succeeded: 9, claimed: 5 })]);
    expect(s.tools[0]).not.toHaveProperty("signupRate");
    expect(s.total).not.toHaveProperty("claimed");
    expect(s.total).not.toHaveProperty("signupRate");
    expect(s.months[0]).not.toHaveProperty("claimed");
  });

  test("Worksheet is always listed, flagged as coming soon", () => {
    const s = summariseGuestTries([]);
    expect(s.tools.map((t) => t.label)).toEqual(["Slides", "Comprehension", "Worksheet"]);
    const ws = s.tools.find((t) => t.tool === "worksheet-generator")!;
    expect(ws.soon).toBe(true);
    expect(ws.tries).toBe(0);
    expect(s.months).toEqual([]);
  });

  test("a tool this file has not heard of still shows, under its own key", () => {
    const s = summariseGuestTries([row("2026-10-01", "lesson-plan", { tries: 3, succeeded: 3 })]);
    const extra = s.tools.at(-1)!;
    expect(extra).toMatchObject({ tool: "lesson-plan", label: "lesson-plan", tries: 3 });
    expect(s.months[0].byTool["lesson-plan"]).toBe(3);
  });

  test("months come out oldest first, with tries per tool", () => {
    const s = summariseGuestTries([
      row("2026-10-01", "slideshow", { tries: 1 }),
      row("2026-08-01", "slideshow", { tries: 2 }),
      row("2026-09-01", "comprehension-generator", { tries: 3, failed: 1 }),
    ]);
    expect(s.months.map((m) => m.month_start)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(s.months[1]).toMatchObject({ byTool: { "comprehension-generator": 3 }, failed: 1 });
    expect(s.months[2].byTool.slideshow).toBe(1);
  });
});

/*
 * The funnel above the tries: PEOPLE, from admin_guest_try_funnel(), one row
 * per month of their first try. Logins to an existing account are carried but
 * never counted as a conversion.
 */

function f(month: string, n: Partial<GuestFunnelRow> = {}): GuestFunnelRow {
  return {
    month_start: month,
    label: month,
    tried: 0,
    new_accounts: 0,
    started_trial: 0,
    paying: 0,
    existing_logins: 0,
    ...n,
  };
}

test.describe("free try funnel", () => {
  test("the October production figures: one new account, the login left out", () => {
    const s = summariseGuestFunnel([
      f("2026-08-01"),
      f("2026-09-01"),
      f("2026-10-01", { tried: 7, new_accounts: 1, existing_logins: 1 }),
    ]);
    expect(s.total).toMatchObject({ tried: 7, new_accounts: 1, started_trial: 0, paying: 0, existing_logins: 1 });
    expect(s.total.newRate).toBeCloseTo((1 / 7) * 100);
  });

  test("each step is a share of the step before it", () => {
    const s = summariseGuestFunnel([
      f("2026-09-01", { tried: 40, new_accounts: 8, started_trial: 4, paying: 1 }),
      f("2026-10-01", { tried: 60, new_accounts: 12, started_trial: 6, paying: 2 }),
    ]);
    expect(s.total.newRate).toBeCloseTo(20); // 20 of 100 tried
    expect(s.total.trialRate).toBeCloseTo(50); // 10 of 20 new accounts
    expect(s.total.payRate).toBeCloseTo(30); // 3 of 10 trials
  });

  test("zero rates, not NaN, when a step is empty", () => {
    const s = summariseGuestFunnel([f("2026-10-01", { tried: 3 })]);
    expect(s.total).toMatchObject({ newRate: 0, trialRate: 0, payRate: 0 });
    expect(summariseGuestFunnel([]).total.newRate).toBe(0);
  });

  test("months are keyed by start date to line up with the tries table", () => {
    const s = summariseGuestFunnel([
      f("2026-09-01", { tried: 2, new_accounts: 1 }),
      f("2026-10-01", { tried: 5, new_accounts: 2, started_trial: 1 }),
    ]);
    expect(s.byMonth["2026-10-01"]).toEqual({
      tried: 5,
      new_accounts: 2,
      started_trial: 1,
      paying: 0,
      existing_logins: 0,
    });
    expect(s.byMonth["2026-09-01"].new_accounts).toBe(1);
    expect(s.byMonth["2026-11-01"]).toBeUndefined();
  });
});
