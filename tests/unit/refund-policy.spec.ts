import { test, expect } from "@playwright/test";
import {
  REFUND_WINDOWS,
  auditReason,
  describeCharge,
  daysInWords,
  inPolicy,
  parseRule,
  reasonFromBilling,
  intervalFromStripe,
  refundOptions,
  topUpGrantToReverse,
  topUpLeftForPack,
  unusedWholeMonths,
  windowEnd,
  type ChargeFacts,
  type RefundOption,
} from "@/app/lib/refund-policy";

/*
 * The refund rules, from docs/18-jooma-refund-policy.html.
 *
 * The engine ADVISES. The admin console shows what the policy allows and
 * suggests an amount; the server never refuses on policy grounds (clause 9:
 * "write to us anyway"). So every test here is about what is OFFERED, and the
 * ones that matter most are the refusals: a rule offered when it should not be
 * means an admin refunds a teacher who was not owed it, and a rule withheld
 * when it should apply means a teacher is turned away who was.
 *
 * Amounts are pence. Dates are written as ISO instants with a Z so the UK
 * wall clock is worked out by the code, not by the test machine's timezone.
 * The UK-time edges are the heart of it: a window runs to 23:59:59.999 UK time
 * on the calendar day N days after the charge's UK date, and a charge made just
 * before midnight UTC in summer is already "tomorrow" in the UK.
 */

const D = (iso: string) => new Date(iso);

function facts(over: Partial<ChargeFacts> = {}): ChargeFacts {
  return {
    kind: "subscription",
    interval: "month",
    reason: "renewal",
    chargedAt: D("2026-05-01T10:00:00Z"),
    amount: 799,
    amountRefunded: 0,
    periodEnd: D("2026-06-01T10:00:00Z"),
    spentSinceCharge: 25,
    topUp: null,
    ...over,
  };
}

const rules = (opts: RefundOption[]) => opts.map((o) => o.rule);
const find = (opts: RefundOption[], rule: string) => opts.find((o) => o.rule === rule);

test.describe("the windows", () => {
  test("the three numbers the page and the engine share", () => {
    expect(REFUND_WINDOWS).toEqual({ coolingOffDays: 14, unwantedRenewalDays: 30, topUpDays: 14 });
  });

  test("windowEnd is 23:59:59.999 UK time, N days after the UK date, in winter", () => {
    expect(windowEnd(D("2026-01-10T10:00:00Z"), 14).toISOString()).toBe("2026-01-24T23:59:59.999Z");
  });

  test("a charge at 23:30 UTC in summer is already the next day in the UK", () => {
    // 23:30Z on 10 July is 00:30 BST on 11 July, so day 14 is 25 July BST.
    // A UTC based answer would be 24 July 23:59:59 UTC, an hour and a day early.
    expect(windowEnd(D("2026-07-10T23:30:00Z"), 14).toISOString()).toBe("2026-07-25T22:59:59.999Z");
  });

  test("across the March clock change the window ends at BST midnight, not GMT", () => {
    // Charged 20 March (GMT), clocks go forward 29 March, day 14 is 3 April.
    expect(windowEnd(D("2026-03-20T12:00:00Z"), 14).toISOString()).toBe("2026-04-03T22:59:59.999Z");
  });

  test("across the October clock change the window ends at GMT midnight, not BST", () => {
    // Charged 20 October (BST), clocks go back 25 October, day 14 is 3 November.
    expect(windowEnd(D("2026-10-20T12:00:00Z"), 14).toISOString()).toBe("2026-11-03T23:59:59.999Z");
  });
});

