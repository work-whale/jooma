import { test, expect } from "@playwright/test";
import {
  admin,
  createTeacher,
  deleteTeacher,
  seedResource,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Reading a generation with the whole screen.
 *
 * The output renders below the form, so reading what you just made means
 * scrolling past every field that made it. The Focus button opens the same
 * document in a dialog with its outline beside it.
 *
 * The interesting half is the outline. It renders through OutlineRail, which
 * drives the SAME hook as the page's own outline but against a scroll
 * container rather than the window. Getting that wrong is silent: the links
 * render and highlight, and clicking them does nothing, or scrolls the page
 * behind the scrim instead.
 */

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Nadia");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

/** Long enough that the last heading starts well below the fold, or a click
 *  that does nothing at all would still leave it "visible". */
const filler = Array.from({ length: 40 }, (_, i) => `Line ${i} of the body.`).join("\n\n");
const DOC = `# Rivers\n\n${filler}\n\n## Erosion\n\n${filler}\n\n## Deposition\n\n${filler}`;

async function openRun(page: import("@playwright/test").Page, title = "Nadia's rivers lesson") {
  const runId = await seedResource(teacher, title, DOC);
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${runId}`);
  await expect(page.getByRole("heading", { name: "My results" })).toBeVisible();
  return runId;
}

test("the focus view opens with the document and its outline", async ({ page }) => {
  await openRun(page);

  await page.getByRole("button", { name: /open in focused view/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The document, rendered as markdown. Level 1 explicitly: the outline
  // repeats every heading as a button, and the dialog's own title is an h2.
  await expect(dialog.getByRole("heading", { name: "Rivers", level: 1, exact: true })).toBeAttached();
  await expect(dialog.getByText(/Line 0 of the body\./).first()).toBeVisible();

  // The actions came with it.
  await expect(dialog.getByRole("button", { name: /export options/i })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /copy to clipboard/i })).toBeVisible();

  /*
   * The floating outline button must NOT have leaked in. It portals to
   * document.body, so if OutlineRail ever reused that presentation it would
   * render OVER the scrim it is supposed to live inside.
   */
  await expect(page.getByRole("button", { name: /jump to section/i })).toHaveCount(0);
});

test("an outline link scrolls the dialog's own scrollport", async ({ page }) => {
  await openRun(page);

  /*
   * Let the page settle BEFORE reading the baseline.
   *
   * ResultPanel scrolls the panel into view on a 100ms timer once a result
   * lands. Reading window.scrollY while that is still running compares two
   * points of one animation, which fails this test for a reason that has
   * nothing to do with the outline. Polling for a stable value is what makes
   * the comparison below mean what it says.
   */
  let last = -1;
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => window.scrollY);
      const settled = y === last;
      last = y;
      return settled;
    }, { timeout: 10_000 })
    .toBe(true);
  const pageScrollBefore = last;

  await page.getByRole("button", { name: /open in focused view/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Deposition" }).click();

  /*
   * Prove the CONTAINER scrolled: the heading sits near the top of the
   * scrollport. A bare toBeVisible() would pass with the scrolling entirely
   * broken, and this is what catches a useRef where the callback ref belongs.
   */
  await expect
    .poll(
      async () =>
        dialog.evaluate((node) => {
          const heading = node.querySelector<HTMLElement>("#deposition");
          // The scrollport is the element that actually overflows.
          const port = [...node.querySelectorAll<HTMLElement>("div")].find(
            (el) => el.scrollHeight > el.clientHeight + 20 && el.scrollTop > 0,
          );
          if (!heading || !port) return null;
          return Math.round(heading.getBoundingClientRect().top - port.getBoundingClientRect().top);
        }),
      { timeout: 10_000 },
    )
    .toBeLessThan(60);

  // And the page behind the scrim did not move. This is the failure the
  // window-only positional fallback would produce if it ever fired in here.
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
});

test("the focus view shows edits made in the editor", async ({ page }) => {
  await openRun(page);

  // Type into Tiptap. The edit round-trips through onChange into the form's
  // `result`, which is what the modal reads.
  const editor = page.locator(".prose-editor");
  await editor.click();
  await page.keyboard.type("A line the teacher added. ");

  await page.getByRole("button", { name: /open in focused view/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/A line the teacher added\./)).toBeVisible();
});

test("Escape closes the focus view and returns focus to the button", async ({ page }) => {
  await openRun(page);

  const focusButton = page.getByRole("button", { name: /open in focused view/i });
  await focusButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(focusButton).toBeFocused();
});

test("opening the focus view saves nothing", async ({ page }) => {
  await openRun(page, "Nadia's counted lesson");

  const before = await admin
    .from("tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", teacher.id);

  await page.getByRole("button", { name: /open in focused view/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const after = await admin
    .from("tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", teacher.id);

  // Reading is not generating. The modal renders MarkdownResult rather than
  // ResultPanel precisely so it carries no historyMeta and writes no row.
  expect(after.count).toBe(before.count);
});
