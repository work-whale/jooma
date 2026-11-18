import { test, expect } from "@playwright/test";
import { dueEmails, type LifecycleTeacher } from "@/app/lib/lifecycle";
import { renderLifecycleEmail } from "@/app/lib/lifecycle-emails";

/*
 * The trial's onboarding emails (Jooma 4.5 spec Step 6, Phase 2): E2a or E2b
 * on day 1, E3 on day 3, E4 on day 5, each at 16:30 UK time. Account emails
 * (product tips during the trial), so no consent is needed, but every one
 * stops the moment the teacher pays or leaves the trial.
 *
 * Edge cases: day 1 picks E2a when nothing is made and E2b when something is,
 * and never both (a resource made after E2a went must not send E2b too); the
 * 16:30 send time and the 12 hour late limit; quiet hours; Free and paid
 * teachers get none; the copy keeps the rules (no dashes, no "AI", no
 * "credits").
 */

const at = (iso: string) => new Date(iso);
// Signed up Sunday 15 Nov 2026 (GMT); day 1 is Monday 16 Nov.
const trial = (over: Partial<LifecycleTeacher> = {}): LifecycleTeacher => ({
  plan: "pro_trial",
  signupAt: at("2026-11-15T09:00:00Z"),
  trialEndsAt: at("2026-11-25T23:59:59Z"),
  fromTrial: false,
  hasPaid: false,
  marketingConsent: false,
  sundayEmails: true,
  made: 0,
  ...over,
});
const keys = (t: LifecycleTeacher, now: Date, sent: string[] = ["E1"]) => dueEmails(t, new Set(sent), now).map((e) => e.key);

test("day 1 at 16:30: E2a when nothing is made yet", () => {
  expect(keys(trial(), at("2026-11-16T16:29:00Z"))).toEqual([]);
  expect(keys(trial(), at("2026-11-16T16:30:00Z"))).toEqual(["E2a"]);
});

test("day 1 at 16:30: E2b when something has been made", () => {
  expect(keys(trial({ made: 1 }), at("2026-11-16T16:30:00Z"))).toEqual(["E2b"]);
});

test("never both on day 1: whichever went first stands", () => {
  expect(keys(trial({ made: 1 }), at("2026-11-16T18:00:00Z"), ["E1", "E2a"])).toEqual([]);
  expect(keys(trial({ made: 0 }), at("2026-11-16T18:00:00Z"), ["E1", "E2b"])).toEqual([]);
});

test("E3 on day 3 and E4 on day 5, at 16:30, once each", () => {
  expect(keys(trial(), at("2026-11-18T16:30:00Z"), ["E1", "E2a"])).toEqual(["E3"]);
  expect(keys(trial(), at("2026-11-18T17:00:00Z"), ["E1", "E2a", "E3"])).toEqual([]);
  expect(keys(trial(), at("2026-11-20T16:30:00Z"), ["E1", "E2a", "E3"])).toEqual(["E4"]);
});

test("more than 12 hours late is dropped, and nothing in quiet hours", () => {
  // 20:59 is still sendable; 21:00 to 07:00 is quiet; by 07:00 it is 14.5
  // hours late, so it is dropped rather than sent a day late.
  expect(keys(trial(), at("2026-11-16T20:59:00Z"))).toEqual(["E2a"]);
  expect(keys(trial(), at("2026-11-16T21:00:00Z"))).toEqual([]);
  expect(keys(trial(), at("2026-11-17T07:00:00Z"))).toEqual([]);
});

test("in BST the send time is 16:30 UK, 15:30 UTC", () => {
  const summer = trial({ signupAt: at("2027-05-02T09:00:00Z"), trialEndsAt: at("2027-05-12T22:59:59Z") });
  expect(keys(summer, at("2027-05-03T15:29:00Z"))).toEqual([]);
  expect(keys(summer, at("2027-05-03T15:30:00Z"))).toEqual(["E2a"]);
});

test("none for Free, paid, or once the teacher has paid", () => {
  const now = at("2026-11-16T16:30:00Z");
  expect(keys(trial({ plan: "free" }), now)).toEqual([]);
  expect(keys(trial({ plan: "pro" }), now)).toEqual([]);
  expect(keys(trial({ hasPaid: true }), now)).toEqual([]);
});

test("the copy: one button each, the right tool, the real end date, the copy rules", () => {
  const vars = {
    firstName: "Sam",
    trialEnds: "Wednesday 25 November",
    trialEndsDay: "Wednesday",
    made: 1,
    hours: 0,
    plan: "Pro",
    resources: 1000,
    refill: "",
    planEnds: "",
    firstTitle: "Volcanoes",
  };
  const e2a = renderLifecycleEmail("E2a", vars);
  expect(e2a.subject).toBe("Type one sentence. Get a whole lesson.");
  expect(e2a.path).toBe("/tools/slideshow");
  const e2b = renderLifecycleEmail("E2b", vars);
  expect(e2b.body).toContain("You've made Volcanoes.");
  expect(e2b.path).toBe("/tools/worksheet-generator");
  const e3 = renderLifecycleEmail("E3", vars);
  expect(e3.body).toContain("refining never uses resources");
  const e4 = renderLifecycleEmail("E4", vars);
  expect(e4.body).toContain("yours free until Wednesday 25 November");
  expect(e4.preheader).toContain("25 November");
  for (const e of [e2a, e2b, e3, e4]) {
    expect(e.kind).toBe("account");
    const all = `${e.subject} ${e.preheader} ${e.body} ${e.button}`;
    expect(all).not.toMatch(/–|—|\bAI\b|credit|token/i);
    expect(all).not.toContain("{");
  }
  // No title to name: E2b still reads as a sentence.
  expect(renderLifecycleEmail("E2b", { ...vars, firstTitle: undefined }).body).toMatch(/^You've made your first resource\./);
});
