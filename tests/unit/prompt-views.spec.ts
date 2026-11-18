import { test, expect } from "@playwright/test";
import { costLine, p2View, p3View, p12Line, hoursSaved, planBlockV45 } from "@/app/lib/prompt-views";

/*
 * What the Phase 1 prompts say on screen (spec Step 5 and Step 2 "Running
 * out"), built from the rules in prompts.ts and the payload the server sends.
 *
 * Edge cases: the cost line uses the same rounding as the check, so it never
 * says "enough" and then refuses; exactly enough is enough; a tool with no
 * estimate still has a line; P3 has a Free and a trial version with the
 * spec's buttons, and a paid "topup" payload is not P3 at all; P2 with
 * nothing made does not say "You made 0 resources"; hours are "about", never
 * 0 when something was made; P12 names the plan; the trial's plan block shows
 * the real end date and never "days left".
 */

test.describe("cost line on tool open", () => {
  test("enough: the typical cost and what is left", () => {
    expect(costLine("slideshow", 640)).toEqual({ enough: true, text: "Usually about 15 resources. You have 640." });
  });

  test("not enough: the spec's sentence, from the same rounding as the server", () => {
    expect(costLine("lesson-planner", 12)).toEqual({
      enough: false,
      text: "This usually needs about 30. You have 12.",
    });
  });

  test("exactly enough is enough", () => {
    expect(costLine("lesson-planner", 30).enough).toBe(true);
  });

  test("an unknown tool still gets a cautious line; negatives floor at 0", () => {
    expect(costLine("brand-new-tool", 3)).toEqual({ enough: false, text: "This usually needs about 5. You have 3." });
    expect(costLine("quiz-generator", -4).text).toBe("This usually needs about 1. You have 0.");
  });

  test("one resource is singular", () => {
    expect(costLine("quiz-generator", 50).text).toBe("Usually about 1 resource. You have 50.");
  });
});

test.describe("P3", () => {
  test("the Free version", () => {
    const v = p3View({ prompt: "P3", variant: "free", needed: 30, left: 12, refillAt: null })!;
    expect(v.title).toBe("That's this week's free resources used.");
    expect(v.primary).toEqual({ label: "Go Pro", action: "picker" });
    expect(v.secondary).toEqual({ label: "Wait for Sunday", action: "close" });
    expect(v.need).toBe("This usually needs about 30. You have 12.");
  });

  test("the trial version", () => {
    const v = p3View({ prompt: "P3", variant: "trial", needed: 20, left: 4, refillAt: null })!;
    expect(v.title).toBe("You've used all 300 trial resources.");
    expect(v.primary).toEqual({ label: "Keep Pro", action: "picker" });
    expect(v.secondary).toEqual({ label: "Switch to Free now", action: "switch_to_free" });
  });

  test("a paid plan's top-up payload is not P3", () => {
    expect(p3View({ prompt: null, variant: "topup", needed: 20, left: 4, refillAt: null })).toBeNull();
  });
});

test.describe("P2", () => {
  test("names what was made and the time saved", () => {
    const v = p2View({ made: 14, minutes: 300 });
    expect(v.body).toContain("You made 14 resources and saved about 5 hours.");
    expect(v.body).toContain("You're on Free now");
    expect(v.buttons).toEqual(["Keep Pro, £7.99 a month", "Standard, £4.99", "Carry on with Free"]);
  });

  test("nothing made: no zero sentence", () => {
    const v = p2View({ made: 0, minutes: 0 });
    expect(v.body).not.toContain("You made");
    expect(v.body.startsWith("You're on Free now")).toBe(true);
  });

  test("hours are about, rounded, and at least 1 when anything was saved", () => {
    expect(hoursSaved(0)).toBe(0);
    expect(hoursSaved(10)).toBe(1);
    expect(hoursSaved(89)).toBe(1);
    expect(hoursSaved(91)).toBe(2);
    expect(p2View({ made: 1, minutes: 10 }).body).toContain("You made 1 resource and saved about 1 hour.");
  });
});

test("P12 names the plan", () => {
  expect(p12Line("pro")).toBe("Your last payment didn't go through. Update your card to keep Pro.");
  expect(p12Line("max")).toContain("keep Max.");
});

test.describe("the sidebar plan block (4.5)", () => {
  const ends = new Date("2026-11-25T23:59:59Z");

  test("the trial shows its real end date and Keep Pro, never days left", () => {
    const b = planBlockV45("pro_trial", ends);
    expect(b.note).toBe("Pro trial until Wed 25 Nov");
    expect(b.cta).toEqual({ label: "Keep Pro", href: "/pricing?plan=pro" });
    expect(b.note).not.toMatch(/days? left/);
  });

  test("Free sells Pro; Standard upgrades; Pro and Max see plans", () => {
    expect(planBlockV45("free", null).cta.label).toBe("Go Pro");
    expect(planBlockV45("standard", null).cta.label).toBe("Upgrade");
    expect(planBlockV45("pro", null).cta.label).toBe("See plans");
    expect(planBlockV45("max", null).cta.href).toBe("/pricing");
  });

  test("Free's note says what it has", () => {
    expect(planBlockV45("free", null).note).toBe("50 resources every Sunday");
  });
});

test("no copy here has dashes, AI or credits", () => {
  const all = [
    costLine("slideshow", 3).text,
    JSON.stringify(p3View({ prompt: "P3", variant: "free", needed: 30, left: 1, refillAt: null })),
    JSON.stringify(p3View({ prompt: "P3", variant: "trial", needed: 30, left: 1, refillAt: null })),
    JSON.stringify(p2View({ made: 3, minutes: 60 })),
    p12Line("standard"),
    JSON.stringify(planBlockV45("pro_trial", new Date())),
  ].join(" ");
  expect(all).not.toMatch(/[–—]/);
  expect(all).not.toMatch(/\bAI\b|credits|tokens/);
});
