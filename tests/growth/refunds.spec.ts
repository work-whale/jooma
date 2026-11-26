import { test, expect } from "@playwright/test";

/*
 * The public refund policy page (/refunds), built from
 * docs/18-jooma-refund-policy.html. Signed out, because the people who need it
 * most are deciding whether to pay, and Stripe asks for a page like this.
 *
 * What would go wrong: the page answers with the login page (not in
 * PUBLIC_PATHS), the footer still points at the terms, the numbers on the page
 * differ from the engine's, or the terms page keeps saying refunds are
 * discretionary next to a page that promises them.
 */

test("the footer's refunds link opens the policy, signed out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Refunds and cancellation" }).click();
  await expect(page).toHaveURL(/\/refunds$/);
  await expect(page).toHaveTitle("Refunds and cancellations | Jooma");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "If Jooma is not right for you, we give your money back.",
  );
});

test("answers 200 with every clause and the way to ask", async ({ page }) => {
  const res = await page.goto("/refunds");
  expect(res?.status()).toBe(200);
  for (const heading of [
    "Your legal rights come first",
    "The 10 day trial, which is why this page is rarely needed",
    "Monthly plans",
    "Yearly plans",
    "Top ups",
    "A renewal you did not mean to pay",
    "When the fault is ours",
    "Schools, trusts and other organisations",
    "What we do not refund",
    "How to ask, and how long it takes",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  // The numbers on the page are the engine's: 14 days, 30 days, the 3.99 first month.
  await expect(page.getByText("Full refund within 14 days").first()).toBeVisible();
  await expect(page.getByText("Full refund within 30 days").first()).toBeVisible();
  await expect(page.getByText("£3.99")).toBeVisible();
});

test("the contact address is the real mailbox, with the subject filled in", async ({ page }) => {
  await page.goto("/refunds");
  const mail = page.getByRole("link", { name: /info@jooma\.ai/ }).first();
  await expect(mail).toHaveAttribute("href", "mailto:info@jooma.ai?subject=Refund%20request");
  await expect(page.getByText("hello@jooma.ai")).toHaveCount(0);
});

test("the contents rail jumps to a clause, and the clause is in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/refunds");
  await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "5 · Top ups" }).click();
  await expect(page).toHaveURL(/#c5$/);
  await expect(page.locator("#c5")).toBeInViewport();
});

test("on a phone the rail is hidden and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/refunds");
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the terms link to the policy and no longer say refunds are discretionary", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByText("at our discretion")).toHaveCount(0);
  const link = page.locator("#payment").getByRole("link", { name: "Refunds and cancellations" });
  await expect(link).toHaveAttribute("href", "/refunds");
  await link.click();
  await expect(page).toHaveURL(/\/refunds$/);
});

test("it is in the sitemap", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("/refunds");
});

test("screenshots", async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, "Only for the before and after pictures");
  const dir = "docs/screenshots/2026-11-26-refund-policy";
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/refunds");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/after-refunds-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/refunds");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/after-refunds-mobile.png` });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/terms#payment");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/after-terms-clause7.png` });
});
