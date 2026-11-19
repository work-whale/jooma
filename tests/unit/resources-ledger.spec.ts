import { test, expect } from "@playwright/test";
import {
  periodFor,
  startAccount,
  rollForward,
  balance,
  changePlan,
  estimateCheck,
  outOfResourcesPayload,
  type ResourceAccount,
} from "@/app/lib/resources";

/*
 * The resources balance (Jooma 4.5 spec Step 2, plan 2c).
 *
 * Charging is measured: `spent` is what the period's generations really cost,
 * in resources. The account row holds only the period, the allowance set at
 * its start, and how much of the never-expiring top-up pool closed periods
 * have eaten. Periods roll forward lazily, on read or spend.
 *
 * Edge cases listed before writing (and asked of each: would it pass if the
 * code were wrong?):
 *   - Free refills to exactly 50, never 50 more, at Sunday 00:00 UK, incl. the
 *     clocks-forward night (28 Mar 2027).
 *   - A row untouched for weeks rolls to the CURRENT period, not the next one.
 *   - Overspend past the allowance is taken from top-ups when the period
 *     closes, and never makes top-ups negative.
 *   - Unused allowance is lost at refill; unused top-ups are kept.
 *   - The trial is one window that ends at trial end, and does not refill.
 *   - Upgrade adds the difference now, refill date unchanged; downgrade waits.
 *   - Moving to Free gives a fresh 50 at once.
 *   - Estimate check refuses only when the rounded estimate is above what is
 *     left, and its copy names both numbers.
 */

const at = (iso: string) => new Date(iso);

