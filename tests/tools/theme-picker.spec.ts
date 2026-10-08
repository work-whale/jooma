import { test, expect, type Page } from "@playwright/test";

/*
 * The slide theme picker: three families (Playful, Professional, Basic), each
 * with its own designs, opening on the family that suits the year group.
 *
 * Guest /create, every /api call stubbed: nothing reaches a model.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function openThemeStep(page: Page, year: string) {
  await page.route("**/api/try/prefill", (route) =>
    route.fulfill({ json: { prefill: encodePrefill({ slug: "slideshow", fields: { topic: "Volcanoes", year } }) } }),
  );
  await page.route("**/api/suggest-subject", (route) => route.fulfill({ json: { subject: "", strand: "", statementIds: [] } }));
  await page.goto(`/create?tool=slides&topic=${encodeURIComponent(`Volcanoes, ${year}`)}`);
  await expect(page.locator('input[name="lesson-topic"]')).toHaveValue("Volcanoes", NAV);
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  const picker = page.getByTestId("theme-picker");
  await expect(picker).toBeVisible();
  return picker;
}

test("three families, each with its own designs, Playful first for a primary class", async ({ page }) => {
  const picker = await openThemeStep(page, "Year 3");

  const tabs = picker.getByRole("tab");
  // Each tab carries its name and a one-line description.
  await expect(tabs).toHaveText([/^Playful/, /^Professional/, /^Basic/]);
  await expect(picker.getByRole("tab", { name: "Playful" })).toHaveAttribute("aria-selected", "true");
  // The playful default is already chosen.
  await expect(picker.locator('[data-theme-id="sticker"]')).toHaveAttribute("aria-pressed", "true");

  await picker.getByRole("tab", { name: "Basic" }).click();
  for (const id of ["clean", "mono", "readable", "high-contrast", "calm"]) {
    await expect(picker.locator(`[data-theme-id="${id}"]`)).toBeVisible();
  }
  // Nothing from another family on this tab.
  await expect(picker.locator('[data-theme-id="sticker"]')).toHaveCount(0);

  await picker.locator('[data-theme-id="readable"]').click();
  await expect(picker.locator('[data-theme-id="readable"]')).toHaveAttribute("aria-pressed", "true");

  await page.screenshot({ path: "test-results/theme-picker.png" });
});

test("Professional first for an older class", async ({ page }) => {
  const picker = await openThemeStep(page, "Year 9");
  await expect(picker.getByRole("tab", { name: "Professional" })).toHaveAttribute("aria-selected", "true");
  await expect(picker.locator('[data-theme-id="paper"]')).toHaveAttribute("aria-pressed", "true");
});
