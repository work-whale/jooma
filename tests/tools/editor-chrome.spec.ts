import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The slide editor's colours.
 *
 * The brief: dark purple for the top bar and the side bar, light purple behind
 * the slide, and burnt orange behind the mini slides in the tray. They are
 * tokens in globals.css (--j-editor-chrome, --j-editor-canvas, --j-editor-tray)
 * shared by the teacher's editor and the guest one on /create, so this checks
 * the colours the browser actually computed rather than the source.
 *
 * Nothing here generates a deck: the presentation is seeded, so no model call
 * is made and no credits are spent.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const DEEP_PURPLE = "rgb(58, 28, 143)"; // --j-deep #3A1C8F
const LIGHT_PURPLE = "rgb(233, 226, 251)"; // --j-tint-2 #E9E2FB
const BURNT_ORANGE = "rgb(194, 85, 31)"; // --j-orange #C2551F

let teacher: TestTeacher;
let deckId = "";

test.beforeAll(async () => {
  teacher = await createTeacher("Chrome");
  const slide = (n: number) => ({
    shapes: [],
    images: [],
    background: "#ffffff",
    texts: [{
      id: `t${n}`, x: 80, y: 80, width: 800, text: `Slide ${n}`, fontSize: 48, fontWeight: "800",
      fontStyle: "normal", underline: false, fontFamily: "'Inter', sans-serif", color: "#1d1730", textAlign: "left",
    }],
  });
  const { data, error } = await admin
    .from("presentations")
    .insert({ user_id: teacher.id, title: "Chrome check", slides: [slide(1), slide(2), slide(3)] })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  deckId = data.id as string;
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const background = (page: Page, part: string) =>
  page.locator(`[data-editor-chrome="${part}"]`).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test("dark purple bars, a light purple stage and a burnt orange slide tray", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto(`/editor/${deckId}`);

  await expect(page.locator('[data-editor-chrome="tray"]')).toBeVisible(NAV);

  expect(await background(page, "top")).toBe(DEEP_PURPLE);
  expect(await background(page, "rail")).toBe(DEEP_PURPLE);
  expect(await background(page, "canvas")).toBe(LIGHT_PURPLE);
  expect(await background(page, "tray")).toBe(BURNT_ORANGE);

  // Kept as the artefact to eyeball against the brief.
  await page.screenshot({ path: "test-results/editor-chrome.png" });
});