test.describe("periods", () => {
  test("Free: from the last Sunday 00:00 UK to the next", () => {
    // Wed 18 Nov 2026, 10:00 UTC (GMT, so UK time too).
    const p = periodFor("free", 1, at("2026-11-18T10:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(p.next!.toISOString()).toBe("2026-11-22T00:00:00.000Z");
  });

  test("paid: the plan's start day each month", () => {
    const p = periodFor("pro", 12, at("2026-11-18T10:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(p.next!.toISOString()).toBe("2026-12-12T00:00:00.000Z");
  });

  test("the trial has no refill inside it", () => {
    const signup = at("2026-11-15T09:00:00Z");
    const p = periodFor("pro_trial", 15, at("2026-11-18T10:00:00Z"), { trialStartedAt: signup });
    expect(p.start.toISOString()).toBe(signup.toISOString());
    // Wed 25 Nov 23:59:59 UK = GMT.
    expect(p.next!.toISOString()).toBe("2026-11-25T23:59:59.000Z");
  });
});

test.describe("starting and rolling forward", () => {
  test("a new Free account starts now with 50, not at last Sunday", () => {
    const now = at("2026-11-18T10:00:00Z");
    const a = startAccount("free", now);
    expect(a.allowance).toBe(50);
    expect(a.periodStart.toISOString()).toBe(now.toISOString());
    expect(a.nextRefillAt!.toISOString()).toBe("2026-11-22T00:00:00.000Z");
  });

  test("a new trial starts with 300 and ends at trial end", () => {
    const now = at("2026-11-15T09:00:00Z");
    const a = startAccount("pro_trial", now);
    expect(a.allowance).toBe(300);
    expect(a.nextRefillAt!.toISOString()).toBe("2026-11-25T23:59:59.000Z");
  });

  test("a new paid plan anchors on today's UK date", () => {
    // 23:30 UTC on 30 Jun is 00:30 on 1 Jul in the UK (BST).
    const a = startAccount("pro", at("2026-06-30T23:30:00Z"));
    expect(a.anchorDay).toBe(1);
    expect(a.allowance).toBe(1000);
  });

  test("nothing changes before the refill", () => {
    const a = startAccount("free", at("2026-11-18T10:00:00Z"));
    const r = rollForward(a, { spent: 40, topupsBought: 0 }, at("2026-11-21T23:59:00Z"));
    expect(r.rolled).toBe(false);
    expect(r.account).toEqual(a);
  });

  test("Free is SET to 50 at Sunday 00:00, not increased by 50", () => {
    const a = startAccount("free", at("2026-11-18T10:00:00Z"));
    const r = rollForward(a, { spent: 10, topupsBought: 0 }, at("2026-11-22T00:00:00Z"));
    expect(r.rolled).toBe(true);
    expect(r.account.allowance).toBe(50);
    expect(r.account.periodStart.toISOString()).toBe("2026-11-22T00:00:00.000Z");
    expect(balance(r.account, { spent: 0, topupsBought: 0 }).total).toBe(50);
  });

  test("the clocks-forward night: refill at Sun 28 Mar 2027 00:00 GMT", () => {
    const a = startAccount("free", at("2027-03-24T12:00:00Z"));
    expect(a.nextRefillAt!.toISOString()).toBe("2027-03-28T00:00:00.000Z");
    const r = rollForward(a, { spent: 50, topupsBought: 0 }, at("2027-03-28T01:30:00Z"));
    expect(r.account.allowance).toBe(50);
    // The next one is in BST: Sun 4 Apr 00:00 UK = Sat 3 Apr 23:00 UTC.
    expect(r.account.nextRefillAt!.toISOString()).toBe("2027-04-03T23:00:00.000Z");
  });

  test("a row untouched for weeks rolls to the current week, not the next one", () => {
    const a = startAccount("free", at("2026-11-02T10:00:00Z"));
    const r = rollForward(a, { spent: 0, topupsBought: 0 }, at("2026-11-25T10:00:00Z"));
    expect(r.account.periodStart.toISOString()).toBe("2026-11-22T00:00:00.000Z");
    expect(r.account.nextRefillAt!.toISOString()).toBe("2026-11-29T00:00:00.000Z");
  });

  test("overspend past the allowance comes off the top-ups when the period closes", () => {
    const a = startAccount("standard", at("2026-11-03T10:00:00Z"));
    const r = rollForward(a, { spent: 620, topupsBought: 500 }, at("2026-12-03T00:00:01Z"));
    expect(r.account.topupSpent).toBe(120);
    expect(r.account.allowance).toBe(500);
    expect(balance(r.account, { spent: 0, topupsBought: 500 })).toMatchObject({
      allowanceLeft: 500,
      topupLeft: 380,
      total: 880,
    });
  });

  test("unused allowance is lost and top-ups are untouched", () => {
    const a = startAccount("pro", at("2026-11-03T10:00:00Z"));
    const r = rollForward(a, { spent: 100, topupsBought: 1500 }, at("2026-12-03T00:00:01Z"));
    expect(r.account.topupSpent).toBe(0);
    expect(balance(r.account, { spent: 0, topupsBought: 1500 }).total).toBe(2500);
  });

  test("the top-up pool never goes below zero, however far the overspend ran", () => {
    const a = startAccount("pro", at("2026-11-03T10:00:00Z"));
    const r = rollForward(a, { spent: 2000, topupsBought: 500 }, at("2026-12-03T00:00:01Z"));
    expect(r.account.topupSpent).toBe(500);
  });

  test("a trial past its end does not refill itself", () => {
    const a = startAccount("pro_trial", at("2026-11-15T09:00:00Z"));
    const r = rollForward(a, { spent: 10, topupsBought: 0 }, at("2026-11-26T09:00:00Z"));
    expect(r.rolled).toBe(false);
    expect(r.trialOver).toBe(true);
  });
});

test.describe("the balance", () => {
  const a = (): ResourceAccount => startAccount("free", at("2026-11-18T10:00:00Z"));

  test("allowance first, then top-ups", () => {
    const acc = { ...startAccount("standard", at("2026-11-03T10:00:00Z")), topupSpent: 100 };
    expect(balance(acc, { spent: 450, topupsBought: 500 })).toMatchObject({
      allowanceLeft: 50,
      topupLeft: 400,
      total: 450,
    });
    expect(balance(acc, { spent: 600, topupsBought: 500 })).toMatchObject({
      allowanceLeft: 0,
      topupLeft: 300,
      total: 300,
    });
  });

  test("floors at 0: a finished deck can tip past it and never shows negative", () => {
    expect(balance(a(), { spent: 64.2, topupsBought: 0 })).toMatchObject({
      allowanceLeft: 0,
      topupLeft: 0,
      total: 0,
    });
  });

  test("a fractional spend shows as whole resources, rounded down", () => {
    expect(balance(a(), { spent: 2.4, topupsBought: 0 }).total).toBe(47);
  });

  test("garbage in (negative or NaN spend) never gives more than the allowance", () => {
    expect(balance(a(), { spent: -40, topupsBought: 0 }).total).toBe(50);
    expect(balance(a(), { spent: Number.NaN, topupsBought: 0 }).total).toBe(50);
  });
});

test.describe("changing plan", () => {
  test("Standard to Pro mid-month adds 500 now and keeps the refill date", () => {
    const s = startAccount("standard", at("2026-11-03T10:00:00Z"));
    const p = changePlan(s, "standard", "pro", at("2026-11-18T10:00:00Z"));
    expect(p.allowance).toBe(1000);
    expect(p.nextRefillAt).toEqual(s.nextRefillAt);
    expect(p.periodStart).toEqual(s.periodStart);
    expect(balance(p, { spent: 400, topupsBought: 0 }).total).toBe(600);
  });

  test("Pro to Standard waits for the refill; the next period is Standard's", () => {
    const pro = startAccount("pro", at("2026-11-03T10:00:00Z"));
    const down = changePlan(pro, "pro", "standard", at("2026-11-18T10:00:00Z"));
    expect(down.allowance).toBe(1000);
    expect(down.plan).toBe("standard");
    const r = rollForward(down, { spent: 0, topupsBought: 0 }, at("2026-12-03T00:00:01Z"));
    expect(r.account.allowance).toBe(500);
  });

  test("any move to Free starts a fresh 50 at once", () => {
    for (const from of ["pro_trial", "standard", "pro", "max"] as const) {
      const acc = startAccount(from, at("2026-11-03T10:00:00Z"));
      const now = at("2026-11-18T10:00:00Z");
      const f = changePlan(acc, from, "free", now);
      expect(f.allowance).toBe(50);
      expect(f.periodStart.toISOString()).toBe(now.toISOString());
      expect(f.nextRefillAt!.toISOString()).toBe("2026-11-22T00:00:00.000Z");
    }
  });

  test("paying from Free or the trial starts the full allowance on today's date", () => {
    const now = at("2026-11-18T10:00:00Z");
    for (const from of ["free", "pro_trial"] as const) {
      const p = changePlan(startAccount(from, at("2026-11-15T09:00:00Z")), from, "max", now);
      expect(p.allowance).toBe(2500);
      expect(p.anchorDay).toBe(18);
      expect(p.periodStart.toISOString()).toBe(now.toISOString());
      expect(p.nextRefillAt!.toISOString()).toBe("2026-12-18T00:00:00.000Z");
    }
  });

  test("top-ups bought are kept across every plan change", () => {
    const acc = { ...startAccount("pro", at("2026-11-03T10:00:00Z")), topupSpent: 200 };
    expect(changePlan(acc, "pro", "free", at("2026-11-18T10:00:00Z")).topupSpent).toBe(200);
  });

  test("the same plan again changes nothing", () => {
    const acc = startAccount("pro", at("2026-11-03T10:00:00Z"));
    expect(changePlan(acc, "pro", "pro", at("2026-11-18T10:00:00Z"))).toEqual(acc);
  });
});

test.describe("the estimate check (P3)", () => {
  test("allowed when the rounded estimate fits", () => {
    expect(estimateCheck(17, 20)).toEqual({ ok: true });
    // 17 rounds to 15, so 15 left is enough.
    expect(estimateCheck(17, 15)).toEqual({ ok: true });
  });

  test("refused with both numbers when it does not", () => {
    expect(estimateCheck(29.5, 12)).toEqual({
      ok: false,
      needed: 30,
      left: 12,
      message: "This usually needs about 30. You have 12.",
    });
  });

  test("0 left refuses even the cheapest tool", () => {
    expect(estimateCheck(0.1, 0).ok).toBe(false);
  });

  test("P3 payload: Free gets the Sunday version, the trial its own", () => {
    const refill = at("2026-11-22T00:00:00Z");
    const free = outOfResourcesPayload("free", { needed: 30, left: 12, refillAt: refill });
    expect(free).toMatchObject({ prompt: "P3", variant: "free", needed: 30, left: 12 });
    expect(free.refillAt).toBe(refill.toISOString());
    expect(outOfResourcesPayload("pro_trial", { needed: 30, left: 0, refillAt: null })).toMatchObject({
      prompt: "P3",
      variant: "trial",
    });
    // Paid plans are offered a top-up, not P3.
    expect(outOfResourcesPayload("standard", { needed: 30, left: 2, refillAt: refill })).toMatchObject({
      prompt: null,
      variant: "topup",
    });
  });
});

test.describe("no double counting", () => {
  test("a new period never starts before the refill that closed the old one", () => {
    // A refill date that is out of step with the anchor (an admin edit, say).
    const a = { ...startAccount("pro", at("2026-11-03T10:00:00Z")), nextRefillAt: at("2026-12-03T12:00:00Z") };
    const r = rollForward(a, { spent: 0, topupsBought: 0 }, at("2026-12-03T13:00:00Z"));
    expect(r.account.periodStart.toISOString()).toBe("2026-12-03T12:00:00.000Z");
  });
});