test.describe("cooling off, monthly (clause 3)", () => {
  test("day 14 at 23:59 UK is in, day 15 at 00:00 UK is out (GMT)", () => {
    const f = facts({ chargedAt: D("2026-01-10T10:00:00Z"), reason: "first", spentSinceCharge: null });
    expect(rules(refundOptions(f, D("2026-01-24T23:59:00Z")))).toContain("cooling_off");
    expect(rules(refundOptions(f, D("2026-01-25T00:00:00Z")))).not.toContain("cooling_off");
  });

  test("day 14 / day 15 in summer, on a charge made after midnight UK but before midnight UTC", () => {
    const f = facts({ chargedAt: D("2026-07-10T23:30:00Z"), reason: "first", spentSinceCharge: null });
    expect(rules(refundOptions(f, D("2026-07-25T22:59:00Z")))).toContain("cooling_off");
    expect(rules(refundOptions(f, D("2026-07-25T23:00:00Z")))).not.toContain("cooling_off");
  });

  test("across the March clock change", () => {
    const f = facts({ chargedAt: D("2026-03-20T12:00:00Z"), reason: "first", spentSinceCharge: null });
    expect(rules(refundOptions(f, D("2026-04-03T22:59:00Z")))).toContain("cooling_off");
    expect(rules(refundOptions(f, D("2026-04-03T23:00:00Z")))).not.toContain("cooling_off");
  });

  test("across the October clock change (an hour that a BST based window would wrongly refuse)", () => {
    const f = facts({ chargedAt: D("2026-10-20T12:00:00Z"), reason: "first", spentSinceCharge: null });
    expect(rules(refundOptions(f, D("2026-11-03T23:30:00Z")))).toContain("cooling_off");
    expect(rules(refundOptions(f, D("2026-11-04T00:00:00Z")))).not.toContain("cooling_off");
  });

  test("the half price first month refunds the 399 actually paid, in full, first", () => {
    const f = facts({ amount: 399, reason: "first", spentSinceCharge: null });
    const opts = refundOptions(f, D("2026-05-03T10:00:00Z"));
    expect(opts[0]).toMatchObject({ rule: "cooling_off", clause: 3, amount: 399 });
    expect(opts[0].label).toBe("Within 14 days of payment (clause 3)");
  });

  test("cooling off covers a renewal and a plan change payment too, not only the first", () => {
    for (const reason of ["renewal", "change"] as const) {
      const opts = refundOptions(facts({ reason }), D("2026-05-03T10:00:00Z"));
      expect(rules(opts)).toContain("cooling_off");
    }
  });

  test("after 14 days a monthly payment gets only the fault option, whatever the reason", () => {
    for (const reason of ["first", "renewal", "change", null] as const) {
      const opts = refundOptions(facts({ reason, spentSinceCharge: 40 }), D("2026-05-20T10:00:00Z"));
      expect(rules(opts), String(reason)).toEqual(["our_fault"]);
    }
  });
});

test.describe("an unwanted renewal (clause 6)", () => {
  // Charged 1 May 10:00 BST. Day 30 is 31 May, ends 22:59:59.999Z.
  const renewal = (over: Partial<ChargeFacts> = {}) => facts({ reason: "renewal", spentSinceCharge: 0, ...over });

  test("day 30 is in, day 31 is out", () => {
    expect(rules(refundOptions(renewal(), D("2026-05-31T22:59:00Z")))).toEqual(["unwanted_renewal", "our_fault"]);
    expect(rules(refundOptions(renewal(), D("2026-05-31T23:00:00Z")))).toEqual(["our_fault"]);
  });

  test("any use since the payment withdraws it", () => {
    expect(rules(refundOptions(renewal({ spentSinceCharge: 0.5 }), D("2026-05-20T10:00:00Z")))).toEqual(["our_fault"]);
    expect(rules(refundOptions(renewal({ spentSinceCharge: 25 }), D("2026-05-20T10:00:00Z")))).toEqual(["our_fault"]);
  });

  test("unknown usage is not treated as zero usage", () => {
    expect(rules(refundOptions(renewal({ spentSinceCharge: null }), D("2026-05-20T10:00:00Z")))).toEqual(["our_fault"]);
  });

  test("a first payment never gets it, nor does a plan change, nor an unknown reason", () => {
    for (const reason of ["first", "change", null] as const) {
      const opts = refundOptions(renewal({ reason }), D("2026-05-20T10:00:00Z"));
      expect(rules(opts), String(reason)).toEqual(["our_fault"]);
    }
  });

  test("a top up is not a renewal even if it says so", () => {
    const opts = refundOptions(
      renewal({ kind: "topup", interval: null, topUp: { units: 500, left: 100 } }),
      D("2026-05-20T10:00:00Z"),
    );
    expect(rules(opts)).toEqual(["our_fault"]);
  });

  test("inside the cooling off window both apply, cooling off listed first", () => {
    const opts = refundOptions(renewal(), D("2026-05-03T10:00:00Z"));
    expect(rules(opts)).toEqual(["cooling_off", "unwanted_renewal", "our_fault"]);
    expect(find(opts, "unwanted_renewal")).toMatchObject({ clause: 6, amount: 799 });
  });
});

