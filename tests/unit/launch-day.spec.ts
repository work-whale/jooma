import { test, expect } from "@playwright/test";
import { launchMove, e16Eligible, E16_COPY, type LaunchAccount } from "@/app/lib/launch-day";

/*
 * Existing accounts on launch day (spec Step 8, plan 2j).
 *
 * Edge cases: a payer (incl. past_due) is never touched; a comp (admin or
 * ambassador Pro with no Stripe id) is never touched; a live old trial runs to
 * its end; an expired old trial and a never-paid signup get Free plus a pending
 * trial; a former payer gets Free with NO new trial; an email that already had
 * a trial gets no second one; admins are skipped; E16 only to group 3, only
 * with consent, never to an opted-out address.
 */

const now = new Date("2026-11-26T09:00:00Z");
const acc = (over: Partial<LaunchAccount> = {}): LaunchAccount => ({
  plan: "free",
  subscriptionStatus: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  hasPaid: false,
  isAdmin: false,
  emailHadTrial: false,
  optedOut: false,
  ...over,
});

test.describe("who moves where", () => {
  test("payers and comps are untouched", () => {
    expect(launchMove(acc({ plan: "pro", subscriptionStatus: "active", stripeSubscriptionId: "sub_1", hasPaid: true }), now)).toBe("keep");
    expect(launchMove(acc({ plan: "max", subscriptionStatus: "past_due", stripeSubscriptionId: "sub_2", hasPaid: true }), now)).toBe("keep");
    expect(launchMove(acc({ plan: "pro", subscriptionStatus: "active" }), now)).toBe("keep");
    expect(launchMove(acc({ isAdmin: true }), now)).toBe("keep");
  });

  test("a live old trial runs to its end", () => {
    const live = acc({ plan: "standard", subscriptionStatus: "trialing", currentPeriodEnd: "2026-11-27T10:00:00Z" });
    expect(launchMove(live, now)).toBe("trial_runs_out");
  });

  test("never paid: Free plus a 10-day trial that starts at next login", () => {
    expect(launchMove(acc(), now)).toBe("free_trial_pending");
    const expired = acc({ plan: "standard", subscriptionStatus: "trialing", currentPeriodEnd: "2026-11-20T10:00:00Z" });
    expect(launchMove(expired, now)).toBe("free_trial_pending");
  });

  test("a former payer goes to Free with no new trial", () => {
    expect(launchMove(acc({ hasPaid: true, subscriptionStatus: "canceled" }), now)).toBe("free");
  });

  test("an email that already had the 4.5 trial gets no second one", () => {
    expect(launchMove(acc({ emailHadTrial: true }), now)).toBe("free");
  });
});

test.describe("E16", () => {
  test("only group 3, only with consent, never opted out", () => {
    expect(e16Eligible(acc(), now, { consented: true })).toBe(true);
    expect(e16Eligible(acc(), now, { consented: false })).toBe(false);
    expect(e16Eligible(acc({ optedOut: true }), now, { consented: true })).toBe(false);
    expect(e16Eligible(acc({ hasPaid: true }), now, { consented: true })).toBe(false);
  });

  test("copy", () => {
    expect(E16_COPY.subject).toBe("Jooma now has a free plan");
    expect(E16_COPY.body).toContain("50 resources every Sunday");
    expect(JSON.stringify(E16_COPY)).not.toMatch(/credit|–|—|\bAI\b/);
  });
});
