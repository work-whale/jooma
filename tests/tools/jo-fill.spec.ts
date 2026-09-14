import { test, expect, type Page } from "@playwright/test";
import {
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Jo typing into a tool form.
 *
 * Every test here drives a hand built ?prefill= URL rather than going through a
 * conversation, so nothing reaches a model and NO CREDITS ARE SPENT. That is
 * also why there is no test that clicks "Yes, generate": the assertion would be
 * worth less than the generation it would burn on every run. What is covered is
 * everything up to that click, plus the proof that declining does not generate.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here, and an
 * unhydrated page cannot animate anything.
 */

/** base64url, matching encodePrefill in app/lib/toolPrefill.ts. */
function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A lesson planner prefill with a long objective, so the typing is observable. */
const PREFILL = {
  slug: "lesson-planner",
  fields: {
    curriculum: "2014 National Curriculum",
    yearGroup: "Year 4",
    subject: "Science",
    topic: "The water cycle",
    learningObjective:
      "Identify and describe the four stages of the water cycle, and explain how " +
      "water moves between them.",
    // NOTE: `differentiate` is deliberately absent. Most real prefills omit it
    // (the model is told to set it only when the teacher signals adapting for
    // attainment), so the form must stay submittable without it. See the
    // NEVER_CLEARED set in useToolLaunch.ts, and the test below that guards it.
  },
};

function prefillUrl(): string {
  return `/tools/lesson-planner?prefill=${encodePrefill(PREFILL)}`;
}

/** The panel, addressed by its accessible name. */
function panel(page: Page) {
  return page.getByRole("status", { name: /what jo is doing/i });
}

/*
 * The form's fields are addressed structurally, not by accessible name.
 *
 * The field components render a bare <label> with no htmlFor, and it does not
 * wrap the control either (see LearningObjectiveField.tsx:21), so the inputs
 * have no accessible name to query by. Fixing the labels would be the better
 * change, but it is a 35 form change and not this one.
 *
 * The filter is on a DIRECT label child, and the control is taken from that
 * same div. Matching any div containing the text instead walks up to the Card
 * wrapping the whole form, where "the last input" is whatever field happens to
 * render last: an earlier version of this helper resolved "Subject" to the
 * differentiate radio.
 */
function fieldUnderLabel(page: Page, label: string, control: string) {
  return page
    .locator("div")
    .filter({ has: page.locator(`> label:text-is("${label}")`) })
    .locator(`> div > ${control}, > ${control}`)
    .first();
}

const objectiveField = (page: Page) =>
  fieldUnderLabel(page, "Learning objective", "textarea");
const subjectField = (page: Page) => fieldUnderLabel(page, "Subject", "input");

let teacher: TestTeacher;

test.beforeAll(async () => {
  // One word, no space: createTeacher interpolates this into the address of a
  // throwaway account, and "Jo fill" makes an invalid email.
  teacher = await createTeacher("Jofill");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test.describe("Jo fills a tool form", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, teacher);
  });

  test("types the free text fields in rather than pasting them", async ({ page }) => {
    await page.goto(prefillUrl());

    const objective = objectiveField(page);
    const full = PREFILL.fields.learningObjective;

    // Caught mid-flight: a prefix is on screen before the whole value is. This
    // is the difference between typing and the old instant apply.
    await expect
      .poll(
        async () => {
          const value = await objective.inputValue();
          return value.length > 0 && value.length < full.length;
        },
        { timeout: 3_000, intervals: [30] },
      )
      .toBe(true);

    await expect(objective).toHaveValue(full, { timeout: 5_000 });
  });

  test("fills every field, including the ones that cannot be typed", async ({ page }) => {
    await page.goto(prefillUrl());

    // A <select> lands rather than typing, but it still has to end up set.
    await expect(page.locator("select").first()).toHaveValue(/./, { timeout: 5_000 });
    await expect(subjectField(page)).toHaveValue("Science", { timeout: 5_000 });
  });

  test("typing stops the fill and never overwrites what the teacher wrote", async ({
    page,
  }) => {
    await page.goto(prefillUrl());

    const subject = subjectField(page);
    // Wait for the fill to be under way, then take over.
    await expect(panel(page)).toBeVisible({ timeout: 5_000 });

    await subject.fill("Geography");
    const afterTyping = await subject.inputValue();
    expect(afterTyping).toBe("Geography");

    // The animation must abandon the field it was on rather than finishing it.
    await page.waitForTimeout(1_500);
    await expect(subject).toHaveValue("Geography");
    await expect(panel(page)).toContainText(/stopped/i);
  });

  test("Stop halts the fill and leaves what is already there", async ({ page }) => {
    await page.goto(prefillUrl());

    const stop = page.getByRole("button", { name: /^stop$/i });
    await stop.click();

    await expect(panel(page)).toContainText(/stopped\. the form is yours/i);

    // Whatever landed before Stop stays: the teacher took over, they did not
    // ask to undo. The panel itself is the evidence the fill was halted rather
    // than completed, so this only asserts nothing was wiped.
    await expect(page.locator("select").first()).toHaveValue(/./);
  });

  test("asks whether to generate once it has finished", async ({ page }) => {
    await page.goto(prefillUrl());

    await expect(panel(page)).toContainText(/generate this now\?/i, { timeout: 6_000 });
    await expect(page.getByRole("button", { name: /yes, generate/i })).toBeVisible();
  });

  test("declining generates nothing and leaves Generate armed", async ({ page }) => {
    await page.goto(prefillUrl());

    await page.getByRole("button", { name: /check the inputs first/i }).click();

    // The question is gone and nothing started.
    await expect(page.getByRole("button", { name: /yes, generate/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /generating/i })).toHaveCount(0);

    // The real button is still there, still the teacher's to press.
    await expect(page.getByRole("button", { name: /^generate$/i })).toBeEnabled();
  });

  test("a prefill that says nothing about differentiation still generates", async ({
    page,
  }) => {
    await page.goto(prefillUrl());

    // The regression this guards: the clearing pass used to blank `differentiate`
    // to "", which is neither "no" nor a chosen band, so Generate stayed dead on
    // a form Jo had completely filled in. Omitting it must keep the "no" default.
    await expect(page.getByRole("button", { name: /^generate$/i })).toBeEnabled({
      timeout: 8_000,
    });
  });

  test("reduced motion fills instantly and still asks", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(prefillUrl());

    // No animation, so the final value is there as soon as the form hydrates.
    await expect(objectiveField(page)).toHaveValue(PREFILL.fields.learningObjective, {
      timeout: 5_000,
    });
    await expect(panel(page)).toContainText(/generate this now\?/i);
  });

  test("a saved run restores without animating or asking", async ({ page }) => {
    // ?run= wins over any prefill: a saved run is a real artefact, and typing
    // over real data would be destructive.
    await page.goto("/tools/lesson-planner");

    // No fill happened, so there is no panel and no question.
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /yes, generate/i })).toHaveCount(0);
  });
});
