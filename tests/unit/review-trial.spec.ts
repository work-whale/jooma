import { test, expect } from "@playwright/test";
import { effectivePlan, reviewTrialEnd } from "@/app/lib/plans";

/*
 * The ambassador review trial: Standard for three days while an application is
 * read, no card. It is the only "trialing" state without a Stripe
 * subscription id, and it must stop counting the moment it ends, the same rule
 * my_generation_gate() applies when generating.
 */

const NOW = new Date("2026-10-16T12:00:00Z");
const trial = (end: string | null) => ({
  plan: "standard",
  subscription_status: "trialing",
  stripe_subscription_id: null,
  current_period_end: end,
});

test.describe("review trial", () => {
  test("is Standard until it ends, then no plan", () => {
    expect(effectivePlan(trial("2026-10-19T12:00:00Z"), NOW)).toBe("standard");
    expect(effectivePlan(trial("2026-10-16T11:59:00Z"), NOW)).toBe("free");
  });

  test("a Stripe trial is never mistaken for one", () => {
    const stripeTrial = { ...trial("2026-10-01T00:00:00Z"), stripe_subscription_id: "sub_123" };
    expect(reviewTrialEnd(stripeTrial)).toBeNull();
    // Stripe owns that plan: its webhook ends it, not this rule.
    expect(effectivePlan(stripeTrial, NOW)).toBe("standard");
  });

  test("other comps and plain plans are left alone", () => {
    const comp = {
      plan: "pro",
      subscription_status: "active",
      stripe_subscription_id: null,
      current_period_end: "2026-01-01T00:00:00Z",
    };
    expect(effectivePlan(comp, NOW)).toBe("pro");
    expect(effectivePlan({ plan: "max" }, NOW)).toBe("max");
    expect(effectivePlan(null, NOW)).toBe("free");
  });

  test("reports when it ends", () => {
    expect(reviewTrialEnd(trial("2026-10-19T12:00:00Z"))?.toISOString()).toBe("2026-10-19T12:00:00.000Z");
    expect(reviewTrialEnd(trial(null))).toBeNull();
  });
});
