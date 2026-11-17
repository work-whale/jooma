import { test, expect } from "@playwright/test";
import {
  freePeriod,
  monthlyPeriod,
  trialEndsAt,
  londonDate,
} from "@/app/lib/resource-periods";

/*
 * When an allowance starts and refills, in UK time (spec Step 2).
 *
 * Periods roll forward lazily from these functions, on read or spend, so a
 * late cron can never leave a teacher on the wrong balance. That makes these
 * the only place the dates are decided, and every edge here is a teacher who
 * would otherwise refill an hour early, an hour late, or on the wrong day.
 */

const iso = (d: Date) => d.toISOString();

test.describe("Free: every Sunday at 00:00 UK time", () => {
  test("midweek belongs to the Sunday just gone", () => {
    const p = freePeriod(new Date("2026-11-18T12:00:00Z")); // Wed 18 Nov, GMT
    expect(iso(p.start)).toBe("2026-11-15T00:00:00.000Z");
    expect(iso(p.next)).toBe("2026-11-22T00:00:00.000Z");
  });

  test("the very moment of the refill starts the new week", () => {
    const p = freePeriod(new Date("2026-11-22T00:00:00Z"));
    expect(iso(p.start)).toBe("2026-11-22T00:00:00.000Z");
  });

  test("one second before it is still last week", () => {
    const p = freePeriod(new Date("2026-11-21T23:59:59Z"));
    expect(iso(p.start)).toBe("2026-11-15T00:00:00.000Z");
    expect(iso(p.next)).toBe("2026-11-22T00:00:00.000Z");
  });

  test("clocks forward, 28 Mar 2027: that Sunday's midnight is still GMT", () => {
    const p = freePeriod(new Date("2027-03-28T05:00:00Z"));
    expect(iso(p.start)).toBe("2027-03-28T00:00:00.000Z");
    // The following Sunday is in BST, so midnight is 23:00 UTC on Saturday.
    expect(iso(p.next)).toBe("2027-04-03T23:00:00.000Z");
  });

  test("the Saturday night before the clocks change belongs to the old week", () => {
    const p = freePeriod(new Date("2027-03-27T23:30:00Z"));
    expect(iso(p.start)).toBe("2027-03-21T00:00:00.000Z");
    expect(iso(p.next)).toBe("2027-03-28T00:00:00.000Z");
  });

  test("an hour after a BST Sunday midnight, in UTC still Saturday, is the new week", () => {
    const p = freePeriod(new Date("2027-04-03T23:30:00Z")); // 00:30 BST Sun 4 Apr
    expect(iso(p.start)).toBe("2027-04-03T23:00:00.000Z");
  });

  test("clocks back, 25 Oct 2026: midnight is BST, the next one GMT", () => {
    const p = freePeriod(new Date("2026-10-25T12:00:00Z"));
    expect(iso(p.start)).toBe("2026-10-24T23:00:00.000Z");
    expect(iso(p.next)).toBe("2026-11-01T00:00:00.000Z");
  });
});

test.describe("the trial ends at 23:59 UK time, ten days after signup", () => {
  test("signup Sun 15 Nov gives Wed 25 Nov 23:59", () => {
    const end = trialEndsAt(new Date("2026-11-15T10:00:00Z"));
    expect(iso(end)).toBe("2026-11-25T23:59:59.000Z");
  });

  test("the signup DATE is the UK date, not the UTC one", () => {
    // 00:30 BST on 15 June is 23:30 UTC on 14 June.
    const end = trialEndsAt(new Date("2026-06-14T23:30:00Z"));
    expect(iso(end)).toBe("2026-06-25T22:59:59.000Z"); // 23:59:59 BST, 25 June
  });

  test("a trial that runs over the clocks going forward ends at UK 23:59, in BST", () => {
    const end = trialEndsAt(new Date("2027-03-20T09:00:00Z"));
    expect(iso(end)).toBe("2027-03-30T22:59:59.000Z");
  });

  test("londonDate reads the calendar date in the UK", () => {
    expect(londonDate(new Date("2026-06-14T23:30:00Z"))).toEqual({ y: 2026, m: 6, d: 15 });
    expect(londonDate(new Date("2026-12-31T23:30:00Z"))).toEqual({ y: 2026, m: 12, d: 31 });
  });
});

test.describe("paid plans: the same day each month as the plan started", () => {
  test("mid-month", () => {
    const p = monthlyPeriod(15, new Date("2026-11-20T12:00:00Z"));
    expect(iso(p.start)).toBe("2026-11-15T00:00:00.000Z");
    expect(iso(p.next)).toBe("2026-12-15T00:00:00.000Z");
  });

  test("before this month's day, the period began last month", () => {
    const p = monthlyPeriod(15, new Date("2026-12-03T12:00:00Z"));
    expect(iso(p.start)).toBe("2026-11-15T00:00:00.000Z");
    expect(iso(p.next)).toBe("2026-12-15T00:00:00.000Z");
  });

  test("a plan started on the 31st refills on the last day of a short month", () => {
    const feb = monthlyPeriod(31, new Date("2027-02-15T12:00:00Z"));
    expect(iso(feb.start)).toBe("2027-01-31T00:00:00.000Z");
    expect(iso(feb.next)).toBe("2027-02-28T00:00:00.000Z");
    const end = monthlyPeriod(31, new Date("2027-02-28T12:00:00Z"));
    expect(iso(end.start)).toBe("2027-02-28T00:00:00.000Z");
    // 31 March 2027 is in BST, so UK midnight is 23:00 UTC the day before.
    expect(iso(end.next)).toBe("2027-03-30T23:00:00.000Z");
  });

  test("across New Year", () => {
    const p = monthlyPeriod(20, new Date("2027-01-05T12:00:00Z"));
    expect(iso(p.start)).toBe("2026-12-20T00:00:00.000Z");
    expect(iso(p.next)).toBe("2027-01-20T00:00:00.000Z");
  });

  test("midnight is UK midnight in summer", () => {
    const p = monthlyPeriod(10, new Date("2026-07-12T12:00:00Z"));
    expect(iso(p.start)).toBe("2026-07-09T23:00:00.000Z");
    expect(iso(p.next)).toBe("2026-08-09T23:00:00.000Z");
  });

  test("an impossible start day is clamped, never thrown", () => {
    expect(iso(monthlyPeriod(0, new Date("2026-11-20T12:00:00Z")).start)).toBe("2026-11-01T00:00:00.000Z");
    expect(iso(monthlyPeriod(45, new Date("2026-11-20T12:00:00Z")).start)).toBe("2026-10-31T00:00:00.000Z");
  });
});
