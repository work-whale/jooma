import { test, expect } from "@playwright/test";
import {
  AMBASSADOR_RATES,
  MIN_PAYOUT_PENCE,
  addMonths,
  belowMinimum,
  commissionForInvoice,
  gbp,
  nextPayout,
  payoutDateFor,
  periodLabel,
  periodOf,
  periodsBetween,
  rateShares,
  statementsFrom,
  taxYearOf,
  taxYearTotals,
  workedExample,
  type AgreementFacts,
  type InvoiceFacts,
  type LedgerRow,
} from "@/app/lib/ambassador-commission";
import {
  describeDiscount,
  discountsForInterval,
  yearlyEquivalentDiscount,
} from "@/app/lib/ambassador-discount";

/*
 * What an ambassador earns.
 *
 * Monthly subscribers earn the monthly rate for each month they pay while the
 * agreement is live; yearly subscribers earn once. Every rule the webhook relies
 * on is pinned here, because the webhook itself only ever sees one invoice at a
 * time and a wrong answer quietly owes (or forgets) real money.
 */

const APPROVED = new Date("2026-01-10T12:00:00Z");
const ENDS = new Date("2027-01-10T12:00:00Z");
const live: AgreementFacts = { approvedAt: APPROVED, agreementEndsAt: ENDS, hasAnnualAlready: false };

const invoice = (over: Partial<InvoiceFacts> = {}): InvoiceFacts => ({
  plan: "pro",
  interval: "month",
  billingReason: "subscription_cycle",
  paidAt: new Date("2026-06-03T09:00:00Z"),
  isTrial: false,
  ...over,
});

test.describe("commissionForInvoice", () => {
  test("a monthly payment earns that plan's monthly rate", () => {
    for (const plan of ["standard", "pro", "max"] as const) {
      expect(commissionForInvoice(invoice({ plan }), live)).toEqual({
        kind: "recurring",
        plan,
        interval: "month",
        amountPence: AMBASSADOR_RATES.month[plan],
      });
    }
  });

  test("the first monthly charge earns too, including a discounted one", () => {
    expect(
      commissionForInvoice(invoice({ billingReason: "subscription_create" }), live)?.amountPence,
    ).toBe(200);
  });

  test("a proration in the middle of a month earns nothing", () => {
    expect(commissionForInvoice(invoice({ billingReason: "subscription_update" }), live)).toBeNull();
  });

  test("the trial's opening invoice earns nothing", () => {
    expect(
      commissionForInvoice(invoice({ billingReason: "subscription_create", isTrial: true }), live),
    ).toBeNull();
  });

  test("a payment after the agreement ends earns nothing", () => {
    const after = new Date(ENDS.getTime() + 60_000);
    expect(commissionForInvoice(invoice({ paidAt: after }), live)).toBeNull();
    // The last moment of the agreement still counts.
    expect(commissionForInvoice(invoice({ paidAt: ENDS }), live)).not.toBeNull();
  });

  test("an ambassador with no agreement earns nothing", () => {
    expect(
      commissionForInvoice(invoice(), { ...live, agreementEndsAt: null }),
    ).toBeNull();
  });

  test("a payment before approval earns nothing", () => {
    expect(
      commissionForInvoice(invoice({ paidAt: new Date("2025-12-01T00:00:00Z") }), live),
    ).toBeNull();
  });

  test("a yearly plan earns the yearly rate once", () => {
    const first = commissionForInvoice(
      invoice({ interval: "year", plan: "max", billingReason: "subscription_create" }),
      live,
    );
    expect(first).toEqual({ kind: "annual", plan: "max", interval: "year", amountPence: 4800 });

    expect(
      commissionForInvoice(invoice({ interval: "year", billingReason: "subscription_cycle" }), {
        ...live,
        hasAnnualAlready: true,
      }),
    ).toBeNull();
  });

  test("switching from monthly to yearly earns the yearly one-off", () => {
    expect(
      commissionForInvoice(invoice({ interval: "year", billingReason: "subscription_update" }), live)
        ?.kind,
    ).toBe("annual");
  });

  test("a plan that is not sold to teachers earns nothing", () => {
    expect(commissionForInvoice(invoice({ plan: "school" }), live)).toBeNull();
    expect(commissionForInvoice(invoice({ plan: null }), live)).toBeNull();
    expect(commissionForInvoice(invoice({ interval: null }), live)).toBeNull();
  });
});

