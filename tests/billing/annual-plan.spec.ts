import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import { createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Yearly billing.
 *
 * What this pins:
 *   1. Every plan chooser opens on Yearly, showing the real yearly price with
 *      twelve monthly payments struck through beside it and what it works out
 *      at each month. Monthly is one click away and unchanged.
 *   2. Checkout charges the yearly Stripe price when asked for it, and the
 *      monthly one when not. A caller that sends no interval (every caller
 *      written before yearly existed) must keep buying monthly.
 *
 * Reads the Stripe sandbox, so STRIPE_SECRET_KEY and the
 * STRIPE_PRICE_<PLAN>_MONTHLY / _YEARLY variables must be set.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/** The price a Checkout session will charge, read back from Stripe. */
async function checkoutPrice(page: Page, data: Record<string, unknown>): Promise<string> {
  const res = await page.request.post("/api/stripe/checkout", { data });
  expect(res.ok()).toBe(true);
  const { url } = await res.json();
  const sessionId = url.match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0];
  expect(sessionId).toBeTruthy();
  const items = await stripe.checkout.sessions.listLineItems(sessionId!);
  return items.data[0]?.price?.id ?? "";
}

test.describe("Yearly billing", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Rowan");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("the landing page opens on Yearly, with the monthly total struck through", async ({
    page,
  }) => {
    await page.goto("/#pricing");
    const pricing = page.locator("#pricing");

    await expect(pricing.getByRole("radio", { name: /Yearly/ })).toBeChecked();
    await expect(pricing.getByText("Save up to 25%")).toBeVisible();

    // Standard: the real price, the struck one, and the monthly equivalent.
    await expect(pricing.getByText("£47.99", { exact: true })).toBeVisible();
    await expect(pricing.locator("s", { hasText: "£59.88" })).toBeVisible();
    await expect(pricing.getByText("Just £4.00 a month, billed yearly")).toBeVisible();
    await expect(pricing.getByText("3 days free, then £47.99 a year")).toBeVisible();

    // Pro and Max, and the saving each one claims.
    await expect(pricing.locator("s", { hasText: "£95.88" })).toBeVisible();
    await expect(pricing.getByText("Just £6.00 a month, billed yearly")).toBeVisible();
    await expect(pricing.getByText("Save 25%", { exact: true })).toBeVisible();
    await expect(pricing.locator("s", { hasText: "£179.88" })).toBeVisible();
    await expect(pricing.getByText("Just £12.00 a month, billed yearly")).toBeVisible();

    // Monthly: the prices as they always were, and nothing struck through.
    await pricing.locator("label", { hasText: "Monthly" }).click();
    await expect(pricing.getByRole("radio", { name: "Monthly" })).toBeChecked();
    await expect(pricing.getByText("£4.99", { exact: true })).toBeVisible();
    await expect(pricing.getByText("3 days free, then £4.99 a month")).toBeVisible();
    await expect(pricing.locator("s")).toHaveCount(0);
  });

  test("/welcome opens on Yearly too", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/welcome");

    await expect(page.getByRole("radio", { name: /Yearly/ })).toBeChecked();
    await expect(page.getByText("£71.99", { exact: true })).toBeVisible();
    await expect(page.locator("s", { hasText: "£95.88" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(3);
  });

  test("the profile's plan cards open on Yearly for someone with no plan", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    await expect(page.getByRole("radio", { name: /Yearly/ })).toBeChecked();
    await expect(page.getByText("3 days free, then £143.99 a year")).toBeVisible();
  });

  test("checkout charges the yearly price when yearly is chosen", async ({ page }) => {
    await signIn(page, teacher);
    expect(await checkoutPrice(page, { plan: "pro", interval: "year" })).toBe(
      process.env.STRIPE_PRICE_PRO_YEARLY,
    );
    expect(await checkoutPrice(page, { plan: "standard", interval: "year" })).toBe(
      process.env.STRIPE_PRICE_STANDARD_YEARLY,
    );
  });

  test("checkout stays monthly when no interval, or a bad one, is sent", async ({ page }) => {
    await signIn(page, teacher);
    expect(await checkoutPrice(page, { plan: "max" })).toBe(process.env.STRIPE_PRICE_MAX_MONTHLY);
    expect(await checkoutPrice(page, { plan: "max", interval: "fortnight" })).toBe(
      process.env.STRIPE_PRICE_MAX_MONTHLY,
    );
    expect(await checkoutPrice(page, { plan: "standard", interval: "month" })).toBe(
      process.env.STRIPE_PRICE_STANDARD_MONTHLY,
    );
  });
});