test.describe("top ups (clause 5)", () => {
  const topup = (over: Partial<ChargeFacts> = {}) =>
    facts({
      kind: "topup",
      interval: null,
      reason: null,
      amount: 499,
      spentSinceCharge: null,
      periodEnd: null,
      topUp: { units: 1500, left: 1500 },
      ...over,
    });

  test("fully unspent inside 14 days: refund in full", () => {
    const opts = refundOptions(topup(), D("2026-05-05T10:00:00Z"));
    expect(opts[0]).toMatchObject({ rule: "topup_unspent", clause: 5, amount: 499 });
  });

  test("a left over pool bigger than the pack still counts as unspent (other packs add to it)", () => {
    const opts = refundOptions(topup({ topUp: { units: 1500, left: 4000 } }), D("2026-05-05T10:00:00Z"));
    expect(rules(opts)).toContain("topup_unspent");
  });

  test("one resource spent, and it is refused", () => {
    const opts = refundOptions(topup({ topUp: { units: 1500, left: 1499 } }), D("2026-05-05T10:00:00Z"));
    expect(rules(opts)).toEqual(["our_fault"]);
  });

  test("day 14 in, day 15 out", () => {
    // Charged 1 May 10:00 BST, day 14 is 15 May, ends 22:59:59.999Z.
    expect(rules(refundOptions(topup(), D("2026-05-15T22:59:00Z")))).toContain("topup_unspent");
    expect(rules(refundOptions(topup(), D("2026-05-15T23:00:00Z")))).not.toContain("topup_unspent");
  });

  test("a part refunded top up is refused, and the fault option shows only what is left", () => {
    const opts = refundOptions(topup({ amountRefunded: 100 }), D("2026-05-05T10:00:00Z"));
    expect(rules(opts)).toEqual(["our_fault"]);
    expect(opts[0].amount).toBe(399);
  });

  test("no pool figure means no top up option", () => {
    expect(rules(refundOptions(topup({ topUp: null }), D("2026-05-05T10:00:00Z")))).toEqual(["our_fault"]);
  });

  test("a pack of zero units is not 'unspent'", () => {
    const opts = refundOptions(topup({ topUp: { units: 0, left: 0 } }), D("2026-05-05T10:00:00Z"));
    expect(rules(opts)).toEqual(["our_fault"]);
  });

  test("a top up gets no cooling off", () => {
    expect(rules(refundOptions(topup({ topUp: { units: 1500, left: 10 } }), D("2026-05-05T10:00:00Z")))).not.toContain(
      "cooling_off",
    );
  });
});

test.describe("yearly plans (clause 4)", () => {
  const yearly = (over: Partial<ChargeFacts> = {}) =>
    facts({
      interval: "year",
      reason: "first",
      amount: 7199,
      chargedAt: D("2026-01-01T10:00:00Z"),
      periodEnd: D("2027-01-01T00:00:00Z"),
      spentSinceCharge: null,
      ...over,
    });

  test("inside its 14 days it is refunded in full under clause 4, never pro rata", () => {
    const opts = refundOptions(yearly(), D("2026-01-10T10:00:00Z"));
    expect(opts[0]).toMatchObject({ rule: "cooling_off", clause: 4, amount: 7199 });
    expect(opts[0].label).toBe("Within 14 days of payment (clause 4)");
    expect(rules(opts)).not.toContain("yearly_unused_months");
  });

  test("20 Feb with the period ending next 1 Jan: 10 whole unused months", () => {
    const opts = refundOptions(yearly(), D("2026-02-20T10:00:00Z"));
    const pro = find(opts, "yearly_unused_months")!;
    // 7199 * 10 / 12 = 5999.17, rounded.
    expect(pro.amount).toBe(5999);
    expect(pro.clause).toBe(4);
    expect(pro.note).toContain("No evidence needed");
    expect(rules(opts)).toEqual(["yearly_unused_months", "our_fault"]);
  });

  test("the bigger yearly price rounds the same way", () => {
    const opts = refundOptions(yearly({ amount: 14399 }), D("2026-02-20T10:00:00Z"));
    expect(find(opts, "yearly_unused_months")!.amount).toBe(11999);
  });

  test("the first day after the window gives 11 months", () => {
    const opts = refundOptions(yearly(), D("2026-01-16T10:00:00Z"));
    expect(find(opts, "yearly_unused_months")!.amount).toBe(6599);
  });

  test("in the last month there is no whole month to give back", () => {
    const opts = refundOptions(yearly(), D("2026-12-05T10:00:00Z"));
    expect(rules(opts)).toEqual(["our_fault"]);
  });

  test("a period that has already ended gives nothing", () => {
    const opts = refundOptions(yearly(), D("2027-02-05T10:00:00Z"));
    expect(rules(opts)).toEqual(["our_fault"]);
  });

  test("unknown period end gives nothing rather than a guess", () => {
    const opts = refundOptions(yearly({ periodEnd: null }), D("2026-02-20T10:00:00Z"));
    expect(rules(opts)).toEqual(["our_fault"]);
  });

  test("a monthly plan never gets pro rata", () => {
    const opts = refundOptions(facts({ interval: "month" }), D("2026-05-20T10:00:00Z"));
    expect(rules(opts)).not.toContain("yearly_unused_months");
  });

  test("the pro rata amount is capped at what is left to refund", () => {
    const opts = refundOptions(yearly({ amountRefunded: 2000 }), D("2026-02-20T10:00:00Z"));
    expect(find(opts, "yearly_unused_months")!.amount).toBe(5199);
  });
});

