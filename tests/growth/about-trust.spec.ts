import { test, expect } from "@playwright/test";
import { SUB_PROCESSORS } from "@/app/lib/legal/sub-processors";
import { BRAND_DEFINITION } from "@/app/lib/seo/brand";

/*
 * The About and Trust pages, signed out.
 *
 * About is where search engines and assistants learn what the company is;
 * Trust is what a school's data protection lead reads before saying yes. The
 * property worth pinning on Trust is that it names exactly the providers the
 * privacy policy names, which is why both read one list.
 */

test.describe("About and Trust, signed out", () => {
  test("About opens and states what Jooma is", async ({ page }) => {
    const res = await page.goto("/about");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByTestId("about-intro")).toHaveText(BRAND_DEFINITION);
    await expect(page).toHaveTitle("About Jooma | Jooma");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.jooma.ai/about");
  });

  test("Trust opens and lists every sub-processor", async ({ page }) => {
    const res = await page.goto("/trust");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Trust and data protection");
    for (const p of SUB_PROCESSORS) {
      await expect(page.locator("th", { hasText: p.name }).first()).toBeVisible();
    }
  });

  test("the privacy policy names the same providers as Trust", async ({ page }) => {
    await page.goto("/privacy");
    for (const p of SUB_PROCESSORS) {
      await expect(page.locator("td", { hasText: p.name }).first()).toBeVisible();
    }
  });

  test("the footer links both pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('footer a[href="/about"]')).toHaveCount(1);
    await expect(page.locator('footer a[href="/trust"]')).toHaveCount(1);
  });
});
