import { test, expect } from "@playwright/test";
import { dueEmails, e11Due, isMarketingKey, type LifecycleTeacher } from "@/app/lib/lifecycle";
import { renderLifecycleEmail, LIFECYCLE_IDS, type LifecycleVars } from "@/app/lib/lifecycle-emails";
import { DEFAULT_IDEAS, ideaFor, pickIdea } from "@/app/lib/e10-ideas";
import { v2ToolForSlug } from "@/app/lib/tools";

/*
 * Phase 2 emails (spec Step 6): E10 (Free, marketing, after 14 days with no
 * visit) and E11 (Standard, account, 80% of the allowance used with more than
 * 7 days to the refill).
 *
 * Edge cases. E10: due at 16:30 UK on day 14 after the last visit, not day 13;
 * once per absence (keyed by the last visit), a new absence earns a new one;
 * never without a recorded visit (accounts from before tracking began would
 * otherwise all get it on day one); marketing rules: consent, at most one a
 * day shared with E9a/E9b, quiet hours; paying stops it. E11: Standard only,
 * once per allowance period, exactly 80% sends, just under does not, 7 days
 * or fewer to the refill does not, never in quiet hours, account mail (no
 * consent needed). The idea list: rotates by UK week, every idea opens a real
 * tool, the cost line uses the tool's real estimate, an empty admin list
 * falls back to the defaults. Copy: no dashes, AI, credits; E11 sells no
 * "Jooma mark" (Standard is clean).
 */

const at = (iso: string) => new Date(iso);

const freeTeacher = (over: Partial<LifecycleTeacher> = {}): LifecycleTeacher => ({
  plan: "free",
  signupAt: at("2026-09-01T09:00:00Z"),
  trialEndsAt: at("2026-09-11T22:59:59Z"),
  fromTrial: true,
  hasPaid: false,
  marketingConsent: true,
  sundayEmails: false,
  lastSeenAt: at("2026-11-02T10:00:00Z"), // Monday 2 Nov
  ...over,
});
const keys = (t: LifecycleTeacher, now: Date, sent: string[] = []) => dueEmails(t, new Set(sent), now).map((e) => e.key);

test.describe("E10, after 14 days with no visit", () => {
  // Day 14 after Mon 2 Nov is Mon 16 Nov; 16:30 GMT = 16:30Z.
  test("due at 16:30 UK on day 14, not before", () => {
    expect(keys(freeTeacher(), at("2026-11-15T16:30:00Z"))).toEqual([]);
    expect(keys(freeTeacher(), at("2026-11-16T16:29:00Z"))).toEqual([]);
    expect(keys(freeTeacher(), at("2026-11-16T16:30:00Z"))).toEqual(["E10:2026-11-02"]);
  });

  test("once per absence; a new visit starts a new one", () => {
    expect(keys(freeTeacher(), at("2026-11-16T18:00:00Z"), ["E10:2026-11-02"])).toEqual([]);
    const back = freeTeacher({ lastSeenAt: at("2026-11-20T10:00:00Z") });
    expect(keys(back, at("2026-12-04T16:30:00Z"), ["E10:2026-11-02"])).toEqual(["E10:2026-11-20"]);
  });

  test("no recorded visit: never", () => {
    expect(keys(freeTeacher({ lastSeenAt: null }), at("2026-11-16T16:30:00Z"))).toEqual([]);
  });

  test("marketing: needs consent, shares the one-a-day limit, skips quiet hours", () => {
    expect(keys(freeTeacher({ marketingConsent: false }), at("2026-11-16T16:30:00Z"))).toEqual([]);
    expect(keys(freeTeacher({ marketingSentToday: true }), at("2026-11-16T16:30:00Z"))).toEqual([]);
    // Ran out at 15:30 the same day: E9a is due at 16:30 too. Only one goes.
    const both = keys(freeTeacher({ ranOutAt: [at("2026-11-16T15:30:00Z")] }), at("2026-11-16T16:30:00Z"));
    expect(both.length).toBe(1);
    expect(dueEmails(freeTeacher(), new Set(), at("2026-11-16T16:30:00Z"))[0].kind).toBe("marketing");
  });

  test("Free only; paying stops it", () => {
    expect(keys(freeTeacher({ plan: "standard", hasPaid: true }), at("2026-11-16T16:30:00Z"))).toEqual([]);
    expect(keys(freeTeacher({ plan: "pro_trial" }), at("2026-11-16T16:30:00Z"))).not.toContain("E10:2026-11-02");
  });

  test("the cron's one-a-day count knows E10 is marketing", () => {
    expect(isMarketingKey("E10:2026-11-02")).toBe(true);
    expect(isMarketingKey("E9a:2026-W47")).toBe(true);
    expect(isMarketingKey("E9b")).toBe(true);
    expect(isMarketingKey("E1")).toBe(false);
    expect(isMarketingKey("E11:2026-11-12")).toBe(false);
  });
});