test.describe("months", () => {
  test("a payment counts towards the London month it was made in", () => {
    // 23:30 on 31 October in London is 22:30 UTC (GMT after the clocks change).
    expect(periodOf(new Date("2026-10-31T22:30:00Z"))).toBe("2026-10-01");
    // 00:30 on 1 November in London is still 31 October in UTC.
    expect(periodOf(new Date("2026-11-01T00:30:00Z"))).toBe("2026-11-01");
    // BST: 00:30 on 1 July in London is 23:30 on 30 June UTC.
    expect(periodOf(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });

  test("months add across years both ways", () => {
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  test("the month switcher lists newest first", () => {
    expect(periodsBetween("2026-08-01", "2026-10-01")).toEqual([
      "2026-10-01",
      "2026-09-01",
      "2026-08-01",
    ]);
    expect(periodLabel("2026-10-01")).toBe("October 2026");
    expect(periodLabel("2026-10-01", false)).toBe("October");
  });

  test("payouts land on the 15th of the next month, or the Monday after a weekend", () => {
    // 15 November 2026 is a Sunday.
    expect(payoutDateFor("2026-10-01").toISOString().slice(0, 10)).toBe("2026-11-16");
    // 15 December 2026 is a Tuesday.
    expect(payoutDateFor("2026-11-01").toISOString().slice(0, 10)).toBe("2026-12-15");
  });

  test("the tax year turns on 6 April", () => {
    expect(taxYearOf(new Date("2026-04-05T12:00:00Z"))).toBe("2025 to 2026");
    expect(taxYearOf(new Date("2026-04-06T12:00:00Z"))).toBe("2026 to 2027");
  });
});

const row = (over: Partial<LedgerRow>): LedgerRow => ({
  period: "2026-09-01",
  kind: "recurring",
  plan: "pro",
  billing_interval: "month",
  amount_pence: 200,
  status: "unpaid",
  paid_at: null,
  ...over,
});

test.describe("statements", () => {
  test("one per month, with refunds as adjustments and reversed rows left out", () => {
    const s = statementsFrom([
      row({ status: "paid", paid_at: "2026-10-15T10:00:00Z" }),
      row({ amount_pence: 2400, kind: "annual", status: "paid", paid_at: "2026-10-15T11:00:00Z" }),
      row({ kind: "adjustment", amount_pence: -200, status: "paid", paid_at: "2026-10-15T11:00:00Z" }),
      row({ status: "reversed" }),
      row({ period: "2026-10-01" }),
    ]);
    expect(s.map((x) => x.period)).toEqual(["2026-10-01", "2026-09-01"]);
    expect(s[1]).toMatchObject({
      commissionPence: 2600,
      adjustmentsPence: -200,
      netPence: 2400,
      paidPence: 2400,
      status: "paid",
      paidOn: "2026-10-15T11:00:00Z",
    });
    expect(s[0].status).toBe("due");
  });

  test("a month partly marked paid says so", () => {
    const s = statementsFrom([row({ status: "paid", paid_at: "2026-10-15T10:00:00Z" }), row({})]);
    expect(s[0].status).toBe("part_paid");
  });

  test("a balance under the minimum rolls forward, and anything owed rides along", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const small = nextPayout([row({ period: "2026-10-01" })], now);
    expect(small).toMatchObject({ runningPence: 200, closedPence: 0, rollsForward: true });

    const enough = nextPayout(
      [row({ period: "2026-09-01", amount_pence: 2000 }), row({ period: "2026-10-01", amount_pence: 600 })],
      now,
    );
    expect(enough).toMatchObject({ closedPence: 2000, runningPence: 600, rollsForward: false });
    expect(belowMinimum(MIN_PAYOUT_PENCE - 1)).toBe(true);
    expect(belowMinimum(MIN_PAYOUT_PENCE)).toBe(false);
    expect(belowMinimum(0)).toBe(false);
  });

  test("tax-year totals count only what was paid", () => {
    expect(
      taxYearTotals([
        row({ status: "paid", paid_at: "2026-04-15T10:00:00Z" }),
        row({ status: "paid", paid_at: "2026-03-15T10:00:00Z" }),
        row({}),
      ]),
    ).toEqual([
      { taxYear: "2026 to 2027", paidPence: 200 },
      { taxYear: "2025 to 2026", paidPence: 200 },
    ]);
  });
});

test.describe("rate card and worked example", () => {
  test("share of revenue is computed from the live plan prices", () => {
    const pro = rateShares().find((r) => r.plan === "pro")!;
    expect(pro.monthlyRatePence).toBe(200);
    expect(pro.sharePct).toBeGreaterThan(0);
    expect(pro.sharePct).toBeLessThan(100);
  });

  test("earnings stop with the agreement, so a late intake earns less", () => {
    const stay = workedExample(0);
    expect(stay).toHaveLength(12);
    expect(stay.reduce((a, m) => a + m.signed, 0)).toBe(1000);
    // Everyone signed is still paying in month 12 when nobody leaves.
    expect(stay[11].paying).toBe(1000);
    expect(stay[11].earnedPence).toBe(1000 * AMBASSADOR_RATES.month.pro);
    // Month 12's intake pays once; month 1's pays twelve times.
    expect(stay[11].intakeToEndPence).toBe(stay[11].signed * 200);
    expect(stay[0].intakeToEndPence).toBe(stay[0].signed * 200 * 12);

    const churn = workedExample(0.04);
    expect(churn[11].cumulativePence).toBeLessThan(stay[11].cumulativePence);
  });

  test("gbp shows pence", () => {
    expect(gbp(150)).toBe("£1.50");
    expect(gbp(4800)).toBe("£48.00");
  });
});

test.describe("the code on monthly and yearly plans", () => {
  test("a percentage becomes a twelfth of it off the first year", () => {
    expect(yearlyEquivalentDiscount({ percentOff: 50 })).toEqual({ percentOff: 4.17 });
    expect(yearlyEquivalentDiscount({ percentOff: 20 })).toEqual({ percentOff: 1.67 });
    expect(yearlyEquivalentDiscount({ percentOff: 100 })).toEqual({ percentOff: 8.33 });
  });

  test("a fixed amount stays the same amount", () => {
    expect(yearlyEquivalentDiscount({ amountOffPence: 300 })).toEqual({ amountOffPence: 300 });
  });

  test("each is described for the period it applies to", () => {
    expect(describeDiscount({ percentOff: 50 }, "month")).toBe("50% off your first month");
    expect(describeDiscount({ percentOff: 4.17 }, "year")).toBe("4.17% off your first year");
    expect(describeDiscount({ percentOff: 1.7 }, "year")).toBe("1.7% off your first year");
    expect(describeDiscount({ amountOffPence: 300 }, "year")).toBe("£3.00 off your first year");
  });

  test("a subscription carries the coupon for the interval it is billed at", () => {
    const ids = { promotionCodeId: "promo_1", yearlyCouponId: "cpn_y" };
    expect(discountsForInterval("month", ids)).toEqual([{ promotion_code: "promo_1" }]);
    expect(discountsForInterval("year", ids)).toEqual([{ coupon: "cpn_y" }]);
  });

  test("an old code with no yearly coupon never discounts a whole year", () => {
    expect(discountsForInterval("year", { promotionCodeId: "promo_1", yearlyCouponId: null })).toBe("");
  });
});
