import { test, expect, type Page } from "@playwright/test";
import {
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Jo handing a slides request to the REAL slideshow tool.
 *
 * ── What this is guarding ──
 * /tools/slideshow is a deck LIST, not a form, so it was left out of Jo's
 * registry and every "make me slides" request went to `lesson-slideshow`
 * instead: an older tool, hidden from the grid, absent from the catalogue, and
 * still live by URL. Production has a teacher asking for "a slideshow from the
 * slideshow tool" and still being sent to the deprecated one. That tool has now
 * been deleted and this page takes the prefill.
 *
 * The handover differs from every other tool: there is no animated per-field
 * fill, because there is no form. The prefill opens the generate wizard with
 * step one already filled, and the teacher continues as usual.
 *
 * Like jo-fill.spec.ts, every test here drives a hand built ?prefill= URL
 * rather than a conversation, so NOTHING REACHES A MODEL AND NO CREDITS ARE
 * SPENT. Nothing clicks the final Generate either: that would burn a deck on
 * every run, and everything up to it is what changed.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

/** base64url, matching encodePrefill in app/lib/toolPrefill.ts. */
function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function slideshowUrl(fields: Record<string, unknown>): string {
  return `/tools/slideshow?prefill=${encodePrefill({ slug: "slideshow", fields })}`;
}

const FULL = {
  topic: "The water cycle",
  year: "Year 5",
  slideCount: 10,
  additionalInstructions: "Focus on evaporation and condensation.",
};

/** The wizard's topic box, which is the field that gates Continue. */
const topicInput = (page: Page) => page.locator('input[name="lesson-topic"]');
const instructions = (page: Page) => page.locator('textarea[name="lesson-instructions"]');

/** The modal itself, addressed by its dialog role. */
const wizard = (page: Page) => page.getByRole("dialog");

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Joslides");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test("a prefill opens the generate wizard, already filled in", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto(slideshowUrl(FULL));

  // The wizard opens on arrival rather than leaving the teacher on a deck list
  // they would then have to act on. This is the slideshow's equivalent of a
  // form arriving prefilled.
  await expect(wizard(page)).toBeVisible();
  await expect(topicInput(page)).toHaveValue("The water cycle");
  await expect(instructions(page)).toHaveValue(/evaporation/);

  // The year and slide count are PillSelects: custom button-backed dropdowns,
  // not native <select>s, so the chosen value shows as the button's own label.
  // A value outside their option lists would fall back to the placeholder,
  // which is the silent-drop failure these assertions exist to catch.
  await expect(wizard(page).getByRole("button", { name: "Year 5" })).toBeVisible();
  await expect(wizard(page).getByRole("button", { name: "10 slides" })).toBeVisible();
});

test("a slide count the control cannot show is snapped to one it can", async ({ page }) => {
  await signIn(page, teacher);
  // The registry accepts 3 to 20, but the control only offers 5, 6, 8, 10, 12
  // and 14. An unsnapped 7 would render as the placeholder and read as the
  // teacher's request being ignored.
  await page.goto(slideshowUrl({ topic: "Fractions", slideCount: 7 }));

  await expect(wizard(page)).toBeVisible();
  await expect(wizard(page).getByRole("button", { name: "6 slides" })).toBeVisible();
});

test("the teacher still has to press Generate", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto(slideshowUrl(FULL));

  // The rule every prefill follows: Jo fills the form, the teacher presses the
  // button. A misread request must cost nothing, so arriving here must not
  // have started a deck.
  await expect(wizard(page)).toBeVisible();
  await expect(page).toHaveURL(/\/tools\/slideshow/);
  await expect(page).not.toHaveURL(/\/editor\//);

  // Step one, not a generation in progress.
  await expect(page.getByRole("button", { name: /^Continue$/ })).toBeVisible();
});

test("a topic alone is enough, and the rest keeps its defaults", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto(slideshowUrl({ topic: "Ancient Egypt" }));

  await expect(wizard(page)).toBeVisible();
  await expect(topicInput(page)).toHaveValue("Ancient Egypt");
  // Continue is gated on the topic, so a minimal prefill still moves.
  await expect(page.getByRole("button", { name: /^Continue$/ })).toBeEnabled();
});

test("a hand edited payload opens an ordinary deck list, never a broken wizard", async ({ page }) => {
  await signIn(page, teacher);

  // The payload rides in a URL, so it is hostile input. An unparseable one
  // decodes to null and the page falls back to what it always was.
  await page.goto("/tools/slideshow?prefill=not-valid-base64!!");

  await expect(page.getByRole("heading", { name: /slideshows/i })).toBeVisible();
  await expect(wizard(page)).toHaveCount(0);
});

test("a prefill for a different tool does not open this one's wizard", async ({ page }) => {
  await signIn(page, teacher);

  // Validated against the slug, not just decoded: a lesson-planner payload
  // aimed at this route must not seed a slideshow.
  const foreign = encodePrefill({
    slug: "lesson-planner",
    fields: { subject: "Science", topic: "The water cycle" },
  });
  await page.goto(`/tools/slideshow?prefill=${foreign}`);

  await expect(page.getByRole("heading", { name: /slideshows/i })).toBeVisible();
  await expect(wizard(page)).toHaveCount(0);
});

test("the deprecated lesson-slideshow tool is gone", async ({ page }) => {
  await signIn(page, teacher);

  const response = await page.goto("/tools/lesson-slideshow");

  // It had a live page, a live API route and a place in GENERATION_PATHS, so it
  // burned a free teacher's quota while being unreachable from the grid. If
  // this ever returns 200 again, something has been restored by accident.
  expect(response?.status()).toBe(404);
});
