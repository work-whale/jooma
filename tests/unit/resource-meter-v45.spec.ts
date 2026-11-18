import { test, expect } from "@playwright/test";
import { meterFromResources, meterValue } from "@/app/lib/resource-meter";

/*
 * The sidebar meter from my_resources() (Jooma 4.5, plan 2c "useCreditMeter
 * reads the RPC").
 *
 * Edge cases: Free reads per week, paid per month, the trial as one window;
 * the total (allowance left plus top-ups) is what is left, floored at 0 and
 * never NaN; the bar's fraction is against the allowance and capped at 1 when
 * top-ups take it past; a missing refill date falls back to null, never
 * "Invalid Date"; School and unknown plans are unmetered; a null row (the
 * RPC failed) is null so the hook keeps its last state.
 */

const row = (over: Partial<Parameters<typeof meterFromResources>[0] & object> = {}) => ({
  plan: "pro",
  allowance: 1000,
  total: 640,
  topup_left: 0,
  next_refill_at: "2026-12-03T00:00:00.000Z",
  trial_ends_at: null,
  ...over,
});

test("Pro reads per month, against its 1,000", () => {
  const m = meterFromResources(row())!;
  expect(m).toMatchObject({ metered: true, remaining: 640, allowance: 1000, period: "month" });
  expect(m.fraction).toBeCloseTo(0.64);
  expect(m.refillsOn?.toISOString()).toBe("2026-12-03T00:00:00.000Z");
});

test("Free reads per week", () => {
  expect(meterFromResources(row({ plan: "free", allowance: 50, total: 12 }))).toMatchObject({
    period: "week",
    remaining: 12,
    allowance: 50,
  });
});

test("the trial is one window that refills never, and ends on its end date", () => {
  const m = meterFromResources(
    row({ plan: "pro_trial", allowance: 300, total: 280, next_refill_at: null, trial_ends_at: "2026-11-25T23:59:59.000Z" }),
  )!;
  expect(m.period).toBe("trial");
  expect(m.refillsOn).toBeNull();
  expect(m.endsOn?.toISOString()).toBe("2026-11-25T23:59:59.000Z");
});

test("an overspend floors at 0, and a zero allowance gives fraction 0, not NaN", () => {
  expect(meterFromResources(row({ total: -15 }))!.remaining).toBe(0);
  const z = meterFromResources(row({ allowance: 0, total: 0 }))!;
  expect(z.fraction).toBe(0);
});

test("top-ups past the allowance cap the bar at full", () => {
  const m = meterFromResources(row({ total: 1500, topup_left: 500 }))!;
  expect(m.remaining).toBe(1500);
  expect(m.fraction).toBe(1);
  expect(m.topUps).toBe(500);
});

test("School and unknown plans are unmetered; a missing row is null", () => {
  expect(meterFromResources(row({ plan: "school" }))!.metered).toBe(false);
  expect(meterFromResources(row({ plan: "gold" }))!.metered).toBe(false);
  expect(meterFromResources(null)).toBeNull();
});

test("a bad refill date is null, not an Invalid Date", () => {
  expect(meterFromResources(row({ next_refill_at: "not a date" }))!.refillsOn).toBeNull();
});

test("the calm trial line names the window, not a month", () => {
  expect(meterValue({ left: 280, allowance: 300, period: "trial" })).toBe("300 in your trial");
  expect(meterValue({ left: 40, allowance: 300, period: "trial" })).toBe("40 left");
  expect(meterValue({ left: 600, allowance: 1000, period: "month" })).toBe("1,000 a month");
});
