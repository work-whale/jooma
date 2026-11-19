import { test, expect } from "@playwright/test";
import { activation, cleanRefCode, isFreshRun, isNewSignup, runUsesPictures, sourcePrompt } from "@/app/lib/app-event-rules";

/*
 * The Step 7 events that need a decision before they are recorded (Jooma 4.5,
 * Phase 1): activated (a second resource within 7 days of signup, once),
 * resource_made (only for a run the teacher has just made, never an old one
 * replayed), and checkout_started's source_prompt (only a known prompt id).
 */

const DAY = 86_400_000;
const signupAt = new Date("2026-11-15T10:00:00Z");
const at = (days: number) => new Date(signupAt.getTime() + days * DAY);

test.describe("activated", () => {
  test("the second resource inside 7 days activates, with the day count", () => {
    expect(activation({ signupAt, madeAt: [at(1), at(3)], alreadyActivated: false, now: at(3) })).toEqual({
      activate: true,
      daysSinceSignup: 3,
    });
  });

  test("one resource is not enough", () => {
    expect(activation({ signupAt, madeAt: [at(1)], alreadyActivated: false, now: at(1) }).activate).toBe(false);
  });

  test("a second resource after day 7 does not count", () => {
    expect(activation({ signupAt, madeAt: [at(1), at(7.5)], alreadyActivated: false, now: at(7.5) }).activate).toBe(
      false,
    );
  });

  test("exactly 7 days still counts", () => {
    expect(activation({ signupAt, madeAt: [at(0.5), at(7)], alreadyActivated: false, now: at(7) }).activate).toBe(true);
  });

  test("never twice", () => {
    expect(activation({ signupAt, madeAt: [at(1), at(2), at(3)], alreadyActivated: true, now: at(3) }).activate).toBe(
      false,
    );
  });

  test("no signup date, no activation", () => {
    expect(activation({ signupAt: null, madeAt: [at(1), at(2)], alreadyActivated: false, now: at(2) }).activate).toBe(
      false,
    );
  });
});

test.describe("resource_made only for a run just made", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  test("a run saved a minute ago is fresh", () => {
    expect(isFreshRun("2026-11-18T11:59:00Z", now)).toBe(true);
  });

  test("an old run replayed is not", () => {
    expect(isFreshRun("2026-11-18T11:40:00Z", now)).toBe(false);
  });

  test("a missing or broken date is not", () => {
    expect(isFreshRun(null, now)).toBe(false);
    expect(isFreshRun("yesterday", now)).toBe(false);
  });
});

test.describe("with_pictures", () => {
  test("generated or mixed pictures count; library photos and none do not", () => {
    expect(runUsesPictures({ imageSource: "ai" })).toBe(true);
    expect(runUsesPictures({ imageSource: "auto" })).toBe(true);
    expect(runUsesPictures({ imageSource: "web" })).toBe(false);
    expect(runUsesPictures({})).toBe(false);
    expect(runUsesPictures(null)).toBe(false);
  });
});

test.describe("source_prompt", () => {
  test("a known prompt id passes", () => {
    expect(sourcePrompt("P3")).toBe("P3");
    expect(sourcePrompt("P5")).toBe("P5");
  });

  test("anything else is dropped", () => {
    expect(sourcePrompt("P99")).toBeNull();
    expect(sourcePrompt("<script>")).toBeNull();
    expect(sourcePrompt(3)).toBeNull();
    expect(sourcePrompt(undefined)).toBeNull();
  });
});

test.describe("signup_completed", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  test("a brand new account, not yet recorded, is recorded", () => {
    expect(isNewSignup("2026-11-18T11:55:00Z", now, false)).toBe(true);
  });

  test("an account from before launch day is not (launch-day trials start later)", () => {
    expect(isNewSignup("2026-09-01T09:00:00Z", now, false)).toBe(false);
  });

  test("never twice", () => {
    expect(isNewSignup("2026-11-18T11:55:00Z", now, true)).toBe(false);
  });

  test("the ref code is kept only when it looks like a code", () => {
    expect(cleanRefCode(" famfamb ")).toBe("FAMFAMB");
    expect(cleanRefCode("ABC-12")).toBe("ABC-12");
    expect(cleanRefCode("<b>x</b>")).toBeNull();
    expect(cleanRefCode("A".repeat(40))).toBeNull();
    expect(cleanRefCode(42)).toBeNull();
  });
});
