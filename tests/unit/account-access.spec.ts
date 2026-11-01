import { test, expect } from "@playwright/test";
import { accountAccess, eligibleForTrial, type AccessRow } from "@/app/lib/account-access";
import { planChargeLine, planTrialLine } from "@/app/lib/plan-copy";
import { trialRefusalMessage } from "@/app/lib/trial-limits";
import { planGateTitle } from "@/app/lib/guest-actions";

/*
 * What an account may do, from its my_account_access() row. The states that are
 * easy to get wrong are the ones that look alike: a running trial and a finished
 * one before the cron has tidied the row, a review trial and the signup trial,
 * and someone who paid against someone who only ever cancelled a Stripe trial.
 */

const NOW = new Date("2026-11-01T12:00:00Z");
const IN_2H = "2026-11-01T14:00:00Z";
const IN_3D = "2026-11-04T12:00:00Z";
const AGO = "2026-11-01T11:00:00Z";

const row = (over: Partial<AccessRow> = {}): AccessRow => ({
  plan: "free",
  is_admin: false,
  subscription_status: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  current_period_end: null,
  free_trial_started_at: null,
  has_paid: false,
  had_ambassador_pro: false,
  had_review_trial: false,
  free_tries_used: 0,
  ...over,
});

const onTrial = (end: string) =>
  row({
    plan: "standard",
    subscription_status: "trialing",
    current_period_end: end,
    free_trial_started_at: "2026-11-01T00:00:00Z",
  });

