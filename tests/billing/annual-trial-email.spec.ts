import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { admin, createTeacher, deleteTeacher, type TestTeacher } from "../support/users";

/*
 * The annual trial email, sent by the Stripe webhook when Checkout completes a
 * free trial on a yearly price.
 *
 * Each test makes a real sandbox subscription, then posts a signed
 * checkout.session.completed for it to the LOCAL webhook (the sandbox's own
 * webhook goes to deployed staging). profiles.annual_trial_email_sent_at is the
 * observable: it is stamped before the send and released if the send fails, so
 * a stamp that stays means the email went.
 *
 * What this pins:
 *   1. A yearly trial is emailed, once, however many times Stripe delivers the
 *      event.
 *   2. A monthly trial is not.
 *
 * Needs supabase/migrations/20261026000000_annual_trial_email.sql on staging,
 * and STRIPE_WEBHOOK_SECRET, SENDGRID_* set locally. Test teachers are
 * @jooma.test addresses, so nothing reaches a real inbox.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY!;
const PRO_YEARLY = process.env.STRIPE_PRICE_PRO_YEARLY!;

test.describe("Annual trial email", () => {
  let teacher: TestTeacher;
  const customers: string[] = [];

  test.beforeEach(async () => {
    teacher = await createTeacher("Wren");
  });

  test.afterEach(async () => {
    for (const id of customers.splice(0)) await stripe.customers.del(id).catch(() => {});
    await deleteTeacher(teacher);
  });

  /** A trialing sandbox subscription for the test teacher, as Checkout makes. */
  async function trialOn(price: string): Promise<Stripe.Subscription> {
    const customer = await stripe.customers.create({
      email: teacher.email,
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" },
    });
    customers.push(customer.id);
    return stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price }],
      trial_period_days: 3,
      metadata: { userId: teacher.id },
    });
  }

  /** Deliver checkout.session.completed for it to the local webhook, signed. */
  async function deliverCheckout(
    request: import("@playwright/test").APIRequestContext,
    sub: Stripe.Subscription,
  ) {
    const payload = JSON.stringify({
      id: `evt_test_${sub.id}`,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${sub.id}`,
          object: "checkout.session",
          mode: "subscription",
          subscription: sub.id,
          client_reference_id: teacher.id,
          metadata: {},
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const res = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": signature, "content-type": "application/json" },
    });
    expect(res.status()).toBe(200);
  }

  async function sentAt(): Promise<string | null> {
    const { data, error } = await admin
      .from("profiles")
      .select("annual_trial_email_sent_at")
      .eq("id", teacher.id)
      .single();
    if (error) throw error;
    return data.annual_trial_email_sent_at;
  }

  test("a yearly trial is emailed once, however often Stripe delivers it", async ({ request }) => {
    const sub = await trialOn(PRO_YEARLY);

    await deliverCheckout(request, sub);
    const first = await sentAt();
    expect(first).not.toBeNull();

    // A redelivery finds the claim taken and sends nothing: the stamp is the
    // first delivery's, unchanged.
    await deliverCheckout(request, sub);
    expect(await sentAt()).toBe(first);
  });

  test("a monthly trial is not emailed", async ({ request }) => {
    const sub = await trialOn(PRO_MONTHLY);
    await deliverCheckout(request, sub);
    expect(await sentAt()).toBeNull();
  });
});
