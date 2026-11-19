import { test, expect } from "@playwright/test";
import {
  planInForce,
  planChipLabel,
  trialDateShort,
  trialDateLong,
  trialDay,
  trialPrompt,
  canStartProTrial,
  featurePlan,
} from "@/app/lib/account-plan";
import { trialEmailKey, isDisposableEmail, needsVerification, deviceFlagged } from "@/app/lib/trial-guard";

/*
 * Account states and the Pro trial (spec Step 3, plan 2b and 2d).
 *
 * Edge cases listed first:
 *   - pro_trial at, before and after trial_ends_at (the 23:59:59 boundary).
 *   - the legacy no-card Standard trial still ends on time after launch.
 *   - an unknown or null plan reads as Free, never as paid.
 *   - "PRO TRIAL" chip; Free reads "Free", never "No plan" any more.
 *   - dates are UK dates: a 23:30 UTC signup in summer is the next UK day.
 *   - one trial per email: case, spaces, +tags and Gmail dots all collide;
 *     two different people never do.
 *   - disposable domains, including subdomains; a lookalike is not blocked.
 *   - verification blocks the SECOND resource, not the first.
 *   - a device is flagged at the third account in 24 hours, not the second.
 */

const at = (iso: string) => new Date(iso);

test.describe("plan in force", () => {
  const trial = (ends: string) => ({ plan: "pro_trial", trial_ends_at: ends });

  test("the trial is in force up to and including 23:59:59 on its last day", () => {
    const ends = "2026-11-25T23:59:59Z";
    expect(planInForce(trial(ends), at("2026-11-25T23:59:58Z"))).toBe("pro_trial");
    expect(planInForce(trial(ends), at("2026-11-25T23:59:59Z"))).toBe("free");
    expect(planInForce(trial(ends), at("2026-11-26T09:00:00Z"))).toBe("free");
  });

  test("a trial row with no end date is read as Free, not as endless Pro", () => {
    expect(planInForce({ plan: "pro_trial", trial_ends_at: null }, at("2026-11-18T00:00:00Z"))).toBe("free");
  });

  test("the old no-card Standard trial still ends on time", () => {
    const row = {
      plan: "standard",
      subscription_status: "trialing",
      stripe_subscription_id: null,
      current_period_end: "2026-11-20T10:00:00Z",
    };
    expect(planInForce(row, at("2026-11-19T10:00:00Z"))).toBe("standard");
    expect(planInForce(row, at("2026-11-21T10:00:00Z"))).toBe("free");
  });

  test("paid plans pass through, unknowns are Free", () => {
    for (const p of ["standard", "pro", "max", "school", "free"]) {
      expect(planInForce({ plan: p }, at("2026-11-18T00:00:00Z"))).toBe(p);
    }
    expect(planInForce({ plan: "gold" }, at("2026-11-18T00:00:00Z"))).toBe("free");
    expect(planInForce({ plan: null }, at("2026-11-18T00:00:00Z"))).toBe("free");
    expect(planInForce(null, at("2026-11-18T00:00:00Z"))).toBe("free");
  });

  test("the trial uses Pro's features (assistant, tools)", () => {
    expect(featurePlan("pro_trial")).toBe("pro");
    expect(featurePlan("free")).toBe("free");
  });
});

test.describe("labels and dates", () => {
  test("chip: PRO TRIAL during the trial, plain names otherwise", () => {
    expect(planChipLabel("pro_trial")).toBe("PRO TRIAL");
    expect(planChipLabel("free")).toBe("FREE");
    expect(planChipLabel("pro")).toBe("PRO");
    expect(planChipLabel("max")).toBe("MAX");
  });

  test("Sun 15 Nov signup: the trial ends Wednesday 25 November", () => {
    const end = at("2026-11-25T23:59:59Z");
    expect(trialDateShort(end)).toBe("Wed 25 Nov");
    expect(trialDateLong(end)).toBe("Wednesday 25 November");
  });

  test("dates are UK dates in summer too", () => {
    // 23:59:59 BST on Fri 10 Jul is 22:59:59 UTC.
    expect(trialDateShort(at("2026-07-10T22:59:59Z"))).toBe("Fri 10 Jul");
  });
});

test.describe("P1: chip on days 0 to 6, banner on days 7 to 10", () => {
  const signup = at("2026-11-15T09:00:00Z");
  test("day numbers are UK calendar days from signup", () => {
    expect(trialDay(signup, at("2026-11-15T23:00:00Z"))).toBe(0);
    expect(trialDay(signup, at("2026-11-16T00:00:01Z"))).toBe(1);
    expect(trialDay(signup, at("2026-11-25T23:59:00Z"))).toBe(10);
  });
  test("chip, then banner", () => {
    expect(trialPrompt(signup, at("2026-11-21T12:00:00Z"))).toBe("chip");
    expect(trialPrompt(signup, at("2026-11-22T12:00:00Z"))).toBe("banner");
    expect(trialPrompt(signup, at("2026-11-25T23:00:00Z"))).toBe("banner");
  });
});

test.describe("one trial per email, ever", () => {
  test("case, spaces, +tags and Gmail dots are the same person", () => {
    const k = trialEmailKey("jo.bloggs@gmail.com");
    expect(trialEmailKey("  Jo.Bloggs@Gmail.com ")).toBe(k);
    expect(trialEmailKey("jobloggs+trial2@gmail.com")).toBe(k);
    expect(trialEmailKey("jobloggs@googlemail.com")).toBe(k);
  });

  test("dots matter outside Gmail, and different people never collide", () => {
    expect(trialEmailKey("jo.bloggs@school.org.uk")).not.toBe(trialEmailKey("jobloggs@school.org.uk"));
    expect(trialEmailKey("a@school.org.uk")).not.toBe(trialEmailKey("b@school.org.uk"));
  });

  test("the key is a hash, never the address", () => {
    const k = trialEmailKey("jo@school.org.uk");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain("school");
  });

  test("eligibility: a seen email, an admin or a former payer gets no trial", () => {
    const base = { emailSeen: false, isAdmin: false, hasPaid: false, plan: "free" };
    expect(canStartProTrial(base)).toBe(true);
    expect(canStartProTrial({ ...base, emailSeen: true })).toBe(false);
    expect(canStartProTrial({ ...base, isAdmin: true })).toBe(false);
    expect(canStartProTrial({ ...base, hasPaid: true })).toBe(false);
    expect(canStartProTrial({ ...base, plan: "pro" })).toBe(false);
    expect(canStartProTrial({ ...base, plan: "pro_trial" })).toBe(false);
  });
});

test.describe("abuse checks", () => {
  test("disposable domains are blocked, subdomains too", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@EU.Mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@10minutemail.com")).toBe(true);
  });
  test("real and lookalike domains are not", () => {
    expect(isDisposableEmail("x@school.org.uk")).toBe(false);
    expect(isDisposableEmail("x@gmail.com")).toBe(false);
    expect(isDisposableEmail("x@notmailinator.com")).toBe(false);
    expect(isDisposableEmail("not an email")).toBe(false);
  });
  test("verification blocks the second resource, not the first", () => {
    expect(needsVerification({ resourcesMade: 0, emailVerified: false })).toBe(false);
    expect(needsVerification({ resourcesMade: 1, emailVerified: false })).toBe(true);
    expect(needsVerification({ resourcesMade: 5, emailVerified: true })).toBe(false);
  });
  test("a device is flagged at its third account in 24 hours", () => {
    expect(deviceFlagged(2)).toBe(false);
    expect(deviceFlagged(3)).toBe(true);
  });
});
