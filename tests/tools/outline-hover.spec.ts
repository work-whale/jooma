import { test, expect } from "@playwright/test";
import { createTeacher, deleteTeacher, seedResource, signIn, type TestTeacher } from "../support/users";

/*
 * The outline, collapsed to a tab that expands on hover.
 *
 * The card this replaces spent 448px of a roughly 1284px row on navigation
 * that is wanted intermittently. The point of the change is the width the
 * document gets back, so that is asserted directly rather than inferred from
 * the tab being present.
 */

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Priya");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const filler = Array.from({ length: 40 }, (_, i) => `Line ${i} of the body.`).join("\n\n");
const DOC = `# Rivers\n\n${filler}\n\n## Erosion\n\n${filler}\n\n## Deposition\n\n${filler}`;

async function openRun(page: import("@playwright/test").Page) {
  const runId = await seedResource(teacher, "Priya's rivers lesson", DOC);
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${runId}`);
  await expect(page.getByRole("heading", { name: "My results" })).toBeVisible();
}

/*
 * The tab, by the panel it controls.
 *
 * NOT getByRole(name: /jump to section/i): the floating button below 900px
 * carries that same accessible name and is portalled to document.body, so it
 * is in the DOM at every width. A name match resolves to whichever comes
 * first, and hovering a hidden element lands the pointer nowhere.
 */
function outlineTab(page: import("@playwright/test").Page) {
  return page.locator('button[aria-controls="outline-hover-panel"]');
}

test("the outline is collapsed, and the document has the width", async ({ page }) => {
  await openRun(page);

  const tab = outlineTab(page);
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-expanded", "false");
  // One mark per section, which is what makes the collapsed tab readable as a
  // position rather than a handle.
  await expect(tab.locator("span:not(.sr-only)")).toHaveCount(3);

  // The panel is not in the document until it opens.
  await expect(page.locator("#outline-hover-panel")).toHaveCount(0);

  /*
   * THE ASSERTION THAT ENCODES THE REQUEST.
   *
   * The outline column used to be lg:w-md, 448px, plus a 32px gap. Measuring
   * the COLUMN rather than the panel is what states the change directly: 44px
   * is the tab, and anything approaching 448 means it went back to the card.
   *
   * The document's width is the complement, and it is asserted through the
   * results panel below, which is the flex sibling that absorbs whatever the
   * column gives up.
   */
  const tabBox = await tab.boundingBox();
  expect(tabBox).not.toBeNull();
  expect(tabBox!.width).toBeLessThan(60);

  /*
   * The document's share of the row, rather than an absolute width.
   *
   * The app shell caps its content well below the viewport (a 1280 screen
   * gives a row of about 950), so a fixed pixel threshold would encode the
   * shell's width rather than this change. The share is the honest measure:
   * with the old 448px column the document took roughly half the row, and with
   * the tab it takes nearly all of it.
   */
  const share = await page.evaluate(() => {
    const mine = [...document.querySelectorAll("h2")].find(
      (h) => h.textContent?.trim() === "My results",
    );
    const panel = mine?.closest("div.rounded-3xl") as HTMLElement | null;
    const row = panel?.parentElement?.parentElement as HTMLElement | null;
    if (!panel || !row) return null;
    return panel.getBoundingClientRect().width / row.getBoundingClientRect().width;
  });
  expect(share).not.toBeNull();
  expect(share!).toBeGreaterThan(0.85);
});

test("opening the panel and picking a heading scrolls the page", async ({ page }) => {
  await openRun(page);

  const tab = outlineTab(page);
  // Settled first: the marks appearing is what says the outline has derived
  // its headings.
  await expect(tab.locator("span:not(.sr-only)")).toHaveCount(3);

  /*
   * Opened by CLICK, although the feature this covers is the hover panel.
   *
   * Hover genuinely works with a real mouse; it was confirmed by hand. What
   * cannot be reproduced here is the POINTER: locator.hover() dispatches one
   * synthetic mousemove and stops, the tab opens on a 120ms hover-intent
   * delay, and a mark's own hover transition re-targets whatever sits under a
   * stationary synthetic cursor, firing mouseleave and cancelling the pending
   * open. Driving the mouse by hand through several steps did not settle it
   * either.
   *
   * So the pointer timing is left to the unit tests, where hoverReducer's
   * enter, leave, grace and pin rules are exercised directly without a browser
   * (tests/unit/outline-hover.spec.ts). What is worth asserting HERE is the
   * part only a browser can show: that the panel's headings scroll the real
   * document. Click and hover open the same panel, so this covers that either
   * way.
   */
  await tab.click();

  const panel = page.locator("#outline-hover-panel");
  await expect(panel).toBeVisible();
  await expect(tab).toHaveAttribute("aria-expanded", "true");

  await panel.getByRole("button", { name: "Deposition" }).click();

  /*
   * The window scrolled to the heading. SCROLL_OFFSET is 160, to clear the
   * sticky results header, so a successful jump leaves it just below that.
   * Polling rides out the smooth scroll.
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

test("the panel opens from the keyboard and closes on Escape", async ({ page }) => {
  await openRun(page);

  const tab = outlineTab(page);

  // Focus rather than hover: this is the path a teacher with no mouse takes,
  // and focus bubbling to the shell is what opens the panel.
  await tab.focus();
  await expect(page.locator("#outline-hover-panel")).toBeVisible();
  await expect(tab).toHaveAttribute("aria-expanded", "true");

  // The headings are reachable in natural tab order once it is open.
  await expect(
    page.locator("#outline-hover-panel").getByRole("button", { name: "Erosion" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#outline-hover-panel")).toHaveCount(0);
  await expect(tab).toBeFocused();
});

test("clicking the tab pins the panel open", async ({ page }) => {
  await openRun(page);

  const tab = outlineTab(page);
  /*
   * Wait for the MARKS, not merely for the tab to be visible.
   *
   * The run arrives asynchronously through ?run=, so the tab can be on screen
   * while the outline is still deriving. Clicking then toggles a panel that
   * re-renders out from under the assertion.
   */
  await expect(tab.locator("span:not(.sr-only)")).toHaveCount(3);
  await tab.click();

  const panel = page.locator("#outline-hover-panel");
  await expect(panel).toBeVisible();

  // Move the pointer well away. A hover-only panel would close; a pinned one
  // must not, which is the whole touch story at this width.
  await page.mouse.move(900, 600);
  await page.waitForTimeout(600);
  await expect(panel).toBeVisible();

  // A second activation puts it away.
  await tab.click();
  await expect(panel).toHaveCount(0);
});

test("the tab reports the section being read", async ({ page }) => {
  await openRun(page);

  const tab = outlineTab(page);
  await expect(tab.locator("span:not(.sr-only)")).toHaveCount(3);

  /*
   * The ticks are spans with no text, so what is asserted here is the tab's
   * accessible name: "Jump to section: <section>, <n> of <total>". That is the
   * same information the marks carry visually, which is the point of having it.
   *
   * Before any scrolling it names the FIRST heading rather than saying 0 of 3,
   * because activeId is null until the observer first fires and the teacher is
   * in fact at the top of the document.
   */
  await expect(tab).toContainText("Rivers, 1 of 3");

  /*
   * Jump to the last section, and the collapsed tab follows the observer.
   *
   * The panel animates in and re-renders as the observer updates the active
   * heading, so a click issued the instant it mounts races that: Playwright
   * reports the target as "not stable" and then detached. Waiting for the
   * panel itself to be stable first is what makes this deterministic.
   */
  await tab.click();
  const panel = page.locator("#outline-hover-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Deposition" }).waitFor({ state: "visible" });
  await panel.getByRole("button", { name: "Deposition" }).click();

  /*
   * THE REGRESSION THIS GUARDS.
   *
   * ResultPanel swaps MarkdownResult for the Tiptap editor once a generation
   * settles, and the editor emits no heading ids. The observer effect used to
   * run once, before that swap, find nothing to observe, and never re-attach,
   * so the marks froze on an early section while the teacher read a later one.
   * Asserting the LAST section specifically is what catches that.
   */
  await expect(tab).toContainText("Deposition, 3 of 3", { timeout: 10_000 });
});

test("below 900px the tab gives way to the floating button", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await openRun(page);

  // One outline, one presentation: the tab's panel must not be reachable here,
  // and the floating button is what takes over.
  await expect(page.locator("#outline-hover-panel")).toHaveCount(0);

  const fab = page.getByRole("button", { name: /jump to section/i });
  await expect(fab).toBeVisible();
  await fab.click();
  await expect(page.getByRole("dialog", { name: /jump to section/i })).toBeVisible();
});