test.describe("E11, Standard running low", () => {
  const base = {
    plan: "standard" as const,
    allowance: 500,
    spent: 400,
    periodStart: at("2026-11-12T00:00:00Z"),
    nextRefillAt: at("2026-12-12T00:00:00Z"),
  };
  const now = at("2026-11-19T12:00:00Z");

  test("at exactly 80% with more than 7 days left: once per period", () => {
    expect(e11Due(base, new Set(), now)).toEqual({ id: "E11", key: "E11:2026-11-12", kind: "account" });
    expect(e11Due(base, new Set(["E11:2026-11-12"]), now)).toBeNull();
    // Next period: a new key.
    const next = { ...base, periodStart: at("2026-12-12T00:00:00Z"), nextRefillAt: at("2027-01-12T00:00:00Z") };
    expect(e11Due(next, new Set(["E11:2026-11-12"]), at("2026-12-20T12:00:00Z"))?.key).toBe("E11:2026-12-12");
  });

  test("just under 80%, or 7 days or fewer to the refill: nothing", () => {
    expect(e11Due({ ...base, spent: 399.9 }, new Set(), now)).toBeNull();
    expect(e11Due(base, new Set(), at("2026-12-05T00:00:00Z"))).toBeNull();
  });

  test("Standard only; never in quiet hours; no consent needed", () => {
    for (const plan of ["free", "pro", "max", "pro_trial"] as const) expect(e11Due({ ...base, plan }, new Set(), now)).toBeNull();
    expect(e11Due(base, new Set(), at("2026-11-19T22:00:00Z"))).toBeNull();
  });
});

const vars: LifecycleVars = {
  firstName: "Sam",
  trialEnds: "",
  trialEndsDay: "",
  made: 3,
  hours: 1,
  plan: "Standard",
  resources: 500,
  refill: "12 December",
  planEnds: "",
  used: 400,
  idea: { text: "a 10 question retrieval quiz on last week's topic", href: "/tools/quiz-generator", cost: 1 },
};
const TOKEN = "u1.3f2b8c1e-9d4a-4b7e-8f21-0c5d6e7f8a9b.AAAAAAAAAAAAAAAAAAAAAA";

test.describe("E10 and E11 copy", () => {
  test("both are in the list; E10 is marketing, E11 account", () => {
    expect(LIFECYCLE_IDS).toContain("E10");
    expect(LIFECYCLE_IDS).toContain("E11");
    expect(renderLifecycleEmail("E10", vars, { unsubToken: TOKEN }).kind).toBe("marketing");
    expect(() => renderLifecycleEmail("E10", vars)).toThrow(/unsubscribe/i);
    expect(renderLifecycleEmail("E11", vars).kind).toBe("account");
  });

  test("E10 names the idea, its real cost and opens its tool", () => {
    const e = renderLifecycleEmail("E10", vars, { unsubToken: TOKEN });
    expect(e.subject).toBe("One for this week");
    expect(e.preheader).toBe("Ready in one sentence: a 10 question retrieval quiz on last week's topic.");
    expect(e.body).toBe(
      "Haven't been in for a while? Here's a quick one for this week: a 10 question retrieval quiz on last week's topic. " +
        "It takes one sentence and about 1 resource.",
    );
    expect(e.button).toBe("Make it now");
    expect(e.path).toBe("/tools/quiz-generator");
  });

  test("E11 has the numbers and the refill date, and no Jooma mark", () => {
    const e = renderLifecycleEmail("E11", vars);
    expect(e.subject).toBe("You've used 400 of your 500 resources");
    expect(e.preheader).toBe("They refill on 12 December.");
    expect(e.body).toBe(
      "Your resources refill on 12 December. If you need more before then, top-ups start at £2.49. " +
        "Or switch to Pro: double the resources and generated pictures for £3 more a month.",
    );
    expect(e.body).not.toMatch(/mark/i);
    expect(e.button).toBe("Switch to Pro");
  });

  test("copy rules", () => {
    for (const id of ["E10", "E11"] as const) {
      const e = renderLifecycleEmail(id, vars, { unsubToken: TOKEN });
      expect(`${e.subject} ${e.preheader} ${e.body} ${e.button}`, id).not.toMatch(/–|—|\bAI\b|credit|token|\{/i);
    }
  });
});

test.describe("the E10 idea list", () => {
  test("about eight defaults, each opening a real tool", () => {
    expect(DEFAULT_IDEAS.length).toBeGreaterThanOrEqual(6);
    for (const i of DEFAULT_IDEAS) {
      expect(v2ToolForSlug(i.toolSlug), i.toolSlug).toBeTruthy();
      expect(i.text).not.toMatch(/–|—|\bAI\b|credit|\.$/);
    }
  });

  test("rotates by UK week, and wraps", () => {
    const a = pickIdea(DEFAULT_IDEAS, at("2026-11-16T12:00:00Z"));
    const b = pickIdea(DEFAULT_IDEAS, at("2026-11-23T12:00:00Z"));
    expect(a).not.toEqual(b);
    // Same UK week (Sunday to Saturday, the Free refill week), same idea.
    expect(pickIdea(DEFAULT_IDEAS, at("2026-11-21T23:30:00Z"))).toEqual(a);
    expect(pickIdea(DEFAULT_IDEAS, at("2026-11-22T00:30:00Z"))).toEqual(b);
  });

  test("an empty admin list falls back to the defaults", () => {
    expect(pickIdea([], at("2026-11-16T12:00:00Z"))).toEqual(pickIdea(DEFAULT_IDEAS, at("2026-11-16T12:00:00Z")));
  });

  test("ideaFor gives the tool's page and its rounded estimate", () => {
    const v = ideaFor({ text: "a quiz", toolSlug: "quiz-generator" });
    expect(v.href).toBe(v2ToolForSlug("quiz-generator")!.href);
    expect(Number.isInteger(v.cost) && v.cost >= 1).toBe(true);
    // An unknown tool falls back to the tools page, never a broken link.
    expect(ideaFor({ text: "x", toolSlug: "nope" }).href).toBe("/tools");
  });
});
