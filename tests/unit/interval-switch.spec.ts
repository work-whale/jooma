import { test, expect } from "@playwright/test";
import {
  intervalSwitchKind,
  intervalSwitchRefusalMessage,
  planMoveOf,
  usableProrationDate,
  type IntervalSwitchRefusal,
} from "@/app/lib/interval-switch";
import { planYearlySavingAmount } from "@/app/lib/plan-copy";

/*
 * Switching a live subscription between monthly and yearly.
 *
 * The decision is pure, so every row of it is pinned here. The Stripe side of
 * each row is pinned against the sandbox in tests/billing/interval-switch.spec.ts.
 */

const live = { status: "active", cancelAtPeriodEnd: false, hasSchedule: false };

test.describe("which switch happens", () => {
  test("monthly to yearly is immediate, like an upgrade", () => {
    expect(intervalSwitchKind({ ...live, from: "month", to: "year" })).toEqual({
      ok: true,
      kind: "now",
    });
  });

  test("yearly to monthly waits for renewal, like a downgrade", () => {
    expect(intervalSwitchKind({ ...live, from: "year", to: "month" })).toEqual({
      ok: true,
      kind: "at_renewal",
    });
  });

  test("during the trial both directions swap now, with nothing charged", () => {
    for (const [from, to] of [
      ["month", "year"],
      ["year", "month"],
    ] as const) {
      expect(intervalSwitchKind({ ...live, status: "trialing", from, to })).toEqual({
        ok: true,
        kind: "trial",
      });
    }
  });
});

test.describe("when a switch is refused", () => {
  const refused = (over: Partial<Parameters<typeof intervalSwitchKind>[0]>) =>
    intervalSwitchKind({ ...live, from: "month", to: "year", ...over });

  test("already billed that way", () => {
    expect(refused({ to: "month" })).toEqual({ ok: false, reason: "same" });
  });

  test("an ended subscription", () => {
    expect(refused({ status: "canceled" })).toEqual({ ok: false, reason: "canceled" });
  });

  test("a cancelling subscription must be renewed first", () => {
    expect(refused({ cancelAtPeriodEnd: true })).toEqual({ ok: false, reason: "ending" });
  });

  test("a change already waiting is never replaced silently", () => {
    expect(refused({ hasSchedule: true })).toEqual({ ok: false, reason: "scheduled" });
    // Even in the trial, where the swap itself would be harmless.
    expect(refused({ hasSchedule: true, status: "trialing" })).toEqual({
      ok: false,
      reason: "scheduled",
    });
  });

  test("a subscription that is not paid up", () => {
    for (const status of ["past_due", "incomplete", "unpaid", "paused"]) {
      expect(refused({ status })).toEqual({ ok: false, reason: "inactive" });
    }
  });

  test("every refusal has a message, in the product's voice", () => {
    const reasons: IntervalSwitchRefusal[] = [
      "same",
      "not_interval",
      "canceled",
      "ending",
      "scheduled",
      "inactive",
    ];
    for (const reason of reasons) {
      const message = intervalSwitchRefusalMessage(reason);
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/[—–]/);
    }
  });
});

test.describe("with a plan change at the same time", () => {
  test("to yearly on a dearer plan is immediate, like an upgrade", () => {
    expect(intervalSwitchKind({ ...live, from: "month", to: "year", planMove: "up" })).toEqual({
      ok: true,
      kind: "now",
    });
  });

  test("a cheaper plan always waits for renewal, whichever way the interval goes", () => {
    for (const [from, to] of [
      ["month", "year"],
      ["year", "month"],
    ] as const) {
      expect(intervalSwitchKind({ ...live, from, to, planMove: "down" })).toEqual({
        ok: true,
        kind: "at_renewal",
      });
      // Even in the trial: its allowance cannot drop mid-period either.
      expect(
        intervalSwitchKind({ ...live, status: "trialing", from, to, planMove: "down" }),
      ).toEqual({ ok: true, kind: "at_renewal" });
    }
  });

  test("to monthly on a dearer plan waits for renewal", () => {
    expect(intervalSwitchKind({ ...live, from: "year", to: "month", planMove: "up" })).toEqual({
      ok: true,
      kind: "at_renewal",
    });
  });

  test("a dearer plan during the trial swaps now, with nothing charged", () => {
    expect(
      intervalSwitchKind({ ...live, status: "trialing", from: "month", to: "year", planMove: "up" }),
    ).toEqual({ ok: true, kind: "trial" });
  });

  test("a plan change at the same interval is not this route's to make", () => {
    expect(intervalSwitchKind({ ...live, from: "month", to: "month", planMove: "up" })).toEqual({
      ok: false,
      reason: "not_interval",
    });
  });

  test("plans compare by monthly price", () => {
    expect(planMoveOf(4.99, 7.99)).toBe("up");
    expect(planMoveOf(14.99, 7.99)).toBe("down");
    expect(planMoveOf(7.99, 7.99)).toBe("same");
  });
});

test.describe("the preview's proration date", () => {
  const now = 1_800_000_000;

  test("is used when it is recent", () => {
    expect(usableProrationDate(now - 60, now)).toBe(now - 60);
    expect(usableProrationDate(now, now)).toBe(now);
  });

  test("is ignored from the future, when stale, or when not a whole number", () => {
    expect(usableProrationDate(now + 1, now)).toBeNull();
    expect(usableProrationDate(now - 16 * 60, now)).toBeNull();
    expect(usableProrationDate(now - 1.5, now)).toBeNull();
    expect(usableProrationDate(String(now), now)).toBeNull();
    expect(usableProrationDate(undefined, now)).toBeNull();
  });
});

test.describe("the saving on the button", () => {
  test("is twelve monthly payments less the yearly price", () => {
    expect(planYearlySavingAmount("standard")).toBe("£11.89");
    expect(planYearlySavingAmount("pro")).toBe("£23.89");
    expect(planYearlySavingAmount("max")).toBe("£35.89");
    expect(planYearlySavingAmount("school")).toBeNull();
  });
});
