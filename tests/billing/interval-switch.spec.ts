import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Switching a live subscription between monthly and yearly, against REAL
 * sandbox subscriptions.
 *
 * Each test makes a Stripe customer and subscription, points a throwaway
 * teacher's profile at them, and deletes the customer afterwards (which cancels
 * the subscription with it).
 *
 * What this pins:
 *   1. Monthly to yearly charges today exactly the figure the panel quoted, and
 *      leaves the subscription active on the yearly price.
 *   2. A declined card changes nothing: still monthly, still active, and the
 *      unpaid invoice voided so it cannot switch them later.
 *   3. During the trial the price swaps with nothing charged, the trial keeps
 *      its end date, and a waiting first-month coupon is dropped.
 *   4. Yearly to monthly waits for renewal on a schedule, says so, and can be
 *      undone.
 *   5. Cancelling subscriptions, and a second change while one waits, are
 *      refused.
 *   6. The profile's plan cards carry the toggle for subscribers too. They
 *      open on the interval paid now; the other interval offers the switch,
 *      with a plan change if wanted: dearer and yearly happens now, cheaper
 *      waits for renewal.
 *
 * NOTE: the sandbox's webhook posts to the DEPLOYED staging app, which writes
 * the same staging database. Until staging runs this branch, it reads a yearly
 * price as "no subscription" and resets the test teacher mid-test, so the UI
 * checks after a switch to yearly only pass once this code is deployed there.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY!;
const PRO_YEARLY = process.env.STRIPE_PRICE_PRO_YEARLY!;
const STANDARD_MONTHLY = process.env.STRIPE_PRICE_STANDARD_MONTHLY!;
const MAX_MONTHLY = process.env.STRIPE_PRICE_MAX_MONTHLY!;