test.describe("our fault (clause 7)", () => {
  test("always offered, for the whole remaining amount, with the note", () => {
    const opts = refundOptions(facts(), D("2026-09-01T10:00:00Z"));
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ rule: "our_fault", clause: 7, amount: 799 });
    expect(opts[0].label).toBe("Our fault, no time limit (clause 7)");
    expect(opts[0].note).toContain("Charged twice");
  });

  test("a payment that is neither a plan nor a top up gets only this", () => {
    const opts = refundOptions(facts({ kind: "other", interval: null, reason: null }), D("2026-05-02T10:00:00Z"));
    expect(rules(opts)).toEqual(["our_fault"]);
  });
});

test.describe("what is left to refund", () => {
  test("every amount is the remaining amount on a part refunded charge", () => {
    const opts = refundOptions(facts({ amountRefunded: 300, spentSinceCharge: 0 }), D("2026-05-03T10:00:00Z"));
    expect(opts.map((o) => o.amount)).toEqual([499, 499, 499]);
  });

  test("a fully refunded charge offers nothing at all", () => {
    expect(refundOptions(facts({ amountRefunded: 799 }), D("2026-05-03T10:00:00Z"))).toEqual([]);
  });

  test("an over refunded or zero charge offers nothing either", () => {
    expect(refundOptions(facts({ amountRefunded: 900 }), D("2026-05-03T10:00:00Z"))).toEqual([]);
    expect(refundOptions(facts({ amount: 0 }), D("2026-05-03T10:00:00Z"))).toEqual([]);
  });
});

test.describe("inPolicy", () => {
  test("nothing, or only the fault or pro rata options, is not in policy", () => {
    expect(inPolicy([])).toBe(false);
    const fault: RefundOption = { rule: "our_fault", clause: 7, amount: 1, label: "x" };
    const pro: RefundOption = { rule: "yearly_unused_months", clause: 4, amount: 1, label: "x" };
    expect(inPolicy([fault])).toBe(false);
    expect(inPolicy([pro, fault])).toBe(false);
  });

  test("each window rule makes it in policy", () => {
    const o = (rule: RefundOption["rule"]): RefundOption => ({ rule, clause: 3, amount: 1, label: "x" });
    expect(inPolicy([o("cooling_off")])).toBe(true);
    expect(inPolicy([o("unwanted_renewal"), o("our_fault")])).toBe(true);
    expect(inPolicy([o("topup_unspent")])).toBe(true);
  });

  test("end to end: a late monthly charge is outside the windows, a fresh one inside", () => {
    expect(inPolicy(refundOptions(facts(), D("2026-05-20T10:00:00Z")))).toBe(false);
    expect(inPolicy(refundOptions(facts(), D("2026-05-02T10:00:00Z")))).toBe(true);
  });
});

