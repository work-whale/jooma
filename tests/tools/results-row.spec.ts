import { test, expect } from "@playwright/test";
import { createTeacher, deleteTeacher, seedResource, signIn, type TestTeacher } from "../support/users";

/*
 * The results row, after it was extracted into one component.
 *
 * ToolResults replaced the same twenty lines copy-pasted into all 32 markdown
 * tool forms. A typecheck proves the imports line up; it cannot prove the
 * outline still renders or that the panel still appears, which is the whole
 * claim of a refactor that is supposed to change nothing.
 *
 * NO MODEL CALL. Every test here seeds a tool_runs row and opens it with
 * `?run=`, the launch path Dashboard, Folders and Analytics already use, so the
 * document arrives without generating one.
 */

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Rosa");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

/** Long enough that the last heading starts well below the fold, so a link that
 *  does nothing at all cannot pass by leaving it already on screen. */
const filler = Array.from({ length: 40 }, (_, i) => `Line ${i} of the body.`).join("\n\n");
const DOC = `# Rivers\n\n${filler}\n\n## Erosion\n\n${filler}\n\n## Deposition\n\n${filler}`;

test("a saved run opens with its document, outline and export actions", async ({ page }) => {
  const runId = await seedResource(teacher, "Rosa's rivers lesson", DOC);

  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${runId}`);

  // The panel itself. "My results" is ResultPanel's own header, so its presence
  // is what says the extracted component mounted at all.
  await expect(page.getByRole("heading", { name: "My results" })).toBeVisible();

  // The document rendered. Level 1 explicitly: the outline repeats every
  // heading as a button, and the page chrome carries headings of its own.
  await expect(page.getByRole("heading", { name: "Rivers", level: 1, exact: true })).toBeAttached();

  // The outline column. This is the half most likely to have been dropped in a
  // 32 file edit, because nothing else fails if it silently stops rendering.
  //
  // Located by the panel it controls rather than by visible text: the outline
  // is a collapsed tab now, so "Jump to section" is its accessible name rather
  // than a heading on screen, and the headings live inside the panel until it
  // is opened.
  const tab = page.locator('button[aria-controls="outline-hover-panel"]');
  await expect(tab).toBeVisible();
  // Clicking rather than hovering: a click pins the panel open, which does not
  // depend on the pointer staying put or on the deliberate 120ms hover delay.
  // The hover path has its own coverage in outline-hover.spec.ts.
  await tab.click();
  await expect(
    page.locator("#outline-hover-panel").getByRole("button", { name: "Deposition" }),
  ).toBeVisible();

  // The actions the panel owns. Their labels collapse below sm:, and the
  // desktop project runs at 1280 wide, so both read in full here.
  await expect(page.getByRole("button", { name: /export options/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /copy to clipboard/i })).toBeVisible();
});

test("an outline link scrolls the page to its heading", async ({ page }) => {
  const runId = await seedResource(teacher, "Rosa's rivers lesson", DOC);

  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${runId}`);

  await expect(page.getByRole("heading", { name: "My results" })).toBeVisible();

  /*
   * The headings live inside the collapsed panel now, so it has to be opened
   * before one can be picked. Clicking the tab pins it, which does not depend
   * on the pointer staying put.
   *
   * Waiting for the TICKS first, not just for the tab to be visible: the tab
   * renders as soon as the outline has two headings, but the run arrives
   * asynchronously through ?run= and the marks appear with it. Clicking into a
   * tab that is still settling toggles a panel that then re-renders empty.
   */
  const tab = page.locator('button[aria-controls="outline-hover-panel"]');
  await expect(tab.locator("span:not(.sr-only)")).toHaveCount(3);
  await tab.click();
  await page
    .locator("#outline-hover-panel")
    .getByRole("button", { name: "Deposition" })
    .click();

  /*
   * Assert the HEADING ARRIVED, not merely that the page moved.
   *
   * SCROLL_OFFSET is 160, to clear the sticky result header, so a successful
   * jump leaves the heading just below that. Polling rides out the smooth
   * scroll. A bare toBeVisible() would pass with the scrolling entirely broken.
   *
   * Once generation finishes ResultPanel swaps in the Tiptap editor, whose DOM
   * carries no heading ids, so this exercises the positional fallback in
   * useOutline rather than getElementById.
   */
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const headings = [
            ...document.querySelectorAll<HTMLElement>(
              ".prose-editor h1, .prose-editor h2, .prose-editor h3",
            ),
          ];
          const target = headings.find((h) => h.textContent?.trim() === "Deposition");
          return target ? Math.round(target.getBoundingClientRect().top) : null;
        }),
      { timeout: 10_000 },
    )
    .toBeLessThan(260);
});

/*
 * A breadth check across four forms, because the extraction touched 32 and the
 * two tests above open only one of them.
 *
 * The four are chosen to cover the shapes that differ: EYFS planner carried the
 * one comment that was not byte-identical, homework generator both refines and
 * renders a RefinePanel after the row, worksheet omits isRefining entirely, and
 * lesson planner is the canonical case.
 *
 * seedResource always writes tool_slug "lesson-planner", which is what the
 * Library reads; the tool PAGE renders from `?run=` regardless of slug, so the
 * document and the row are what is under test here, not the slug routing.
 */
for (const slug of [
  "lesson-planner",
  "worksheet-generator",
  "eyfs-planner",
  "homework-generator",
]) {
  test(`the results row renders on ${slug}`, async ({ page }) => {
    const runId = await seedResource(teacher, `Rosa's ${slug} run`, DOC);

    await signIn(page, teacher);
    await page.goto(`/tools/${slug}?run=${runId}`);

    await expect(page.getByRole("heading", { name: "My results" })).toBeVisible();
    await expect(page.locator('button[aria-controls="outline-hover-panel"]')).toBeVisible();
  });
}