test.describe("Switching between monthly and yearly", () => {
  let teacher: TestTeacher;
  const customers: string[] = [];
  const coupons: string[] = [];

  test.beforeEach(async () => {
    teacher = await createTeacher("Morgan");
  });

  test.afterEach(async () => {
    for (const id of customers.splice(0)) await stripe.customers.del(id).catch(() => {});
    for (const id of coupons.splice(0)) await stripe.coupons.del(id).catch(() => {});
    await deleteTeacher(teacher);
  });

  /** A sandbox subscription to Pro, linked to the test teacher's profile. */
  async function subscribe(opts: {
    price: string;
    plan?: "standard" | "pro" | "max";
    trialDays?: number;
    coupon?: string;
  }): Promise<Stripe.Subscription> {
    const customer = await stripe.customers.create({
      email: teacher.email,
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" },
    });
    customers.push(customer.id);

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: opts.price }],
      metadata: { userId: teacher.id },
      ...(opts.trialDays ? { trial_period_days: opts.trialDays } : {}),
      ...(opts.coupon ? { discounts: [{ coupon: opts.coupon }] } : {}),
    });

    const periodEnd = sub.items.data[0].current_period_end;
    const { error } = await admin
      .from("profiles")
      .update({
        plan: opts.plan ?? "pro",
        subscription_status: sub.status,
        stripe_customer_id: customer.id,
        stripe_subscription_id: sub.id,
        cancel_at_period_end: false,
        current_period_end: new Date(periodEnd * 1000).toISOString(),
      })
      .eq("id", teacher.id);
    if (error) throw error;
    return sub;
  }

  const priceOf = (sub: Stripe.Subscription) => sub.items.data[0].price.id;

  test("monthly to yearly charges today what the panel quoted", async ({ page }) => {
    const sub = await subscribe({ price: PRO_MONTHLY });
    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    await page.getByRole("button", { name: "Switch to yearly and save £23.89" }).click();

    // The figure is Stripe's own preview: £71.99 less the unused month.
    const pay = page.getByRole("button", { name: /^Pay £\d+\.\d{2} and switch$/ });
    await expect(pay).toBeVisible();
    const quoted = Number((await pay.textContent())!.match(/£(\d+\.\d{2})/)![1]);
    expect(quoted).toBeGreaterThan(60);
    expect(quoted).toBeLessThan(71.99);
    await expect(page.getByText(/then £71\.99 every year from/)).toBeVisible();

    await pay.click();
    await expect(page.getByText(/Renews yearly on/)).toBeVisible();

    const after = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
    expect(priceOf(after)).toBe(PRO_YEARLY);
    expect(after.status).toBe("active");
    const invoice = after.latest_invoice as Stripe.Invoice;
    expect(invoice.status).toBe("paid");
    expect(invoice.amount_paid).toBe(Math.round(quoted * 100));
  });

  test("a declined card changes nothing", async ({ page }) => {
    const sub = await subscribe({ price: PRO_MONTHLY });
    // The first month paid on a good card; the card on file now fails.
    const failing = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
      customer: sub.customer as string,
    });
    await stripe.customers.update(sub.customer as string, {
      invoice_settings: { default_payment_method: failing.id },
    });

    await signIn(page, teacher);
    const res = await page.request.post("/api/stripe/switch-interval", {
      data: { interval: "year" },
    });
    expect(res.status()).toBe(402);
    expect((await res.json()).error).toMatch(/declined/i);

    const after = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
    expect(priceOf(after)).toBe(PRO_MONTHLY);
    expect(after.status).toBe("active");
    // Voided, so Stripe never retries it and switches them after the fact.
    expect((after.latest_invoice as Stripe.Invoice).status).toBe("void");
  });

  test("during the trial nothing is charged and the trial keeps its date", async ({ page }) => {
    const coupon = await stripe.coupons.create({ percent_off: 50, duration: "once" });
    coupons.push(coupon.id);
    const sub = await subscribe({ price: PRO_MONTHLY, trialDays: 3, coupon: coupon.id });

    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");
    await page.getByRole("button", { name: "Switch to yearly and save £23.89" }).click();

    await expect(page.getByText(/Nothing to pay now/)).toBeVisible();
    await expect(page.getByText(/you.ll pay £71\.99 a year/)).toBeVisible();
    // The first-month code would otherwise discount the whole first year.
    await expect(page.getByText(/discount applies to monthly billing/)).toBeVisible();

    await page.getByRole("button", { name: "Confirm and switch" }).click();
    await expect(page.getByText(/Then £71\.99 a year/)).toBeVisible();

    const after = await stripe.subscriptions.retrieve(sub.id);
    expect(priceOf(after)).toBe(PRO_YEARLY);
    expect(after.status).toBe("trialing");
    expect(after.trial_end).toBe(sub.trial_end);
    expect(after.discounts ?? []).toHaveLength(0);
  });

  test("yearly to monthly waits for renewal, and can be undone", async ({ page }) => {
    const sub = await subscribe({ price: PRO_YEARLY });
    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    await page.getByRole("button", { name: "Switch to monthly billing" }).click();
    await expect(page.getByText(/You keep yearly billing until/)).toBeVisible();
    await expect(page.getByText(/then pay £7\.99 a month/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm and switch" }).click();

    await expect(page.getByText(/Switches to monthly billing on/)).toBeVisible();

    // Still yearly today; the monthly price waits on phase two of a schedule.
    const scheduled = await stripe.subscriptions.retrieve(sub.id, { expand: ["schedule"] });
    expect(priceOf(scheduled)).toBe(PRO_YEARLY);
    const schedule = scheduled.schedule as Stripe.SubscriptionSchedule;
    const phaseTwo = schedule.phases[1].items[0].price;
    expect(typeof phaseTwo === "string" ? phaseTwo : phaseTwo.id).toBe(PRO_MONTHLY);

    // A second change while this one waits is refused, not stacked.
    const again = await page.request.post("/api/stripe/switch-interval", {
      data: { interval: "month" },
    });
    expect(again.status()).toBe(400);

    await page.getByRole("button", { name: "Keep yearly billing" }).click();
    await expect(page.getByText(/Switches to monthly billing on/)).toHaveCount(0);
    expect((await stripe.subscriptions.retrieve(sub.id)).schedule).toBeNull();
  });

  test("a cancelling subscription is refused", async ({ page }) => {
    const sub = await subscribe({ price: PRO_MONTHLY });
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    await admin.from("profiles").update({ cancel_at_period_end: true }).eq("id", teacher.id);

    await signIn(page, teacher);
    const res = await page.request.post("/api/stripe/switch-interval", {
      data: { interval: "year" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/set to end/);
    expect(priceOf(await stripe.subscriptions.retrieve(sub.id))).toBe(PRO_MONTHLY);
  });

  test("a subscriber's cards open on what they pay, and the toggle offers the other interval", async ({
    page,
  }) => {
    await subscribe({ price: PRO_MONTHLY });
    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    await expect(page.getByRole("radio", { name: "Monthly" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Your plan" })).toBeVisible();

    await page.locator("label", { hasText: "Yearly" }).first().click();

    // Nothing is theirs at the other interval: their own plan offers the
    // switch, the others offer a plan change with it.
    await expect(page.getByRole("button", { name: "Your plan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Switch to yearly", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to Max" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to Standard" })).toBeVisible();
    await expect(page.locator("s", { hasText: "£95.88" })).toBeVisible();

    await page.getByRole("button", { name: "Switch to yearly", exact: true }).click();
    await expect(page.getByText("Switch to yearly billing?")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay £\d+\.\d{2} and switch$/ })).toBeVisible();
  });

  test("monthly Standard to yearly Pro from the cards is charged now", async ({ page }) => {
    const sub = await subscribe({ price: STANDARD_MONTHLY, plan: "standard" });
    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    await page.locator("label", { hasText: "Yearly" }).first().click();
    await page.getByRole("button", { name: "Switch to Pro" }).click();

    await expect(page.getByText("Switch to Pro, billed yearly?")).toBeVisible();
    await expect(page.getByText(/credits go up to 1,000 straight away/)).toBeVisible();
    const pay = page.getByRole("button", { name: /^Pay £\d+\.\d{2} and switch$/ });
    await expect(pay).toBeVisible();
    // £71.99 less the unused part of a £4.99 month.
    const quoted = Number((await pay.textContent())!.match(/£(\d+\.\d{2})/)![1]);
    expect(quoted).toBeGreaterThan(66);
    expect(quoted).toBeLessThan(71.99);

    await pay.click();
    await expect(page.getByText("Switch to Pro, billed yearly?")).toHaveCount(0);

    const after = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
    expect(priceOf(after)).toBe(PRO_YEARLY);
    expect(after.status).toBe("active");
    expect((after.latest_invoice as Stripe.Invoice).amount_paid).toBe(Math.round(quoted * 100));
  });

  test("monthly Max to yearly Pro waits for renewal, like any move down", async ({ page }) => {
    const sub = await subscribe({ price: MAX_MONTHLY, plan: "max" });
    await signIn(page, teacher);

    const preview = await page.request.get("/api/stripe/switch-interval?interval=year&plan=pro");
    expect((await preview.json()).kind).toBe("at_renewal");

    const res = await page.request.post("/api/stripe/switch-interval", {
      data: { interval: "year", plan: "pro" },
    });
    expect(res.ok()).toBe(true);

    // Still Max monthly today; Pro yearly waits on phase two.
    const scheduled = await stripe.subscriptions.retrieve(sub.id, { expand: ["schedule"] });
    expect(priceOf(scheduled)).toBe(MAX_MONTHLY);
    const phaseTwo = (scheduled.schedule as Stripe.SubscriptionSchedule).phases[1].items[0].price;
    expect(typeof phaseTwo === "string" ? phaseTwo : phaseTwo.id).toBe(PRO_YEARLY);

    // The card says so, interval included.
    await page.goto("/profile?section=subscription");
    await expect(page.getByText(/Starts on .*, billed yearly\./).first()).toBeVisible();
  });

  test("a plan named in the body must be one that can be bought", async ({ page }) => {
    await subscribe({ price: PRO_MONTHLY });
    await signIn(page, teacher);
    const res = await page.request.post("/api/stripe/switch-interval", {
      data: { interval: "year", plan: "school" },
    });
    expect(res.status()).toBe(400);
  });
});
