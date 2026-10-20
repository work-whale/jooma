import { test, expect } from "@playwright/test";
import { DESKTOP_HINT_TEXT, hintScope } from "@/app/lib/desktopHint";
import { joSlidesSystem } from "@/app/lib/jo/prompts";

/*
 * The pure pieces of the mobile pass for the signed-in app: where Jo's
 * "try it on a desktop" nudge is remembered, and what Jo says when it cannot
 * change a picture.
 */

const DASHES = /[—–]/;

test.describe("the desktop hint", () => {
  test("is remembered once per tool, not once per page", () => {
    expect(hintScope("/tools/quiz-generator")).toBe("/tools/quiz-generator");
    expect(hintScope("/tools/slideshow/abc")).toBe("/tools/slideshow");
    expect(hintScope("/editor/abc")).toBe("/editor");
    expect(hintScope("/editor/xyz")).toBe(hintScope("/editor/abc"));
    expect(hintScope("/tools/quiz-generator")).not.toBe(hintScope("/tools/slideshow"));
  });

  test("asks in Jo's words, with no long dashes", () => {
    expect(DESKTOP_HINT_TEXT).toBe("Would you like a better experience? Try Jooma on your desktop.");
    expect(DESKTOP_HINT_TEXT).not.toMatch(DASHES);
  });
});

test.describe("Jo and pictures", () => {
  test("a signed in teacher's Jo can swap a slide's picture", () => {
    const system = joSlidesSystem({ canAsk: true, guest: false });
    expect(system).toContain("setSlideImage");
    expect(system).not.toContain("Sign up and upgrade your account");
  });

  test("a guest's Jo says what unlocks it, rather than calling it restricted", () => {
    const system = joSlidesSystem({ canAsk: true, guest: true });
    expect(system).not.toContain("setSlideImage");
    expect(system).toContain("Sign up and upgrade your account so I can help you with this.");
    expect(system).toContain("Never call anything restricted");
  });
});
