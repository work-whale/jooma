import { test, expect } from "@playwright/test";
import { launchMove, e16Group, e16Notice, type LaunchAccount, type LaunchNoticeRow } from "@/app/lib/launch-day";

/*
 * Existing accounts on launch day (spec Step 8, plan 2j).
 *
 * Edge cases: a payer (incl. past_due) is never touched; a comp (admin or
 * ambassador Pro with no Stripe id) is never touched; a live old trial runs to
 * its end; an expired old trial and a never-paid signup get Free plus a pending
 * trial; a former payer gets Free with NO new trial; an email that already had
 * a trial gets no second one; admins are skipped. E16 (below) is a service notice to every group.
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

/*
 * E16 is a SERVICE notice (owner's decision, 18 Nov): every account is told
 * what launch day did to it, so it goes to every group, consent or not, with
 * no selling. The group is read back from the profile after the move.
 */
const row = (over: Partial<LaunchNoticeRow> = {}): LaunchNoticeRow => ({
  plan: "free",
  isAdmin: false,
  trialPending: false,
  subscriptionStatus: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  deletionScheduled: false,
  ...over,
});

test.describe("E16: which notice, after the move", () => {
  test("a pending trial is the never-paid group", () => {
    expect(e16Group(row({ trialPending: true }), now)).toBe("free_trial_pending");
  });

  test("Free with no pending trial is the former-payer group", () => {
    expect(e16Group(row(), now)).toBe("free");
  });

  test("an old no-card trial still running", () => {
    expect(
      e16Group(row({ plan: "standard", subscriptionStatus: "trialing", currentPeriodEnd: "2026-11-28T00:00:00Z" }), now),
    ).toBe("trial_runs_out");
  });

  test("payers and comps", () => {
    expect(e16Group(row({ plan: "pro", subscriptionStatus: "active", stripeSubscriptionId: "sub_1" }), now)).toBe("keep");
    expect(e16Group(row({ plan: "max" }), now)).toBe("keep");
  });

  test("nobody else: admins, accounts being deleted, and 4.5 signups on the trial", () => {
    expect(e16Group(row({ isAdmin: true }), now)).toBeNull();
    expect(e16Group(row({ deletionScheduled: true }), now)).toBeNull();
    expect(e16Group(row({ plan: "pro_trial" }), now)).toBeNull();
  });
});

test.describe("E16: the notice for each group", () => {
  test("never paid: on Free now, 10 days of Pro at the next login", () => {
    const n = e16Notice("free_trial_pending", "free");
    expect(n.subject).toBe("Your Jooma account is now on Free");
    expect(n.body).toContain("50 resources every Sunday");
    expect(n.body).toContain("10 days of Pro");
    expect(n.path).toBe("/login");
  });

  test("former payer: on Free, library kept, no trial promised", () => {
    const n = e16Notice("free", "free");
    expect(n.subject).toBe("Your Jooma account is now on Free");
    expect(n.body).toContain("50 resources every Sunday");
    expect(n.body).not.toContain("Pro");
  });

  test("old trial: runs to its end, then Free, nothing charged", () => {
    const n = e16Notice("trial_runs_out", "standard");
    expect(n.body).toContain("runs to its end");
    expect(n.body).toContain("Nothing is charged");
  });

  test("payers: nothing about the plan or price changes", () => {
    const n = e16Notice("keep", "pro");
    expect(n.subject).toBe("Credits are now called resources");
    expect(n.body).toContain("Nothing changes about your plan or what you pay");
    expect(n.body).not.toContain("watermark");
  });

  test("Standard payers also hear their exports are clean now", () => {
    expect(e16Notice("keep", "standard").body).toContain("no longer carry a watermark");
  });

  test("a service notice: no offers, no dashes, no AI, never 'credits' except the rename", () => {
    for (const g of ["free_trial_pending", "free", "trial_runs_out", "keep"] as const) {
      const n = e16Notice(g, g === "keep" ? "standard" : "free");
      const text = `${n.subject} ${n.body} ${n.button}`;
      expect(text).not.toMatch(/–|—|\bAI\b|offer|discount|% off|upgrade/i);
      if (g !== "keep") expect(text).not.toMatch(/credit/i);
    }
  });
});
