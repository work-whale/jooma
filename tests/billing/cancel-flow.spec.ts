import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The cancel flow, end to end, against REAL sandbox subscriptions.
 *
 * Each test makes a throwaway teacher with a Stripe customer and subscription,
 * signs in, and clicks through /profile/cancel the way a teacher would,
 * starting from "Cancel subscription" on the billing Overview. Then it checks
 * three places: what the page says, what Stripe holds (the coupon, and an
 * invoice preview to the penny), and what cancellation_events recorded.
 *
 * What this pins, from docs/JOOMA VERSION 3/12 jooma cancel flow notes.md:
 *   - every offer is applied automatically, at the price the page quoted;
 *   - the way out is on every screen from step 2, one tap, never disabled;
 *   - the offer is refused when it must be (12 months, stacking, a pending
 *     change, a forged coupon, a double click);
 *   - a retention coupon cannot be typed anywhere.
 *
 * Pure decisions are pinned in tests/unit/cancel-flow.spec.ts. Access rules on
 * the table are scripts/verify-cancel-flow.mjs.
 *
 * Needs STRIPE_SECRET_KEY (a test key) and the STRIPE_PRICE_* variables.
 */

const key = process.env.STRIPE_SECRET_KEY ?? "";
const stripe = new Stripe(key);
const PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY!;
const PRO_YEARLY = process.env.STRIPE_PRICE_PRO_YEARLY!;

const MONTHLY_COUPON = "jooma-retention-monthly-50-3m";
const YEARLY_COUPON = "jooma-retention-yearly-12_5-once";