test.describe("unusedWholeMonths", () => {
  test("counts whole months only", () => {
    expect(unusedWholeMonths(D("2026-02-20T10:00:00Z"), D("2027-01-01T00:00:00Z"))).toBe(10);
    expect(unusedWholeMonths(D("2026-01-16T10:00:00Z"), D("2027-01-01T00:00:00Z"))).toBe(11);
    expect(unusedWholeMonths(D("2026-12-05T10:00:00Z"), D("2027-01-01T00:00:00Z"))).toBe(0);
  });

  test("a whole number of months exactly", () => {
    expect(unusedWholeMonths(D("2026-10-01T10:00:00Z"), D("2027-01-01T10:00:00Z"))).toBe(3);
  });

  test("never negative once the period has ended", () => {
    expect(unusedWholeMonths(D("2027-03-01T10:00:00Z"), D("2027-01-01T00:00:00Z"))).toBe(0);
  });
});

test.describe("the rule and the audit note the admin console sends", () => {
  test("parseRule accepts the five rules and nothing else", () => {
    for (const r of ["cooling_off", "unwanted_renewal", "topup_unspent", "yearly_unused_months", "our_fault"]) {
      expect(parseRule(r)).toBe(r);
    }
    expect(parseRule("goodwill")).toBeNull();
    expect(parseRule("")).toBeNull();
    expect(parseRule(undefined)).toBeNull();
    expect(parseRule(3)).toBeNull();
    // Not a prototype key lookup.
    expect(parseRule("toString")).toBeNull();
  });

  test("auditReason puts the clause in front of the person's reason", () => {
    expect(auditReason("cooling_off", null, "Wrong plan")).toBe("Clause 3: Wrong plan");
    expect(auditReason("cooling_off", "year", "Wrong plan")).toBe("Clause 4: Wrong plan");
    expect(auditReason("unwanted_renewal", null, "Forgot")).toBe("Clause 6: Forgot");
    expect(auditReason("topup_unspent", null, "x")).toBe("Clause 5: x");
    expect(auditReason("yearly_unused_months", "year", "x")).toBe("Clause 4: x");
    expect(auditReason("our_fault", null, "Charged twice")).toBe("Clause 7: Charged twice");
  });

  test("no rule leaves the reason exactly as typed", () => {
    expect(auditReason(null, null, "Just because")).toBe("Just because");
  });
});

test.describe("describing a charge", () => {
  test("a plan payment", () => {
    expect(describeCharge({ kind: "subscription", interval: "month", reason: "renewal" }, "Pro", null)).toBe(
      "Pro, monthly, renewal",
    );
    expect(describeCharge({ kind: "subscription", interval: "year", reason: "first" }, "Standard", null)).toBe(
      "Standard, yearly, first payment",
    );
    expect(describeCharge({ kind: "subscription", interval: "month", reason: "change" }, "Max", null)).toBe(
      "Max, monthly, plan change",
    );
  });

  test("a plan payment with nothing known says so plainly", () => {
    expect(describeCharge({ kind: "subscription", interval: null, reason: null }, null, null)).toBe("Subscription");
  });

  test("a top up", () => {
    expect(describeCharge({ kind: "topup", interval: null, reason: null }, null, 1500)).toBe("Top up, 1,500 resources");
    expect(describeCharge({ kind: "topup", interval: null, reason: null }, null, null)).toBe("Top up");
  });

  test("anything else", () => {
    expect(describeCharge({ kind: "other", interval: null, reason: null }, null, null)).toBe("Payment");
  });
});

test.describe("number words for the page", () => {
  test("the numbers the page spells out", () => {
    expect(daysInWords(REFUND_WINDOWS.coolingOffDays)).toBe("Fourteen");
    expect(daysInWords(REFUND_WINDOWS.unwantedRenewalDays)).toBe("Thirty");
    expect(daysInWords(10)).toBe("Ten");
  });

  test("a number it does not know falls back to the digits", () => {
    expect(daysInWords(21)).toBe("21");
  });
});

