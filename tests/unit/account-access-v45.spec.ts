import { test, expect } from "@playwright/test";
import { accountAccess, type AccessRow } from "@/app/lib/account-access";

/*
 * Jooma 4.5 retires the locked state (plan 2b). A row from the 4.5
 * my_account_access() (it carries resources_made) is read with the new rules;
 * an older row keeps the old ones, so the screens behave until the migration
 * is pushed.
 *
 * Edge cases: Free is never locked and may always export; the Pro trial reads
 * as "trial" with its real end date, and as Free the instant it ends; a 4.5
 * row on a paid plan is unchanged; an old-shape Free row is still "locked".
 */

const now = new Date("2026-11-18T10:00:00Z");
const base: AccessRow = {
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
};
const v45 = (over: Partial<AccessRow> = {}): AccessRow => ({ ...base, resources_made: 3, trial_ends_at: null, ...over });

test("4.5 Free is a plan: never locked, exports allowed, no trial to start from here", () => {
  const a = accountAccess(v45(), now);
  expect(a.state).toBe("free");
  expect(a.accountPlan).toBe("free");
  expect(a.canExportLibrary).toBe(true);
});

test("the Pro trial reads as a trial with its real end, then Free", () => {
  const row = v45({ plan: "pro_trial", trial_ends_at: "2026-11-25T23:59:59Z", free_trial_started_at: "2026-11-15T09:00:00Z" });
  const a = accountAccess(row, now);
  expect(a.state).toBe("trial");
  expect(a.accountPlan).toBe("pro_trial");
  expect(a.trialEndsAt?.toISOString()).toBe("2026-11-25T23:59:59.000Z");
  const after = accountAccess(row, new Date("2026-11-26T00:00:00Z"));
  expect(after.state).toBe("free");
  expect(after.accountPlan).toBe("free");
});

test("a 4.5 paid row is unchanged", () => {
  const a = accountAccess(v45({ plan: "pro", subscription_status: "active", stripe_subscription_id: "sub_1", has_paid: true }), now);
  expect(a.state).toBe("subscribed");
  expect(a.accountPlan).toBe("pro");
});

test("an old-shape Free row is still locked until the migration is pushed", () => {
  expect(accountAccess(base, now).state).toBe("locked");
});
