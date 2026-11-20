import { test, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Before and after screenshots of the Make page (favourites, A to Z), the
 * sidebar and the share dialog, on STAGING, for docs/screenshots/ (gitignored).
 * Not a test: skipped unless SCREENSHOTS=1.
 *
 *   SCREENSHOTS=1 SHOT_PHASE=before npx playwright test tests/screens/favourites-share.spec.ts
 *   SCREENSHOTS=1 SHOT_PHASE=after  npx playwright test tests/screens/favourites-share.spec.ts
 */

test.skip(process.env.SCREENSHOTS !== "1", "Screenshots only: set SCREENSHOTS=1");
test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const PHASE = process.env.SHOT_PHASE === "before" ? "before" : "after";
const OUT = `docs/screenshots/2026-11-20-favourites-share/${PHASE}`;

let teacher: TestTeacher | null = null;
test.afterAll(async () => deleteTeacher(teacher));

async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test("make page, sidebar and share dialog", async ({ page }) => {
  teacher = await createTeacher("Shots");
  const { data, error } = await admin
    .from("tool_runs")
    .insert({
      user_id: teacher.id,
      tool_slug: "worksheet-generator",
      title: "Fractions of amounts",
      input: { topic: "Fractions of amounts", yearGroup: "Year 5", subject: "Maths" },
      output: "# Fractions of amounts\n\n1. Find half of 24.\n2. Find a quarter of 36.\n3. Find three quarters of 40.",
    })
    .select("id")
    .single();
  if (error) throw error;

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, teacher);
  await page.goto("/tools", NAV);
  await page.getByRole("heading", { name: "What would you like to make?" }).waitFor(NAV);
  await shot(page, "desktop-make");

  await page.goto("/folders", NAV);
  await page.getByText("Fractions of amounts").first().waitFor(NAV);
  await page.getByRole("button", { name: "Fractions of amounts menu" }).first().click();
  await shot(page, "desktop-library-menu");
  await page.getByRole("menuitem", { name: /^Share/ }).first().click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "desktop-share-dialog");

  if (PHASE === "after") {
    await page.getByRole("tab", { name: "Link" }).click();
    await shot(page, "desktop-share-link-empty");
    await page.getByRole("button", { name: "Create link" }).click();
    const url = await page.getByTestId("share-link-url").inputValue();
    await shot(page, "desktop-share-link-live");

    const phone = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
    const p = await phone.newPage();
    await p.goto(url, NAV);
    await p.getByRole("heading", { name: "Fractions of amounts", level: 1 }).first().waitFor(NAV);
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/phone-shared-page-signed-out.png`, fullPage: true });
    await phone.close();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools", NAV);
  await page.getByRole("heading", { name: "What would you like to make?" }).waitFor(NAV);
  await shot(page, "phone-make");
});