test.describe("which grant a refunded top up takes back", () => {
  const purchase = { user_id: "u1", units: 1500, created_at: "2026-05-01T10:00:00.000Z" };
  const grant = (over: Partial<Parameters<typeof topUpGrantToReverse>[1][number]> = {}) => ({
    id: "g1",
    user_id: "u1",
    kind: "resources_topup",
    amount: 1500,
    granted_by: null,
    created_at: "2026-05-01T10:00:02.000Z",
    ...over,
  });

  test("finds the one bought with the purchase", () => {
    expect(topUpGrantToReverse(purchase, [grant()])).toBe("g1");
  });

  test("never a goodwill grant, even a matching one", () => {
    expect(topUpGrantToReverse(purchase, [grant({ granted_by: "admin-1" })])).toBeNull();
  });

  test("not the wrong kind, the wrong amount or another user's", () => {
    expect(topUpGrantToReverse(purchase, [grant({ kind: "credit_gbp" })])).toBeNull();
    expect(topUpGrantToReverse(purchase, [grant({ amount: 1000 })])).toBeNull();
    expect(topUpGrantToReverse(purchase, [grant({ user_id: "u2" })])).toBeNull();
  });

  test("60 seconds either side is in, 61 is out", () => {
    expect(topUpGrantToReverse(purchase, [grant({ created_at: "2026-05-01T10:01:00.000Z" })])).toBe("g1");
    expect(topUpGrantToReverse(purchase, [grant({ created_at: "2026-05-01T09:59:00.000Z" })])).toBe("g1");
    expect(topUpGrantToReverse(purchase, [grant({ created_at: "2026-05-01T10:01:01.000Z" })])).toBeNull();
    expect(topUpGrantToReverse(purchase, [grant({ created_at: "2026-05-01T09:58:59.000Z" })])).toBeNull();
  });

  test("picks the right one out of several, and only one", () => {
    const picked = topUpGrantToReverse(purchase, [
      grant({ id: "old", created_at: "2026-04-01T10:00:00.000Z" }),
      grant({ id: "gift", granted_by: "admin-1" }),
      // Matches too, but 30 seconds off. The closest one to the purchase wins.
      grant({ id: "twin", created_at: "2026-05-01T10:00:30.000Z" }),
      grant({ id: "right" }),
    ]);
    expect(picked).toBe("right");
  });

  test("no grants, no answer", () => {
    expect(topUpGrantToReverse(purchase, [])).toBeNull();
  });

  test("an unreadable date is no match", () => {
    expect(topUpGrantToReverse(purchase, [grant({ created_at: "not a date" })])).toBeNull();
  });
});

test.describe("reading Stripe's words", () => {
  test("billing reason", () => {
    expect(reasonFromBilling("subscription_create")).toBe("first");
    expect(reasonFromBilling("subscription_cycle")).toBe("renewal");
    expect(reasonFromBilling("subscription_update")).toBe("change");
  });

  test("anything else is unknown, never a renewal", () => {
    for (const r of ["manual", "subscription_threshold", "upcoming", "", null, undefined]) {
      expect(reasonFromBilling(r as string | null | undefined)).toBeNull();
    }
  });

  test("interval", () => {
    expect(intervalFromStripe("month")).toBe("month");
    expect(intervalFromStripe("year")).toBe("year");
    expect(intervalFromStripe("week")).toBeNull();
    expect(intervalFromStripe(null)).toBeNull();
  });
});

test.describe("two top ups judged against one shared pool", () => {
  // Security review, 26 Nov: each pack used to be checked against the WHOLE
  // pool, so 500 + 500 with 600 left offered both while 400 had been spent.
  const packs = [
    { chargeId: "ch_a", units: 500 },
    { chargeId: "ch_b", units: 500 },
  ];
  const offered = (left: number) =>
    refundOptions(
      {
        kind: "topup",
        interval: null,
        reason: null,
        chargedAt: new Date("2026-11-20T10:00:00Z"),
        amount: 249,
        amountRefunded: 0,
        periodEnd: null,
        spentSinceCharge: null,
        topUp: { units: 500, left },
      },
      new Date("2026-11-22T10:00:00Z"),
    ).some((o) => o.rule === "topup_unspent");

  test("part of the pool spent: neither pack is offered", () => {
    expect(topUpLeftForPack("ch_a", packs, 600)).toBe(100);
    expect(topUpLeftForPack("ch_b", packs, 600)).toBe(100);
    expect(offered(topUpLeftForPack("ch_a", packs, 600))).toBe(false);
    expect(offered(topUpLeftForPack("ch_b", packs, 600))).toBe(false);
  });

  test("the whole pool unspent: both are offered", () => {
    expect(offered(topUpLeftForPack("ch_a", packs, 1000))).toBe(true);
    expect(offered(topUpLeftForPack("ch_b", packs, 1000))).toBe(true);
  });

  test("a single pack keeps the whole pool, and the result never goes below zero", () => {
    expect(topUpLeftForPack("ch_a", [packs[0]], 600)).toBe(600);
    expect(topUpLeftForPack("ch_a", packs, 200)).toBe(0);
  });
});
