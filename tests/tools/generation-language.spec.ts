import { test, expect, type Page } from "@playwright/test";
import { createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * The output language of a generation: the Language dropdown on the tool
 * forms and the slideshow wizard, and the value they send.
 *
 * Every generation route is answered by page.route: NOTHING REACHES A MODEL
 * AND NOTHING IS SPENT. What is checked is what the browser SENDS; the server
 * side (an empty instruction for UK English, an override for the rest) is
 * covered by tests/unit/languages.spec.ts.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Records each request body to `path` and refuses it, so nothing generates. */
async function capture(page: Page, path: string) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**${path}`, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Stubbed in test" } });
  });
  return bodies;
}

async function openWorksheet(page: Page) {
  const fields = { curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Science", learningObjective: "The water cycle" };
  await page.goto(`/tools/worksheet-generator?prefill=${encodePrefill({ slug: "worksheet-generator", fields })}`, NAV);
  const check = page.getByRole("button", { name: /check the inputs first/i });
  if (await check.isVisible({ timeout: 15_000 }).catch(() => false)) await check.click();
}

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Langs");
  // On a plan, so the real tool pages open (a locked account lands on /free-tools).
  await setPlan(teacher, "max", "paying");
});
test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test("a form defaults to English (UK) and sends en-GB", async ({ page }) => {
  await signIn(page, teacher);
  const sent = await capture(page, "/api/worksheet-generator");
  await openWorksheet(page);

  const language = page.getByTestId("language-field").getByLabel("Language");
  await expect(language).toHaveValue("en-GB", NAV);
  await expect(language.locator("option:checked")).toHaveText("English (UK)");
  // All 14 of Chalkie's locales, each in its own language.
  await expect(language.locator("option")).toHaveCount(14);
  await expect(language.locator("option")).toContainText(["English (UK)", "English (US)", "Deutsch", "Español", "Eesti", "Français", "Italiano", "Polski", "Português (Portugal)", "Português (Brasil)", "Svenska"]);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0].language).toBe("en-GB");
});

test("picking French sends fr, and the choice follows the teacher to another tool and a reload", async ({ page }) => {
  await signIn(page, teacher);
  const worksheet = await capture(page, "/api/worksheet-generator");
  const comprehension = await capture(page, "/api/comprehension-generator");
  await openWorksheet(page);

  const language = page.getByTestId("language-field").getByLabel("Language");
  await expect(language).toBeEnabled(NAV);
  await language.selectOption("fr");
  await expect(language).toHaveValue("fr");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => worksheet.length, NAV).toBe(1);
  expect(worksheet[0].language).toBe("fr");
  // The rest of the request is untouched.
  expect(worksheet[0]).toMatchObject({ curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Science" });

  // Still French after a reload.
  await openWorksheet(page);
  await expect(page.getByTestId("language-field").getByLabel("Language")).toHaveValue("fr", NAV);

  // And on another tool.
  const fields = { curriculum: "2014 National Curriculum", yearGroup: "Year 5", topic: "Why bees matter" };
  await page.goto(`/tools/comprehension-generator?prefill=${encodePrefill({ slug: "comprehension-generator", fields })}`, NAV);
  const check = page.getByRole("button", { name: /check the inputs first/i });
  if (await check.isVisible({ timeout: 15_000 }).catch(() => false)) await check.click();
  await expect(page.getByTestId("language-field").getByLabel("Language")).toHaveValue("fr", NAV);
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => comprehension.length, NAV).toBe(1);
  expect(comprehension[0].language).toBe("fr");
});

test("a stored code that is no longer offered falls back to English (UK)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ll:language", JSON.stringify("klingon")));
  await signIn(page, teacher);
  const sent = await capture(page, "/api/worksheet-generator");
  await openWorksheet(page);
  await expect(page.getByTestId("language-field").getByLabel("Language")).toHaveValue("en-GB", NAV);
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0].language).toBe("en-GB");
});

test("the slideshow wizard has a Language pill and the deck request carries it", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ll:language", JSON.stringify("en-GB")));
  await signIn(page, teacher);
  const deck = await capture(page, "/api/generate-slideshow");

  const fields = { topic: "The water cycle", year: "Year 5", slideCount: 6 };
  await page.goto(`/tools/slideshow?prefill=${encodePrefill({ slug: "slideshow", fields })}`, NAV);
  const wizard = page.getByRole("dialog");
  const pill = wizard.getByRole("button", { name: "English (UK)" });
  await pill.click(NAV);
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await expect(wizard.getByRole("button", { name: "Deutsch" })).toBeVisible();

  await wizard.getByRole("button", { name: /^Continue/ }).click();
  await wizard.getByRole("button", { name: /^Continue/ }).click();
  await wizard.getByRole("button", { name: "Generate slideshow" }).click();
  await page.waitForURL(/\/editor\//, NAV);
  await expect.poll(() => deck.length, NAV).toBe(1);
  expect(deck[0]).toMatchObject({ topic: "The water cycle", language: "de" });
});
