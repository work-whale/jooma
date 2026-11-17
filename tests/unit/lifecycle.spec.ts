import { test, expect } from "@playwright/test";
import { dueEmails, emailForEvent, inQuietHours, mayReceive, sendingEnabled, type LifecycleTeacher } from "@/app/lib/lifecycle";
import { renderLifecycleEmail, LIFECYCLE_IDS } from "@/app/lib/lifecycle-emails";

/*
 * The email scheduler (spec Step 6, plan 2i), Phase 1: E1, E5, E6, E7, E8,
 * E12, E13, E14. The cron at /api/cron/lifecycle runs every 15 minutes and
 * asks dueEmails() what to send.
 *
 * Edge cases: quiet hours 21:00 to 07:00 UK, both edges, in GMT and BST; the
 * 16:30 and 07:30 send times; one send per key (re-running the cron sends
 * nothing twice); stale sends are dropped, not sent days late; paying stops
 * every trial and Free email; marketing only with consent and at most one a
 * day; E8 needs its own switch, starts the first Sunday AFTER the trial, and
 * is keyed per Sunday; nothing at all goes out unless sending is switched on.
 */

const at = (iso: string) => new Date(iso);
// Sun 15 Nov 2026 signup; trial ends Wed 25 Nov 23:59:59.
const trialTeacher = (over: Partial<LifecycleTeacher> = {}): LifecycleTeacher => ({
  plan: "pro_trial",
  signupAt: at("2026-11-15T09:00:00Z"),
  trialEndsAt: at("2026-11-25T23:59:59Z"),
  fromTrial: false,
  hasPaid: false,
  marketingConsent: false,
  sundayEmails: true,
  ...over,
});
const freeAfterTrial = (over: Partial<LifecycleTeacher> = {}) =>
  trialTeacher({ plan: "free", fromTrial: true, ...over });
const ids = (t: LifecycleTeacher, now: Date, sent: string[] = []) =>
  dueEmails(t, new Set(sent), now).map((e) => e.key);

test.describe("quiet hours", () => {
  test("21:00 to 07:00 UK, in winter and summer", () => {
    expect(inQuietHours(at("2026-11-18T20:59:00Z"))).toBe(false);
    expect(inQuietHours(at("2026-11-18T21:00:00Z"))).toBe(true);
    expect(inQuietHours(at("2026-11-19T06:59:00Z"))).toBe(true);
    expect(inQuietHours(at("2026-11-19T07:00:00Z"))).toBe(false);
    // 20:30 UTC in July is 21:30 BST.
    expect(inQuietHours(at("2026-07-01T20:30:00Z"))).toBe(true);
  });

  test("nothing is due in quiet hours, even E1", () => {
    const t = trialTeacher({ signupAt: at("2026-11-15T22:00:00Z") });
    expect(ids(t, at("2026-11-15T22:01:00Z"))).toEqual([]);
    expect(ids(t, at("2026-11-16T07:00:00Z"))).toEqual(["E1"]);
  });
});

test.describe("the trial emails", () => {
  test("E1 straight after signup, once", () => {
    const t = trialTeacher();
    expect(ids(t, at("2026-11-15T09:15:00Z"))).toEqual(["E1"]);
    expect(ids(t, at("2026-11-15T09:30:00Z"), ["E1"])).toEqual([]);
  });

  test("E5 on day 8 at 16:30, not before", () => {
    const sent = ["E1"];
    expect(ids(trialTeacher(), at("2026-11-23T16:29:00Z"), sent)).toEqual([]);
    expect(ids(trialTeacher(), at("2026-11-23T16:30:00Z"), sent)).toEqual(["E5"]);
  });

  test("E6 on day 10 at 07:30", () => {
    expect(ids(trialTeacher(), at("2026-11-25T07:30:00Z"), ["E1", "E5"])).toEqual(["E6"]);
  });

  test("a send more than 12 hours late is dropped, not sent", () => {
    // 07:00 the next morning is 14.5 hours after 16:30, and outside quiet hours.
    expect(ids(trialTeacher(), at("2026-11-24T07:00:00Z"), ["E1"])).not.toContain("E5");
  });

  test("E7 on day 11 at 07:30, only for Free straight from the trial", () => {
    expect(ids(freeAfterTrial(), at("2026-11-26T07:30:00Z"), ["E1", "E5", "E6"])).toEqual(["E7"]);
    expect(ids(freeAfterTrial({ fromTrial: false }), at("2026-11-26T07:30:00Z"), ["E1", "E5", "E6"])).toEqual([]);
  });

  test("paying stops every trial and Free email", () => {
    expect(ids(trialTeacher({ plan: "pro", hasPaid: true }), at("2026-11-23T16:30:00Z"), ["E1"])).toEqual([]);
    expect(ids(freeAfterTrial({ hasPaid: true }), at("2026-11-26T07:30:00Z"))).toEqual([]);
  });
});

