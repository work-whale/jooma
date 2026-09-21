import { test, expect, type Page } from "@playwright/test";
import {
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * The composer's tool pill.
 *
 * ── What it replaced, and why ──
 * There were two pills here, Level and Tone, and Level was the problem: it
 * reached only the REPLY prompt and never the tool-selection pass, so a teacher
 * who chose "Year 5" and asked for a quiz got a reply pitched at Year 5 and a
 * quiz form with no year group in it. It looked like a control and was not.
 *
 * The tool pill is the opposite: it binds the routing. Naming a tool in prose
 * does not — production has a teacher writing "Create me a slideshow from the
 * slideshow tool" and still being sent to a deprecated one, because a sentence
 * is only a suggestion to the model that picks. The pill forces the slug
 * server-side instead.
 *
 * Nothing here sends a message, so NO MODEL IS CALLED AND NO CREDITS ARE SPENT.
 * The routing itself is covered by unit tests over validatePrefill, which is
 * where the forcing actually lands; this file covers the control.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

/*
 * Exact, and scoped to a <select>.
 *
 * `getByLabel("Tool")` alone also matches the Next.js dev tools button ("Open
 * Next.js Dev Tools"), which is present in dev and would make every assertion
 * here a strict-mode violation rather than a real result.
 */
const toolPill = (page: Page) => page.locator('select[aria-label="Tool"]');

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Jopill");
  // Ask Jo is part of Pro, and the whole composer stays disabled without it —
  // correctly, since a free teacher has nothing to send. Comped rather than
  // paying: no Stripe objects exist for a test user.
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test("the composer offers one tool pill, and no Level or Tone", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");

  await expect(toolPill(page)).toBeVisible();

  // THE REGRESSION GUARD. Both of these were ornamental: removing them is the
  // point of the change, so their return should fail here.
  await expect(page.locator('select[aria-label="Level"]')).toHaveCount(0);
  await expect(page.locator('select[aria-label="Tone"]')).toHaveCount(0);

  // And exactly one pill, not a third quietly added beside it.
  await expect(page.locator("select[aria-label]")).toHaveCount(1);
});

test("defaults to letting Jo choose", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");

  // The whole composer is disabled until the plan gate resolves, so wait for
  // it the way a teacher does rather than asserting into a loading state.
  await expect(toolPill(page)).toBeEnabled();

  // Empty means auto-select, which is the pre-existing behaviour untouched. A
  // teacher who ignores the pill must get exactly what they got before.
  await expect(toolPill(page)).toHaveValue("");
  await expect(toolPill(page)).toContainText("Auto");
});

test("lists tools by their short product names, grouped by category", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");

  // The short V2 names, as Make and Library show them — a teacher should
  // recognise the option before they read it twice.
  const names = await toolPill(page).locator("option").allTextContents();
  expect(names).toContain("Quizzes");
  expect(names).toContain("Slides");
  expect(names).toContain("Lesson Plan");

  // Grouped, because 35 flat options is a wall.
  const groups = await toolPill(page).locator("optgroup").evaluateAll((els) =>
    els.map((e) => e.getAttribute("label")),
  );
  expect(groups).toContain("Slides");
  expect(groups).toContain("Assessment");
});

test("offers the real slideshow tool and not the deleted one", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");

  const values = await toolPill(page).locator("option").evaluateAll((els) =>
    els.map((e) => (e as HTMLOptionElement).value),
  );

  expect(values).toContain("slideshow");
  expect(values).not.toContain("lesson-slideshow");
});

test("a picked tool sticks", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");
  await expect(toolPill(page)).toBeEnabled();

  await toolPill(page).selectOption("quiz-generator");
  await expect(toolPill(page)).toHaveValue("quiz-generator");

  // Typing must not clear the choice: the pill describes the message being
  // written, so losing it mid-sentence would be worse than not having it.
  await page.getByRole("textbox").first().fill("Something about fractions");
  await expect(toolPill(page)).toHaveValue("quiz-generator");
});

test("the choice can be given back to Jo", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/assistant");
  await expect(toolPill(page)).toBeEnabled();

  await toolPill(page).selectOption("quiz-generator");
  await toolPill(page).selectOption("");

  // Back to auto-select. A pill you cannot un-pick would be a trap.
  await expect(toolPill(page)).toHaveValue("");
});
