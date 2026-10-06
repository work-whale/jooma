import { test, expect } from "@playwright/test";
import { summariseGuestTries, type GuestTryRow } from "@/app/admin/stats/guestTries";

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
    expect(slides.signupRate).toBeCloseTo((4 / 12) * 100);

    expect(s.total).toMatchObject({ tries: 19, succeeded: 16, failed: 3, claimed: 5 });
    expect(s.total.signupRate).toBeCloseTo((5 / 16) * 100);
  });

  test("a zero rate, not NaN, when nothing succeeded", () => {
    const s = summariseGuestTries([row("2026-10-01", "slideshow", { tries: 2, failed: 2 })]);
    expect(s.tools[0].signupRate).toBe(0);
    expect(s.total.signupRate).toBe(0);
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
      row("2026-10-01", "slideshow", { tries: 1, claimed: 1 }),
      row("2026-08-01", "slideshow", { tries: 2 }),
      row("2026-09-01", "comprehension-generator", { tries: 3, failed: 1 }),
    ]);
    expect(s.months.map((m) => m.month_start)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(s.months[1]).toMatchObject({ byTool: { "comprehension-generator": 3 }, failed: 1 });
    expect(s.months[2].claimed).toBe(1);
  });
});
