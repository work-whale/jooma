import { test, expect } from "@playwright/test";
import { shouldSendStartTrial } from "@/app/lib/meta-events";

/*
 * Which signups count as activating the Free plan.
 *
 * The rule looks trivial and is not: the invite branch in
 * app/complete-profile/page.tsx forks three ways, and two of those three end
 * with the teacher on Free. Getting it wrong is invisible — no error, just a
 * conversion rate reported to the agency against the wrong denominator — so the
 * decision lives in one predicate and is asserted here directly.
 */

test.describe("Which signups report StartTrial", () => {
  test("an ordinary self signup is a free activation", () => {
    expect(shouldSendStartTrial({ kind: "self-signup" })).toBe(true);
  });

  test("an invite that could not be applied is still a free activation", () => {
    // The early return in complete-profile: the profile row saved, the invite
    // failed, and the teacher is told they are continuing on the Free plan.
    // They are on Free, so this must fire. Reading this case as "an invite was
    // involved, skip it" would lose a real activation.
    expect(shouldSendStartTrial({ kind: "invite-failed" })).toBe(true);
  });

  test("an invite onto a paid plan is not a trial", () => {
    // A school seat handed over by an admin. No free trial was ever started,
    // and counting it would inflate the denominator of the Free to Paid rate.
    expect(shouldSendStartTrial({ kind: "invite-applied", plan: "pro" })).toBe(false);
    expect(shouldSendStartTrial({ kind: "invite-applied", plan: "max" })).toBe(false);
    expect(shouldSendStartTrial({ kind: "invite-applied", plan: "school" })).toBe(false);
  });

  test("an invite onto Free is a free activation like any other", () => {
    // InviteRow.plan is a bare string, not a PlanId, so this is reachable. The
    // predicate keys on the resulting plan rather than on whether an invite
    // existed, which is the whole reason it does.
    expect(shouldSendStartTrial({ kind: "invite-applied", plan: "free" })).toBe(true);
  });
});
