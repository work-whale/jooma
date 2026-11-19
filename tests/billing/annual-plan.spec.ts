import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Yearly billing, Jooma 4.5.
 *
 * What this pins:
 *   1. The pricing page and the plan picker open on Monthly, the price a
 *      teacher is charged. Yearly is one click away and shows what it works out
 *      at each month with the yearly total underneath. Switching back restores
 *      the monthly prices.
 *   2. Checkout charges the yearly Stripe price when asked for it, and the
 *      monthly one when not. A caller that sends no interval, or a bad one,
 *      must keep buying monthly.
 *
 * Prices are compared with plan_config (what checkout actually reads first),
 * falling back to the env var, so a price change in the database does not
 * break this test. Reads the Stripe sandbox, so STRIPE_SECRET_KEY must be set.
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

/** The price checkout should use: plan_config first, then the env var. */
async function configuredPrice(plan: "standard" | "pro" | "max", interval: "month" | "year") {
  const { data } = await admin
    .from("plan_config")
    .select("stripe_price_monthly, stripe_price_yearly")
    .eq("plan_id", plan)
    .single();
  const fromDb = interval === "month" ? data?.stripe_price_monthly : data?.stripe_price_yearly;
  const env = `STRIPE_PRICE_${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "YEARLY"}`;
  return (fromDb as string | null) ?? process.env[env];
}

/** A 4.5 Free teacher with no subscription: the picker's choosing mode. */
async function onFree(t: TestTeacher) {
  const { error } = await admin
    .from("profiles")
    .update({ plan: "free", subscription_status: null, stripe_subscription_id: null, current_period_end: null })
    .eq("id", t.id);
  if (error) throw error;
  const start = await admin.rpc("resources_start", { p_uid: t.id, p_plan: "free" });
  if (start.error) throw start.error;
}

test.describe("Yearly billing", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Rowan");
    await onFree(teacher);
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("the pricing page opens on Monthly; Yearly shows the per-month price and the yearly total", async ({
    page,
  }) => {
    await page.goto("/#pricing");
    const pricing = page.locator("#pricing");
    const card = (id: string) => page.getByTestId(`pricing-${id}`);

    await expect(pricing.getByRole("radio", { name: "Monthly" })).toBeChecked();
    await expect(pricing.getByRole("radio", { name: /Yearly/ })).not.toBeChecked();
    await expect(pricing.getByText("Save up to 25%")).toBeVisible();
    await expect(card("standard")).toContainText("£4.99");
    await expect(card("pro")).toContainText("£7.99");
    await expect(card("max")).toContainText("£13.99");
    await expect(pricing.getByText(/billed yearly/)).toHaveCount(0);

    await pricing.locator("label", { hasText: "Yearly" }).click();
    await expect(pricing.getByRole("radio", { name: /Yearly/ })).toBeChecked();
    await expect(card("standard")).toContainText("£47.99 billed yearly");
    await expect(card("pro")).toContainText("£71.99 billed yearly");
    await expect(card("max")).toContainText("£143.99 billed yearly");
    // Free has no yearly price to show.
    await expect(card("free")).toContainText("£0");

    await pricing.locator("label", { hasText: "Monthly" }).click();
    await expect(pricing.getByRole("radio", { name: "Monthly" })).toBeChecked();
    await expect(card("max")).toContainText("£13.99");
    await expect(pricing.getByText(/billed yearly/)).toHaveCount(0);
  });

  test("before JavaScript runs, Monthly is the option painted checked", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto("/#pricing");
      const pricing = page.locator("#pricing");
      await expect(pricing.getByRole("radio", { name: "Monthly" })).toBeChecked();
      await expect(pricing.getByRole("radio", { name: /Yearly/ })).not.toBeChecked();
      await expect(page.getByTestId("pricing-max")).toContainText("£13.99");
    } finally {
      await context.close();
    }
  });

  test("the picker opens on Monthly and sends the interval that is showing", async ({ page }) => {
    await signIn(page, teacher);
    const sent: { plan?: string; interval?: string }[] = [];
    await page.route("**/api/stripe/checkout", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ json: { url: "/pricing?checkout=cancelled" } });
    });

    await page.goto("/pricing");
    await expect(page.getByRole("radio", { name: "Monthly" })).toBeChecked();
    await page.getByRole("button", { name: "Continue with Pro" }).click();
    await expect.poll(() => sent.length).toBe(1);
    // Strictly "month": a missing interval would also bill monthly, but would
    // mean the picker stopped saying what it was choosing.
    expect(sent[0]).toEqual({ plan: "pro", interval: "month" });
    // The page follows the checkout URL itself; let that land first, or the
    // goto below races it and is aborted (ERR_ABORTED).
    await page.waitForURL(/checkout=cancelled/);

    await page.goto("/pricing");
    await page.locator("label", { hasText: "Yearly" }).click();
    await page.getByRole("button", { name: "Continue with Pro" }).click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1]).toEqual({ plan: "pro", interval: "year" });
  });

  test("checkout charges the yearly price when yearly is chosen", async ({ page }) => {
    await signIn(page, teacher);
    expect(await checkoutPrice(page, { plan: "pro", interval: "year" })).toBe(await configuredPrice("pro", "year"));
    expect(await checkoutPrice(page, { plan: "standard", interval: "year" })).toBe(
      await configuredPrice("standard", "year"),
    );
  });

  test("checkout stays monthly when no interval, or a bad one, is sent", async ({ page }) => {
    await signIn(page, teacher);
    const maxMonthly = await configuredPrice("max", "month");
    expect(maxMonthly).toBeTruthy();
    expect(await checkoutPrice(page, { plan: "max" })).toBe(maxMonthly);
    expect(await checkoutPrice(page, { plan: "max", interval: "fortnight" })).toBe(maxMonthly);
    expect(await checkoutPrice(page, { plan: "standard", interval: "month" })).toBe(
      await configuredPrice("standard", "month"),
    );
  });
});