test.describe("E8 on Sundays", () => {
  test("starts the first Sunday after the trial, at 16:00, keyed per Sunday", () => {
    const t = freeAfterTrial();
    const done = ["E1", "E5", "E6", "E7"];
    expect(ids(t, at("2026-11-29T16:00:00Z"), done)).toEqual(["E8:2026-11-29"]);
    expect(ids(t, at("2026-11-29T16:15:00Z"), [...done, "E8:2026-11-29"])).toEqual([]);
    expect(ids(t, at("2026-12-06T16:00:00Z"), [...done, "E8:2026-11-29"])).toEqual(["E8:2026-12-06"]);
  });

  test("not before 16:00, not on other days, not when switched off", () => {
    const done = ["E1", "E5", "E6", "E7"];
    expect(ids(freeAfterTrial(), at("2026-11-29T15:59:00Z"), done)).toEqual([]);
    expect(ids(freeAfterTrial(), at("2026-11-30T16:00:00Z"), done)).toEqual([]);
    expect(ids(freeAfterTrial({ sundayEmails: false }), at("2026-11-29T16:00:00Z"), done)).toEqual([]);
  });

  test("a Free teacher who never had a trial still gets it", () => {
    const t = freeAfterTrial({ fromTrial: false, trialEndsAt: null });
    expect(ids(t, at("2026-11-29T16:00:00Z"), ["E1"])).toEqual(["E8:2026-11-29"]);
  });
});

test.describe("consent", () => {
  test("marketing needs the ticked box and at most one a day; account mail always goes", () => {
    expect(mayReceive("marketing", trialTeacher({ marketingConsent: false }))).toBe(false);
    expect(mayReceive("marketing", trialTeacher({ marketingConsent: true }))).toBe(true);
    expect(mayReceive("marketing", trialTeacher({ marketingConsent: true, marketingSentToday: true }))).toBe(false);
    expect(mayReceive("account", trialTeacher({ marketingConsent: false, marketingSentToday: true }))).toBe(true);
  });
});

test.describe("events and the switch", () => {
  test("events map to E12, E13, E14", () => {
    expect(emailForEvent("subscribed")).toBe("E12");
    expect(emailForEvent("cancelled")).toBe("E13");
    expect(emailForEvent("payment_failed")).toBe("E14");
    expect(emailForEvent("resource_made")).toBeNull();
  });

  test("off unless LIFECYCLE_EMAILS is exactly 'on'", () => {
    expect(sendingEnabled({})).toBe(false);
    expect(sendingEnabled({ LIFECYCLE_EMAILS: "true" })).toBe(false);
    expect(sendingEnabled({ LIFECYCLE_EMAILS: "on" })).toBe(true);
  });
});

test.describe("templates", () => {
  const vars = {
    firstName: "Sam",
    trialEnds: "Wednesday 25 November",
    trialEndsDay: "Wednesday",
    made: 12,
    hours: 4,
    plan: "Pro",
    resources: 1000,
    refill: "12 December",
    planEnds: "3 December",
  };

  test("every Phase 1 email renders, one button, copy rules kept", () => {
    expect(LIFECYCLE_IDS).toEqual(["E1", "E5", "E6", "E7", "E8", "E12", "E13", "E14"]);
    for (const id of LIFECYCLE_IDS) {
      const e = renderLifecycleEmail(id, vars);
      expect(e.subject.length).toBeGreaterThan(5);
      expect(e.button.length).toBeGreaterThan(1);
      const all = `${e.subject} ${e.preheader} ${e.body} ${e.button}`;
      expect(all, id).not.toMatch(/–|—|\bAI\b|credit|token|3 days/i);
      expect(all, id).not.toContain("{");
    }
  });

  test("all Phase 1 emails are account emails, with the settings link", () => {
    for (const id of LIFECYCLE_IDS) {
      const e = renderLifecycleEmail(id, vars);
      expect(e.kind).toBe("account");
      expect(e.footerPath).toBe("/profile#email-settings");
    }
  });

  test("E1 carries the real end date and the no-card line", () => {
    const e = renderLifecycleEmail("E1", vars);
    expect(e.subject).toBe("Your 10 days of Pro have started");
    expect(e.body).toContain("Pro is yours free until Wednesday 25 November.");
    expect(e.body).toContain("nothing to cancel");
  });

  test("E5 tells the truth about Free after the red notes", () => {
    const e = renderLifecycleEmail("E5", vars);
    expect(e.body).toContain("So far you've made 12 resources and saved about 4 hours.");
    expect(e.body).toContain("50 resources a week, library photos and a Jooma mark on exports");
  });

  test("E8 sends without an idea line until the ideas are approved", () => {
    const e = renderLifecycleEmail("E8", vars);
    expect(e.subject).toBe("Your 50 resources are back");
    expect(e.body).not.toMatch(/idea/i);
  });
});
