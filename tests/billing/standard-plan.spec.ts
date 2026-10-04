import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import {
  admin,
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Standard replaces Free, and every plan starts with a 3 day free trial.
 *
 * What this pins:
 *   1. The landing page sells Standard, Pro and Max, each with the trial, and
 *      no free plan.
 *   2. An account with no subscription cannot generate. The gate refuses it in
 *      the proxy with 402 plan_required, before any tool route runs, so the
 *      request body here is irrelevant and no model is ever called.
 *   3. Checkout sells Standard.
 *   4. /welcome makes choosing a plan the last step of signing up, except for
 *      an invited teacher an admin already put on one.
 *   5. A teacher mid-trial is told when it ends and that cancelling now costs
 *      nothing.
 *
 * Needs supabase/migrations/20261004000000_standard_plan.sql applied: until
 * then profiles_plan_check refuses plan = 'standard'.
 */

test.describe("Standard plan and the free trial", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Sasha");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("the landing page sells three plans, each with the trial", async ({ page }) => {
    await page.goto("/#pricing");
    const pricing = page.locator("#pricing");

    await expect(pricing.getByText("Standard", { exact: true })).toBeVisible();
    // Exact, because the trial line under the button quotes the price too.
    await expect(pricing.getByText("£4.99", { exact: true })).toBeVisible();
    // Not preceded by a digit or comma, or it also matches Max's "2,500 credits
    // a month". Not `exact` either: the list item's text includes the ✓ tick.
    await expect(pricing.getByText(/(?<![\d,])500 credits a month/)).toBeVisible();
    await expect(pricing.getByText("3 days free, then £4.99 a month")).toBeVisible();
    await expect(pricing.getByRole("button", { name: "Start free trial" })).toHaveCount(3);

    // No free plan anywhere on the table.
    await expect(pricing.getByText("£0", { exact: true })).toHaveCount(0);
    await expect(pricing.getByText(/no card needed/i)).toHaveCount(0);
  });

  test("an account with no plan cannot generate", async ({ page }) => {
    await signIn(page, teacher);

    const res = await page.request.post("/api/homework-generator", { data: {} });
    expect(res.status()).toBe(402);
    expect(res.headers()["x-upgrade-required"]).toBe("1");

    const body = await res.json();
    expect(body.code).toBe("plan_required");
    expect(body.action).toBe("upgrade");
    expect(body.error).toMatch(/3 day free trial/);
  });

  test("refinements are refused too, not only generations", async ({ page }) => {
    // /api/modify is not a generation, and the "free" spend ceiling is null, so
    // without the plan gate it would be unmetered for an account paying nothing.
    await signIn(page, teacher);
    const res = await page.request.post("/api/modify", { data: {} });
    expect(res.status()).toBe(402);
    expect((await res.json()).code).toBe("plan_required");
  });

  test("a Standard teacher gets past the plan gate", async ({ page }) => {
    await setPlan(teacher, "standard", "trialing");
    await signIn(page, teacher);

    // An empty body fails the route's own validation, which is the point: it
    // got past the proxy. Anything but a 402 means the plan gate let it through.
    const res = await page.request.post("/api/homework-generator", { data: {} });
    expect(res.status()).not.toBe(402);
  });

  test("checkout sells Standard, and returns through /checkout/complete", async ({ page }) => {
    await signIn(page, teacher);

    const res = await page.request.post("/api/stripe/checkout", {
      data: { plan: "standard", from: "welcome" },
    });
    expect(res.ok()).toBe(true);
    const { url } = await res.json();
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    // Read the session back from the Stripe sandbox. Every successful return
    // must land on /checkout/complete, which is where the browser StartTrial
    // fires, with Stripe's own session placeholder left for it to fill in.
    const sessionId = url.match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0];
    expect(sessionId).toBeTruthy();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.retrieve(sessionId!);
    expect(session.success_url).toContain(
      "/checkout/complete?session_id={CHECKOUT_SESSION_ID}&from=welcome",
    );
    expect(session.client_reference_id).toBe(teacher.id);
    expect(session.payment_method_collection).toBe("always");
  });

  test("/checkout/complete fires no StartTrial for a session that started no trial", async ({
    page,
  }) => {
    // Record every pixel call. Installed before the page loads, so the Meta
    // snippet finds window.fbq already set and leaves it alone.
    await page.addInitScript(() => {
      const calls: unknown[][] = [];
      (window as unknown as { __fbqCalls: unknown[][] }).__fbqCalls = calls;
      (window as unknown as { fbq: (...args: unknown[]) => void }).fbq = (...args) => {
        calls.push(args);
      };
    });

    await signIn(page, teacher);

    // An id Stripe does not know. Nothing started, so nothing may be reported,
    // and the teacher is still sent on to where they were going.
    await page.goto("/checkout/complete?session_id=cs_test_not_a_real_session&from=welcome");
    await expect(page).toHaveURL(/\/tools\?checkout=success/);

    const calls = await page.evaluate(
      () => (window as unknown as { __fbqCalls: unknown[][] }).__fbqCalls,
    );
    expect(calls.filter((c) => c[1] === "StartTrial")).toHaveLength(0);
  });

  test("/checkout/complete sends anyone else on to billing", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/checkout/complete?session_id=cs_test_not_a_real_session");
    await expect(page).toHaveURL(/section=subscription/);
    await expect(page).toHaveURL(/checkout=success/);
  });

  test("/welcome asks a new teacher to choose a plan", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/welcome");

    await expect(page.getByText(/choose a plan to start your free trial/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(3);
    await expect(page.getByText(/won.t be charged until your 3 day/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Look around first" })).toBeVisible();
  });

  test("/welcome does not sell a plan to someone who already has one", async ({ page }) => {
    // An admin-invited teacher comped onto Standard before finishing signup.
    await setPlan(teacher, "standard", "comped");
    await signIn(page, teacher);
    await page.goto("/welcome");

    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to my tools" })).toBeVisible();
  });

  test("a teacher mid-trial sees when it ends, and that cancelling costs nothing", async ({
    page,
  }) => {
    await setPlan(teacher, "standard", "trialing");
    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    await expect(page.getByText(/your free trial ends on/i).first()).toBeVisible();
    await expect(page.getByText(/then £4\.99 a month/i).first()).toBeVisible();

    // Already subscribed, so the cards offer swaps and never a second trial.
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(0);

    await page.getByRole("button", { name: /^cancel subscription$/i }).first().click();
    await expect(page.getByText(/won.t be charged anything/i).first()).toBeVisible();
  });

  test("a lapsed subscriber can come back, but without a second trial", async ({ page }) => {
    // The webhook writes 'free' when a subscription closes, and never clears the
    // subscription id, which is what marks the trial as used.
    await admin
      .from("profiles")
      .update({
        plan: "free",
        subscription_status: "canceled",
        stripe_customer_id: `cus_e2e_${teacher.id.slice(0, 8)}`,
        stripe_subscription_id: `sub_e2e_${teacher.id.slice(0, 8)}`,
      })
      .eq("id", teacher.id);

    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    await expect(page.getByRole("button", { name: "Choose Standard" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(0);
  });
});
