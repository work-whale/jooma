import { test, expect } from "@playwright/test";
import { TRIAL_DAYS } from "@/app/lib/plans";
import { isTrialCheckout, isTrialInvoice, startsTrial, trialDaysFor } from "@/app/lib/trial";

/*
 * The free trial every self-serve plan starts with.
 *
 * Two rules, both pure. trialDaysFor decides whether a checkout carries the
 * trial at all (once per account). isTrialInvoice decides which invoice is the
 * GBP 0 one a trial opens with, so it neither owes an ambassador nor reports a
 * Purchase to Meta before anybody has paid.
 */

test.describe("trialDaysFor", () => {
  test("a first subscription gets the trial", () => {
    expect(TRIAL_DAYS).toBe(3);
    expect(trialDaysFor({ stripe_subscription_id: null })).toBe(3);
    expect(trialDaysFor({})).toBe(3);
    expect(trialDaysFor(null)).toBe(3);
  });

  test("anyone who has subscribed before does not get another", () => {
    // stripe_subscription_id is never cleared, so a teacher who cancelled on
    // day 2 still carries it. Without this they could trial forever.
    expect(trialDaysFor({ stripe_subscription_id: "sub_123" })).toBe(0);
  });
});

test.describe("startsTrial (when Meta's StartTrial fires)", () => {
  test("a checkout that produced a trialing subscription", () => {
    expect(startsTrial({ status: "trialing", trial_end: 1_800_000_000 })).toBe(true);
  });

  test("not a returning subscriber, who pays straight away", () => {
    expect(startsTrial({ status: "active", trial_end: null })).toBe(false);
  });

  test("not a subscription that failed to start", () => {
    expect(startsTrial({ status: "incomplete", trial_end: null })).toBe(false);
  });
});

test.describe("isTrialCheckout (when the browser StartTrial pixel fires)", () => {
  const trialing = { status: "trialing" as const, trial_end: 1_800_000_000 };
  const session = (over: Partial<Parameters<typeof isTrialCheckout>[0]> = {}) => ({
    mode: "subscription",
    client_reference_id: "user-1",
    subscription: trialing,
    ...over,
  });

  test("a checkout that started this user's trial", () => {
    expect(isTrialCheckout(session(), "user-1")).toBe(true);
  });

  test("not somebody else's session, opened from a shared or edited link", () => {
    expect(isTrialCheckout(session(), "user-2")).toBe(false);
    expect(isTrialCheckout(session({ client_reference_id: null }), "user-1")).toBe(false);
  });

  test("not a returning subscriber, who pays straight away", () => {
    expect(
      isTrialCheckout(session({ subscription: { status: "active", trial_end: null } }), "user-1"),
    ).toBe(false);
  });

  test("not a top-up, which is a one-off payment", () => {
    expect(isTrialCheckout(session({ mode: "payment", subscription: null }), "user-1")).toBe(false);
  });

  test("not when the subscription was not expanded", () => {
    expect(isTrialCheckout(session({ subscription: "sub_123" }), "user-1")).toBe(false);
  });
});

test.describe("isTrialInvoice", () => {
  test("the zero invoice a trial opens with", () => {
    expect(isTrialInvoice({ billing_reason: "subscription_create", subtotal: 0 })).toBe(true);
  });

  test("not a first month made free by a 100% ambassador code", () => {
    // The subtotal is the full price and the discount takes the TOTAL to zero.
    // That subscriber is genuinely owed for, so it must not read as a trial.
    expect(isTrialInvoice({ billing_reason: "subscription_create", subtotal: 499 })).toBe(false);
  });

  test("not the first real charge when the trial converts", () => {
    expect(isTrialInvoice({ billing_reason: "subscription_cycle", subtotal: 499 })).toBe(false);
  });

  test("not a mid-cycle plan change", () => {
    expect(isTrialInvoice({ billing_reason: "subscription_update", subtotal: 0 })).toBe(false);
  });
});
