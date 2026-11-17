import { test, expect } from "@playwright/test";
import { whenLabel } from "@/app/lib/when-label";

/*
 * "2 hours ago", "Yesterday", "Wednesday", "9 Nov": when a resource was made,
 * as the v4 recent list says it. Calendar days in the teacher's own clock, so
 * something made at 23:50 is "Yesterday" ten minutes later.
 */

const NOW = new Date(2026, 10, 13, 15, 0); // Fri 13 Nov 2026, 15:00 local

test("under a minute is just now", () => {
  expect(whenLabel(new Date(2026, 10, 13, 14, 59, 40), NOW)).toBe("Just now");
});

test("minutes, then hours, on the same day", () => {
  expect(whenLabel(new Date(2026, 10, 13, 14, 59), NOW)).toBe("1 minute ago");
  expect(whenLabel(new Date(2026, 10, 13, 14, 20), NOW)).toBe("40 minutes ago");
  expect(whenLabel(new Date(2026, 10, 13, 14, 0), NOW)).toBe("1 hour ago");
  expect(whenLabel(new Date(2026, 10, 13, 9, 0), NOW)).toBe("6 hours ago");
});

test("the calendar day before is yesterday, however few hours ago", () => {
  const justBeforeMidnight = new Date(2026, 10, 12, 23, 50);
  expect(whenLabel(justBeforeMidnight, new Date(2026, 10, 13, 0, 5))).toBe("Yesterday");
  expect(whenLabel(new Date(2026, 10, 12, 9, 0), NOW)).toBe("Yesterday");
});

test("within the last week, the weekday", () => {
  expect(whenLabel(new Date(2026, 10, 11, 10, 0), NOW)).toBe("Wednesday");
  expect(whenLabel(new Date(2026, 10, 7, 10, 0), NOW)).toBe("Saturday");
});

test("older than that, the day and month", () => {
  expect(whenLabel(new Date(2026, 10, 6, 10, 0), NOW)).toBe("6 Nov");
  expect(whenLabel(new Date(2025, 10, 6, 10, 0), NOW)).toBe("6 Nov 2025");
});

test("a clock that runs ahead never says a negative time", () => {
  expect(whenLabel(new Date(2026, 10, 13, 15, 3), NOW)).toBe("Just now");
});