test.describe("The cancel flow", () => {
  test.skip(!key.startsWith("sk_test_"), "Creates subscriptions in Stripe; only against a test key.");

  let teacher: TestTeacher;
  const customers: string[] = [];
  const coupons: string[] = [];

  test.beforeEach(async () => {
    teacher = await createTeacher("Casey");
  });

  test.afterEach(async () => {
    for (const id of customers.splice(0)) await stripe.customers.del(id).catch(() => {});
    for (const id of coupons.splice(0)) await stripe.coupons.del(id).catch(() => {});
    await deleteTeacher(teacher);
  });

  async function subscribe(opts: {
    price?: string;
    trialDays?: number;
    coupon?: string;
  } = {}): Promise<Stripe.Subscription> {
    const customer = await stripe.customers.create({
      email: teacher.email,
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" },
    });
    customers.push(customer.id);

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: opts.price ?? PRO_MONTHLY }],
      metadata: { userId: teacher.id },
      ...(opts.trialDays ? { trial_period_days: opts.trialDays } : {}),
      ...(opts.coupon ? { discounts: [{ coupon: opts.coupon }] } : {}),
    });

    const { error } = await admin
      .from("profiles")
      .update({
        plan: "pro",
        subscription_status: sub.status,
        stripe_customer_id: customer.id,
        stripe_subscription_id: sub.id,
        cancel_at_period_end: false,
        current_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
      })
      .eq("id", teacher.id);
    if (error) throw error;
    return sub;
  }

  async function events() {
    const { data, error } = await admin
      .from("cancellation_events")
      .select("reason, outcome, coupon_id, interval, detail")
      .eq("user_id", teacher.id)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  }

  async function couponsOn(subId: string): Promise<string[]> {
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ["discounts"] });
    return (sub.discounts ?? []).map((d) => {
      const c = (d as Stripe.Discount).source?.coupon;
      return typeof c === "string" ? c : (c?.id ?? "");
    });
  }

  /** From the billing Overview, the way a teacher gets there. */
  async function openFlow(page: Page) {
    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");
    await page.getByRole("link", { name: "Cancel subscription" }).click();
    // Generous: the first visit on a cold dev server compiles the route.
    await expect(page.getByTestId("cancel-flow")).toHaveAttribute("data-step", "reason", {
      timeout: 30_000,
    });
  }

  async function pickReason(page: Page, label: string) {
    await page.getByLabel(label).check();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  const step = (page: Page) => page.getByTestId("cancel-flow");
  const forward = (page: Page) => page.getByTestId("continue-cancelling");

  // ── Saves: every offer is honoured automatically ──────────────────────────

  test("monthly: half price for 3 months, applied at the price quoted", async ({ page }) => {
    const sub = await subscribe();
    await openFlow(page);
    await pickReason(page, "It costs too much");

    await expect(step(page)).toHaveAttribute("data-step", "offer");
    const offer = page.getByTestId("retention-offer");
    await expect(offer).toContainText("£3.99 a month for your next 3 months, instead of £7.99");
    await expect(offer).toContainText("You save £12.00");
    await offer.getByRole("button", { name: "Accept the offer" }).click();

    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();
    expect(await couponsOn(sub.id)).toEqual([MONTHLY_COUPON]);
    const preview = await stripe.invoices.createPreview({ subscription: sub.id });
    expect(preview.amount_due).toBe(399);

    expect(await events()).toEqual([
      { reason: "cost", outcome: "discount", coupon_id: MONTHLY_COUPON, interval: "month", detail: null },
    ]);

    await page.goto("/profile?section=subscription");
    await expect(page.getByTestId("retention-discount")).toContainText(/Half price until \d+ \w+ \d{4}/);
  });

  test("yearly: 12.5% off the next renewal, never the 3 month coupon", async ({ page }) => {
    const sub = await subscribe({ price: PRO_YEARLY });
    await openFlow(page);
    await pickReason(page, "It costs too much");

    const offer = page.getByTestId("retention-offer");
    await expect(offer).toContainText(/£9\.00 off your renewal on \d+ \w+ \d{4}, so £62\.99 instead of £71\.99/);
    await offer.getByRole("button", { name: "Accept the offer" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();

    expect(await couponsOn(sub.id)).toEqual([YEARLY_COUPON]);
    const preview = await stripe.invoices.createPreview({ subscription: sub.id });
    expect(preview.amount_due).toBe(6299);

    await page.goto("/profile?section=subscription");
    await expect(page.getByTestId("retention-discount")).toHaveText(
      "12.5% off your next renewal, from the offer you accepted.",
    );
  });

  test("on the free trial: the first charge is half price, the trial keeps its date", async ({ page }) => {
    const sub = await subscribe({ trialDays: 3 });
    await openFlow(page);
    await pickReason(page, "It costs too much");
    await page.getByTestId("retention-offer").getByRole("button", { name: "Accept the offer" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();

    const after = await stripe.subscriptions.retrieve(sub.id);
    expect(after.status).toBe("trialing");
    expect(after.trial_end).toBe(sub.trial_end);
    const preview = await stripe.invoices.createPreview({ subscription: sub.id });
    expect(preview.amount_due).toBe(399);
  });

  test("not using it: its own heading, and a move to Standard waits for renewal", async ({ page }) => {
    const sub = await subscribe();
    await openFlow(page);
    await pickReason(page, "I'm not using it enough");

    await expect(page.getByRole("heading", { name: "Quiet spell? Keep it for less." })).toBeVisible();
    await page.getByRole("button", { name: "Move to Standard" }).click();
    await page.getByRole("button", { name: "Switch to Standard Teacher" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();
    await expect(page.getByText(/You move to Standard when your current period ends/)).toBeVisible();

    const after = await stripe.subscriptions.retrieve(sub.id);
    expect(after.schedule).toBeTruthy();
    expect(await events()).toEqual([
      expect.objectContaining({ reason: "unused", outcome: "downgrade" }),
    ]);
  });

  test("pay yearly instead: switched through the existing route, and recorded", async ({ page }) => {
    const sub = await subscribe();
    await openFlow(page);
    await pickReason(page, "It costs too much");

    await page.getByRole("button", { name: "Pay yearly instead" }).click();
    await page.getByRole("button", { name: /^Pay £\d+\.\d{2} and switch$/ }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();

    const after = await stripe.subscriptions.retrieve(sub.id);
    expect(after.items.data[0].price.id).toBe(PRO_YEARLY);
    expect(await events()).toEqual([
      expect.objectContaining({ reason: "cost", outcome: "switch_annual" }),
    ]);
  });

  test("keeping the plan at 'what you lose' and at the confirm changes nothing in Stripe", async ({ page }) => {
    const sub = await subscribe();
    await openFlow(page);
    await pickReason(page, "It costs too much");
    await forward(page).click();
    await expect(step(page)).toHaveAttribute("data-step", "lose");
    await page.getByRole("button", { name: "Keep my plan" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();

    await page.goto("/profile/cancel?step=confirm&reason=cost");
    await page.getByRole("button", { name: "Keep my plan" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();

    const after = await stripe.subscriptions.retrieve(sub.id, { expand: ["discounts"] });
    expect(after.cancel_at_period_end).toBe(false);
    expect(after.discounts ?? []).toHaveLength(0);
    expect((await events()).map((e) => e.outcome)).toEqual(["kept_inventory", "kept_confirm"]);
  });

  // ── Cancels: the way out is never blocked ─────────────────────────────────

  const paths: [string, string, "offer" | "fix" | "schools"][] = [
    ["cost", "It costs too much", "offer"],
    ["unused", "I'm not using it enough", "offer"],
    ["missing", "Something I need is missing", "fix"],
    ["school", "My school is buying a licence", "schools"],
  ];
  for (const [reason, label, screen] of paths) {
    test(`cancelling for "${reason}" takes four taps after the reason`, async ({ page }) => {
      const sub = await subscribe();
      await openFlow(page);
      await page.getByLabel(label).check();

      let taps = 0;
      await page.getByRole("button", { name: "Continue" }).click();
      taps++;
      await expect(step(page)).toHaveAttribute("data-step", screen);
      await expect(forward(page)).toBeVisible();
      await expect(forward(page)).toBeEnabled();
      await forward(page).click();
      taps++;

      await expect(step(page)).toHaveAttribute("data-step", "lose");
      await expect(forward(page)).toBeEnabled();
      await forward(page).click();
      taps++;

      await expect(step(page)).toHaveAttribute("data-step", "confirm");
      await page.getByTestId("confirm-cancel").click();
      taps++;

      await expect(page.getByRole("heading", { name: "Your plan is cancelled." })).toBeVisible();
      expect(taps).toBe(4);

      const after = await stripe.subscriptions.retrieve(sub.id);
      expect(after.cancel_at_period_end).toBe(true);
      expect(after.status).toBe("active");
      const { data: profile } = await admin
        .from("profiles")
        .select("cancel_at_period_end")
        .eq("id", teacher.id)
        .single();
      expect(profile?.cancel_at_period_end).toBe(true);
      expect(await events()).toEqual([expect.objectContaining({ reason, outcome: "cancelled" })]);

      await page.goto("/profile?section=subscription");
      await expect(page.getByText(/Access ends on/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Renew subscription" })).toBeVisible();
    });
  }

  test("Continue stays disabled until a reason is picked", async ({ page }) => {
    await subscribe();
    await openFlow(page);
    const go = page.getByRole("button", { name: "Continue" });
    await expect(go).toBeDisabled();
    await page.getByLabel("Something went wrong").check();
    await expect(go).toBeEnabled();
  });

  test("something missing: the message reaches support, and cancelling still works", async ({ page }) => {
    await subscribe();
    await openFlow(page);
    await pickReason(page, "Something I need is missing");

    const message = `Please add a seating plan tool ${Date.now()}`;
    await page.getByLabel("Your message").fill(message);
    await page.getByRole("button", { name: "Send to the team" }).click();
    await expect(page.getByTestId("support-sent")).toContainText("Thank you. We have it");

    const { data: enquiries } = await admin
      .from("enquiries")
      .select("kind, user_id, message")
      .eq("user_id", teacher.id);
    expect(enquiries).toHaveLength(1);
    expect(enquiries![0].kind).toBe("contact");
    expect(enquiries![0].message).toContain(message);
    expect(await events()).toEqual([
      expect.objectContaining({ reason: "missing", outcome: "support_message", detail: message }),
    ]);

    await expect(forward(page)).toBeEnabled();
    await forward(page).click();
    await expect(step(page)).toHaveAttribute("data-step", "lose");

    await admin.from("enquiries").delete().eq("user_id", teacher.id);
  });

  test("school licence: the schools team gets the teacher, email already filled in", async ({ page }) => {
    await subscribe();
    await openFlow(page);
    await pickReason(page, "My school is buying a licence");
    await page.getByRole("button", { name: "Introduce me to the schools team" }).click();

    await expect(page).toHaveURL(/\/contact\?type=school/);
    await expect(page.locator("#school-email")).toHaveValue(teacher.email);
    expect(await events()).toEqual([expect.objectContaining({ reason: "school", outcome: "schools_contact" })]);
  });

  test("after cancelling, the held offer turns the plan back on at the discount", async ({ page }) => {
    const sub = await subscribe();
    await openFlow(page);
    await pickReason(page, "It costs too much");
    await forward(page).click();
    await forward(page).click();
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByRole("heading", { name: "Your plan is cancelled." })).toBeVisible();

    const held = page.getByTestId("held-offer");
    await expect(held).toContainText(/open until \d+ \w+ \d{4}/);
    await held.getByRole("button", { name: "Turn my plan back on with the offer" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();

    const after = await stripe.subscriptions.retrieve(sub.id);
    expect(after.cancel_at_period_end).toBe(false);
    expect(await couponsOn(sub.id)).toEqual([MONTHLY_COUPON]);
    expect((await events()).map((e) => e.outcome)).toEqual(["cancelled", "discount"]);

    await page.goto("/profile?section=subscription");
    await expect(page.getByText(/Access ends on/)).toHaveCount(0);
  });

  /** Reason, both forward links, confirm: the shortest way out. */
  async function cancelThroughFlow(page: Page) {
    await pickReason(page, "It costs too much");
    await forward(page).click();
    await forward(page).click();
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByRole("heading", { name: "Your plan is cancelled." })).toBeVisible();
  }

  test("renewing from the cancelled screen keeps the plan, at full price", async ({ page }) => {
    const sub = await subscribe();
    await openFlow(page);
    await cancelThroughFlow(page);

    await page.getByRole("button", { name: "Renew subscription" }).click();
    // The URL still says step=done; a plan that is not ending reads as saved.
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your plan is cancelled." })).toHaveCount(0);

    const after = await stripe.subscriptions.retrieve(sub.id);
    expect(after.cancel_at_period_end).toBe(false);
    expect(after.cancel_at).toBeNull();
    // A plain renew is not the offer: no coupon, full price next time.
    expect(await couponsOn(sub.id)).toEqual([]);
    expect((await stripe.invoices.createPreview({ subscription: sub.id })).amount_due).toBe(799);
    const { data: profile } = await admin
      .from("profiles")
      .select("cancel_at_period_end")
      .eq("id", teacher.id)
      .single();
    expect(profile?.cancel_at_period_end).toBe(false);
    expect((await events()).map((e) => e.outcome)).toEqual(["cancelled"]);

    // A reload is still not the cancelled screen, and billing agrees.
    await page.reload();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();
    await page.goto("/profile?section=subscription");
    await expect(page.getByText(/Access ends on/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Cancel subscription" })).toBeVisible();
  });

  test("after renewing, they can cancel again in the same period", async ({ page }) => {
    // Regression: the cancel claim was keyed on the period alone, so a second
    // cancellation after a renew was refused as "already cancelled".
    const sub = await subscribe();
    await openFlow(page);
    await cancelThroughFlow(page);
    await page.getByRole("button", { name: "Renew subscription" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();

    await page.goto("/profile?section=subscription");
    await page.getByRole("link", { name: "Cancel subscription" }).click();
    await expect(step(page)).toHaveAttribute("data-step", "reason", { timeout: 30_000 });
    await cancelThroughFlow(page);

    expect((await stripe.subscriptions.retrieve(sub.id)).cancel_at_period_end).toBe(true);
    expect((await events()).map((e) => e.outcome)).toEqual(["cancelled", "cancelled"]);
  });

  test("once the 14 days are up, the cancelled screen offers a plain renew and no discount", async ({
    page,
  }) => {
    const sub = await subscribe();
    await openFlow(page);
    await cancelThroughFlow(page);
    await expect(page.getByTestId("held-offer")).toBeVisible();

    // Move the cancellation back past the window.
    await admin
      .from("cancellation_events")
      .update({ created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("user_id", teacher.id)
      .eq("outcome", "cancelled");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your plan is cancelled." })).toBeVisible();
    await expect(page.getByTestId("held-offer")).toHaveCount(0);

    // The expired offer cannot be taken by posting for it either.
    const res = await page.request.post("/api/billing/cancel-flow/offer", { data: { reason: "cost" } });
    expect((await res.json()).why).toBe("offer_expired");

    await page.getByRole("button", { name: "Renew subscription" }).click();
    await expect(page.getByRole("heading", { name: "That's sorted." })).toBeVisible();
    expect((await stripe.subscriptions.retrieve(sub.id)).cancel_at_period_end).toBe(false);
    expect(await couponsOn(sub.id)).toEqual([]);
  });

  test("two cancel clicks at once cancel once, and write one row", async ({ page }) => {
    const sub = await subscribe();
    await signIn(page, teacher);
    const [a, b] = await Promise.all([
      page.request.post("/api/billing/cancel-flow/cancel", { data: { reason: "cost" } }),
      page.request.post("/api/billing/cancel-flow/cancel", { data: { reason: "cost" } }),
    ]);
    expect([a.ok(), b.ok()].filter(Boolean)).toHaveLength(1);
    expect((await stripe.subscriptions.retrieve(sub.id)).cancel_at_period_end).toBe(true);
    expect((await events()).filter((e) => e.outcome === "cancelled")).toHaveLength(1);
  });

  // ── Refusals: what the flow must not do ───────────────────────────────────

  test("a second discount within 12 months is neither shown nor applied", async ({ page }) => {
    const sub = await subscribe();
    await admin.from("cancellation_events").insert({
      user_id: teacher.id,
      reason: "cost",
      outcome: "discount",
      plan: "pro",
      interval: "month",
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await openFlow(page);
    await pickReason(page, "It costs too much");
    await expect(step(page)).toHaveAttribute("data-step", "offer");
    await expect(page.getByTestId("retention-offer")).toHaveCount(0);
    await expect(forward(page)).toBeEnabled();

    const res = await page.request.post("/api/billing/cancel-flow/offer", { data: { reason: "cost" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).why).toBe("recently_used");
    expect(await couponsOn(sub.id)).toEqual([]);
  });

  test("an unspent ambassador coupon is not stacked on, and is left alone", async ({ page }) => {
    const ambassador = await stripe.coupons.create({ percent_off: 50, duration: "once" });
    coupons.push(ambassador.id);
    const sub = await subscribe({ trialDays: 3, coupon: ambassador.id });

    await openFlow(page);
    await pickReason(page, "It costs too much");
    await expect(page.getByTestId("retention-offer")).toHaveCount(0);

    const res = await page.request.post("/api/billing/cancel-flow/offer", { data: { reason: "cost" } });
    expect((await res.json()).why).toBe("has_discount");
    expect(await couponsOn(sub.id)).toEqual([ambassador.id]);
  });

  test("a pending downgrade means no offer, since its next phase would drop it", async ({ page }) => {
    await subscribe();
    await signIn(page, teacher);
    const down = await page.request.post("/api/stripe/downgrade", { data: { plan: "standard" } });
    expect(down.ok()).toBe(true);

    await page.goto("/profile/cancel?step=offer&reason=cost");
    await expect(step(page)).toHaveAttribute("data-step", "offer");
    await expect(page.getByTestId("retention-offer")).toHaveCount(0);
    // And no second plan change offered on top of the first.
    await expect(page.getByRole("button", { name: "Move to Standard" })).toHaveCount(0);
  });

  test("a double click applies one coupon and writes one row", async ({ page }) => {
    const sub = await subscribe();
    await signIn(page, teacher);
    const [a, b] = await Promise.all([
      page.request.post("/api/billing/cancel-flow/offer", { data: { reason: "cost" } }),
      page.request.post("/api/billing/cancel-flow/offer", { data: { reason: "cost" } }),
    ]);
    // One did the work. The other either saw the claim (ok, already) or, if
    // it read Stripe late, the discount itself. Neither applies a second.
    expect([a.ok(), b.ok()]).toContain(true);
    expect(await couponsOn(sub.id)).toEqual([MONTHLY_COUPON]);
    expect((await events()).filter((e) => e.outcome === "discount")).toHaveLength(1);
  });

  test("a coupon named in the request is ignored", async ({ page }) => {
    const other = await stripe.coupons.create({ percent_off: 100, duration: "forever" });
    coupons.push(other.id);
    const sub = await subscribe();
    await signIn(page, teacher);

    const res = await page.request.post("/api/billing/cancel-flow/offer", {
      data: { reason: "cost", coupon: other.id, couponId: other.id, discounts: [{ coupon: other.id }] },
    });
    expect(res.ok()).toBe(true);
    expect(await couponsOn(sub.id)).toEqual([MONTHLY_COUPON]);
  });

  test("cancelling twice is refused, and leaves one row", async ({ page }) => {
    await subscribe();
    await signIn(page, teacher);
    const first = await page.request.post("/api/billing/cancel-flow/cancel", { data: { reason: "cost" } });
    expect(first.ok()).toBe(true);
    const second = await page.request.post("/api/billing/cancel-flow/cancel", { data: { reason: "cost" } });
    expect(second.status()).toBe(400);
    expect((await events()).filter((e) => e.outcome === "cancelled")).toHaveLength(1);
  });

  test("the routes refuse a reason they do not know, and outcomes the browser may not report", async ({ page }) => {
    await subscribe();
    await signIn(page, teacher);
    const noReason = await page.request.post("/api/billing/cancel-flow/cancel", { data: { reason: "bored" } });
    expect(noReason.status()).toBe(400);
    for (const outcome of ["discount", "cancelled", "made-up"]) {
      const res = await page.request.post("/api/billing/cancel-flow/outcome", {
        data: { reason: "cost", outcome },
      });
      expect(res.status()).toBe(400);
    }
    expect(await events()).toEqual([]);
  });

  test("signed out, every route says 401", async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: "http://localhost:3000" });
    for (const path of ["offer", "cancel", "outcome"]) {
      const res = await anon.post(`/api/billing/cancel-flow/${path}`, { data: { reason: "cost" } });
      expect(res.status()).toBe(401);
    }
    await anon.dispose();
  });

  test("with no subscription, the flow sends them back to billing", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/profile/cancel");
    await expect(page).toHaveURL(/\/profile\?section=subscription/);
  });

  test("a typed URL cannot skip the reason", async ({ page }) => {
    await subscribe();
    await signIn(page, teacher);
    await page.goto("/profile/cancel?step=lose");
    await expect(step(page)).toHaveAttribute("data-step", "reason");
    await page.goto("/profile/cancel?step=done&reason=cost");
    // Not cancelled, so never the cancelled screen.
    await expect(page.getByRole("heading", { name: "Your plan is cancelled." })).toHaveCount(0);
  });

  test("the back button goes back a screen", async ({ page }) => {
    await subscribe();
    await openFlow(page);
    await pickReason(page, "It costs too much");
    await forward(page).click();
    await expect(step(page)).toHaveAttribute("data-step", "lose");
    await page.goBack();
    await expect(step(page)).toHaveAttribute("data-step", "offer");
  });

  test("a retention coupon cannot be typed in anywhere", async ({ page, browser }) => {
    test.setTimeout(120_000);
    // Make sure the coupon exists, then prove nothing points a typeable code at it.
    await subscribe();
    await signIn(page, teacher);
    await page.request.post("/api/billing/cancel-flow/offer", { data: { reason: "cost" } });
    for (const id of [MONTHLY_COUPON, YEARLY_COUPON]) {
      const codes = await stripe.promotionCodes.list({ coupon: id, limit: 1 });
      expect(codes.data).toHaveLength(0);
    }

    // Checkout takes no coupon from the browser either. A teacher with no plan,
    // in their own browser context so the first sign-in does not carry over.
    const fresh = await createTeacher("Drew");
    const context = await browser.newContext();
    try {
      const other = await context.newPage();
      await signIn(other, fresh);
      const res = await other.request.post("/api/stripe/checkout", {
        data: { plan: "pro", interval: "month", coupon: MONTHLY_COUPON, discounts: [{ coupon: MONTHLY_COUPON }] },
      });
      expect(res.ok()).toBe(true);
      const { url } = await res.json();
      const sessionId = url.match(/cs_test_[A-Za-z0-9]+/)![0];
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      expect(session.discounts ?? []).toHaveLength(0);
      expect(session.total_details?.amount_discount ?? 0).toBe(0);
    } finally {
      await context.close();
      await deleteTeacher(fresh);
    }
  });

  test("at phone width the whole flow fits, with its buttons in reach", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await subscribe();
    await openFlow(page);
    const noSideScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

    expect(await noSideScroll()).toBe(true);
    await pickReason(page, "It costs too much");
    expect(await noSideScroll()).toBe(true);
    await forward(page).click();
    expect(await noSideScroll()).toBe(true);
    // Reachable by scrolling down, not pushed off the side.
    await forward(page).scrollIntoViewIfNeeded();
    await expect(forward(page)).toBeInViewport();
    await forward(page).click();
    expect(await noSideScroll()).toBe(true);
    await page.getByTestId("confirm-cancel").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("confirm-cancel")).toBeInViewport();
  });
});