test.describe("accountAccess", () => {
  test("a running no-card trial is a trial, with exports", () => {
    const a = accountAccess(onTrial(IN_3D), NOW);
    expect(a.state).toBe("trial");
    expect(a.trialDaysLeft).toBe(3);
    expect(a.trialEndsAt?.toISOString()).toBe(new Date(IN_3D).toISOString());
    expect(a.canExportLibrary).toBe(true);
    expect(a.canStartTrial).toBe(false);
  });

  test("the last two hours still read as one day, not zero", () => {
    expect(accountAccess(onTrial(IN_2H), NOW).trialDaysLeft).toBe(1);
  });

  test("a finished trial is locked before the cron has tidied the row", () => {
    const a = accountAccess(onTrial(AGO), NOW);
    expect(a.state).toBe("locked");
    expect(a.canExportLibrary).toBe(false);
    // It had its trial, so it cannot start another, and it never had a plan.
    expect(a.canStartTrial).toBe(false);
    expect(a.lapsed).toBe(false);
    expect(a.trialEndsAt).toBeNull();
  });

  test("a tidied, finished trial is exactly as locked", () => {
    const a = accountAccess(row({ free_trial_started_at: "2026-10-01T00:00:00Z" }), NOW);
    expect(a.state).toBe("locked");
    expect(a.canStartTrial).toBe(false);
    expect(a.canExportLibrary).toBe(false);
  });

  test("a review trial is a plan here, not the signup trial", () => {
    const review = row({ plan: "standard", subscription_status: "trialing", current_period_end: IN_3D });
    const a = accountAccess(review, NOW);
    expect(a.state).toBe("subscribed");
    expect(a.trialEndsAt).toBeNull();
  });

  test("a Stripe trial is a subscription: the card is on file", () => {
    const a = accountAccess(
      row({ plan: "pro", subscription_status: "trialing", stripe_subscription_id: "sub_1", current_period_end: AGO }),
      NOW,
    );
    expect(a.state).toBe("subscribed");
  });

  test("a comp is a subscription", () => {
    expect(accountAccess(row({ plan: "pro" }), NOW).state).toBe("subscribed");
  });

  test("an admin is never locked, whatever the row says", () => {
    const a = accountAccess(row({ is_admin: true }), NOW);
    expect(a.state).toBe("subscribed");
    expect(a.canExportLibrary).toBe(true);
    expect(a.canStartTrial).toBe(false);
  });

  test("a former payer is locked but keeps their library's exports", () => {
    const a = accountAccess(
      row({ has_paid: true, stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", subscription_status: "canceled" }),
      NOW,
    );
    expect(a.state).toBe("locked");
    expect(a.canExportLibrary).toBe(true);
    expect(a.lapsed).toBe(true);
    expect(a.canStartTrial).toBe(false);
  });

  test("a former ambassador keeps theirs too, with no invoice", () => {
    const a = accountAccess(row({ had_ambassador_pro: true }), NOW);
    expect(a.canExportLibrary).toBe(true);
    expect(a.lapsed).toBe(true);
    expect(a.canStartTrial).toBe(false);
  });

  test("a Stripe trial cancelled before any charge counts as never paid", () => {
    const a = accountAccess(
      row({ stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", subscription_status: "canceled" }),
      NOW,
    );
    expect(a.state).toBe("locked");
    expect(a.canExportLibrary).toBe(false);
    expect(a.canStartTrial).toBe(false);
  });

  test("free tries left count down and never go negative", () => {
    expect(accountAccess(row(), NOW).freeTriesLeft).toBe(3);
    expect(accountAccess(row({ free_tries_used: 2 }), NOW).freeTriesLeft).toBe(1);
    expect(accountAccess(row({ free_tries_used: 9 }), NOW).freeTriesLeft).toBe(0);
    expect(accountAccess(row({ free_tries_used: null }), NOW).freeTriesLeft).toBe(3);
  });
});

test.describe("eligibleForTrial", () => {
  test("an account that has had nothing is eligible", () => {
    expect(eligibleForTrial(row())).toBe(true);
    expect(accountAccess(row(), NOW).canStartTrial).toBe(true);
  });

  const refused: [string, Partial<AccessRow>][] = [
    ["already had the trial", { free_trial_started_at: "2026-10-01T00:00:00Z" }],
    ["has a Stripe customer", { stripe_customer_id: "cus_1" }],
    ["has a Stripe subscription", { stripe_subscription_id: "sub_1" }],
    ["held an ambassador's Pro", { had_ambassador_pro: true }],
    ["had a review trial", { had_review_trial: true }],
    ["is on a plan", { plan: "standard" }],
    ["is an admin", { is_admin: true }],
  ];
  for (const [name, over] of refused) {
    test(`refused when the account ${name}`, () => {
      expect(eligibleForTrial(row(over))).toBe(false);
    });
  }
});

test.describe("trial and charge lines", () => {
  test("a visitor's card says no card and quotes the price", () => {
    expect(planTrialLine("standard")).toBe("3 days free, no card needed. £4.99 a month if you subscribe");
    expect(planTrialLine("standard", "year")).toBe("3 days free, no card needed. £47.99 a year if you subscribe");
  });

  test("a signed in card says what is charged today", () => {
    expect(planChargeLine("pro")).toBe("You will be charged £7.99 today, then £7.99 a month");
    expect(planChargeLine("pro", "year")).toBe("You will be charged £71.99 today, then £71.99 a year");
  });

  test("a code's first payment is what is charged today", () => {
    expect(planChargeLine("pro", "month", { percentOff: 50 })).toBe(
      "You will be charged £3.99 today, then £7.99 a month",
    );
  });

  test("a code does not touch a yearly charge line", () => {
    expect(planChargeLine("pro", "year", { percentOff: 50 })).toBe(
      "You will be charged £71.99 today, then £71.99 a year",
    );
  });

  test("plans with no self-serve price have no line", () => {
    expect(planTrialLine("free")).toBeNull();
    expect(planChargeLine("school")).toBeNull();
  });
});

test.describe("what a locked account is told", () => {
  test("a plan, never a sign up, for every refusal", () => {
    for (const reason of ["used", "daily_cap", "disabled"] as const) {
      expect(trialRefusalMessage(reason, true)).toMatch(/choose a plan/i);
      expect(trialRefusalMessage(reason, true)).not.toMatch(/sign up/i);
      expect(trialRefusalMessage(reason)).toMatch(/sign up/i);
    }
  });

  test("every gate heading asks for a plan", () => {
    for (const action of ["present", "export", "print", "copy", "edit", "share", "generate", "more", null] as const) {
      expect(planGateTitle("worksheet", action)).toMatch(/^Choose a plan/);
    }
  });
});
