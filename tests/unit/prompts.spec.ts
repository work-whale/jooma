import { test, expect } from "@playwright/test";
import {
  canShowPrompt,
  dismissUntil,
  PROMPT_COPY,
  promptAudience,
  type PromptContext,
} from "@/app/lib/prompts";

/*
 * The in-app prompt rules (spec Step 5, plan 2h), Phase 1: P1, P2, P3, P5, P12.
 *
 * Edge cases: presenting blocks EVERYTHING, P3 and P5 included; one pop-up
 * (P2 or P3b) per visit, while sheets (P3, P5) always show; a 7-day snooze,
 * except P3 and P5; P1's banner hides for the rest of the UK day only; P2 only
 * once, ever; each prompt only to its audience; snooze ends exactly at its
 * time; copy has no dashes, no "AI", no "credits" or "tokens".
 */

const now = new Date("2026-11-18T10:00:00Z");
const ctx = (over: Partial<PromptContext> = {}): PromptContext => ({
  plan: "free",
  presenting: false,
  popupShownThisVisit: false,
  dismissedUntil: null,
  shownBefore: false,
  now,
  ...over,
});

test.describe("who sees what", () => {
  test("audiences", () => {
    expect(promptAudience("P1")).toEqual(["pro_trial"]);
    expect(promptAudience("P2")).toEqual(["free"]);
    expect(promptAudience("P3")).toEqual(["free", "pro_trial"]);
    expect(promptAudience("P5")).toEqual(["free", "standard"]);
    expect(promptAudience("P12")).toEqual(["standard", "pro", "max"]);
  });

  test("a prompt never shows outside its audience", () => {
    expect(canShowPrompt("P5", ctx({ plan: "pro" }))).toBe(false);
    expect(canShowPrompt("P12", ctx({ plan: "free" }))).toBe(false);
    expect(canShowPrompt("P1", ctx({ plan: "free" }))).toBe(false);
  });
});

test.describe("rules for every prompt", () => {
  test("nothing at all while presenting, sheets included", () => {
    for (const id of ["P1", "P2", "P3", "P5", "P12"] as const) {
      const plan = promptAudience(id)[0];
      expect(canShowPrompt(id, ctx({ plan }))).toBe(true);
      expect(canShowPrompt(id, ctx({ plan, presenting: true }))).toBe(false);
    }
  });

  test("one pop-up per visit; sheets always show", () => {
    expect(canShowPrompt("P2", ctx({ popupShownThisVisit: true }))).toBe(false);
    expect(canShowPrompt("P3", ctx({ popupShownThisVisit: true }))).toBe(true);
    expect(canShowPrompt("P5", ctx({ popupShownThisVisit: true }))).toBe(true);
  });

  test("a dismissed prompt stays hidden until its time, then returns", () => {
    const until = dismissUntil("P12", now)!;
    expect(until.toISOString()).toBe("2026-11-25T10:00:00.000Z");
    expect(canShowPrompt("P12", ctx({ plan: "pro", dismissedUntil: until }))).toBe(false);
    expect(canShowPrompt("P12", ctx({ plan: "pro", dismissedUntil: until, now: until }))).toBe(true);
  });

  test("P3 and P5 are never snoozed", () => {
    expect(dismissUntil("P3", now)).toBeNull();
    expect(dismissUntil("P5", now)).toBeNull();
    expect(canShowPrompt("P3", ctx({ dismissedUntil: new Date("2027-01-01T00:00:00Z") }))).toBe(true);
  });

  test("P1's banner hides for the rest of the UK day", () => {
    expect(dismissUntil("P1", now)!.toISOString()).toBe("2026-11-19T00:00:00.000Z");
    // In summer UK midnight is 23:00 UTC.
    expect(dismissUntil("P1", new Date("2026-07-01T10:00:00Z"))!.toISOString()).toBe("2026-07-01T23:00:00.000Z");
  });

  test("P2 shows once, ever", () => {
    expect(canShowPrompt("P2", ctx({ shownBefore: true }))).toBe(false);
    expect(canShowPrompt("P3", ctx({ shownBefore: true }))).toBe(true);
  });
});

test.describe("copy", () => {
  test("follows the copy rules", () => {
    const text = JSON.stringify(PROMPT_COPY);
    expect(text).not.toMatch(/–|—|\bAI\b|credit|token/i);
    expect(text).toContain("resources");
  });

  test("P1 and P3 fill in the account's numbers and dates", () => {
    expect(PROMPT_COPY.P1.chip({ ends: "Wed 25 Nov" })).toBe("Pro trial until Wed 25 Nov");
    expect(PROMPT_COPY.P1.banner({ ends: "Wednesday 25 November" })).toBe(
      "Your Pro trial ends on Wednesday 25 November. Keep generated pictures, no Jooma mark and 1,000 resources a month.",
    );
    expect(PROMPT_COPY.P3.free.title).toBe("That's this week's free resources used.");
    expect(PROMPT_COPY.P3.trial.buttons).toEqual(["Keep Pro", "Switch to Free now"]);
    expect(PROMPT_COPY.P12.body({ plan: "Pro" })).toBe("Your last payment didn't go through. Update your card to keep Pro.");
  });
});
