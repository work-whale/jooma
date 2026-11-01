import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import {
  admin,
  asTeacher,
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * The 3 day trial with no card, and the trial-ending email.
 *
 * Needs supabase/migrations/20261101000000_no_card_trial.sql applied.
 *
 * Edge cases this is written against. Starting: twice, in a race, and for each
 * kind of account that must not get one. Writing: a teacher nulling their own
 * marker. Ending: the gate and the pages agree the moment it passes, before the
 * cron has tidied the row. Paying: every card buyable mid-trial, told it charges
 * today, and no trial sent to Stripe. The email: only the last 24 hours, one send,
 * and never to someone who opted out or subscribed.
 */

const trialRow = async (id: string) => {
  const { data, error } = await admin
    .from("profiles")
    .select("plan, subscription_status, stripe_subscription_id, stripe_customer_id, current_period_end, free_trial_started_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
};

test.describe("starting the trial", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Noor");
  });
  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("gives Standard for three days, with nothing in Stripe", async ({ page }) => {
    await signIn(page, teacher);
    const res = await page.request.post("/api/trial/start");
    expect(res.status()).toBe(200);

    const row = await trialRow(teacher.id);
    expect(row.plan).toBe("standard");
    expect(row.subscription_status).toBe("trialing");
    expect(row.stripe_subscription_id).toBeNull();
    expect(row.stripe_customer_id).toBeNull();
    expect(row.free_trial_started_at).not.toBeNull();

    const hours = (new Date(row.current_period_end!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71);
    expect(hours).toBeLessThanOrEqual(72);

    // It really generates: anything but a 402 got past the plan gate.
    const tool = await page.request.post("/api/homework-generator", { data: {} });
    expect(tool.status()).not.toBe(402);
  });

  test("once only, however it is asked", async ({ page }) => {
    await signIn(page, teacher);
    const [a, b] = await Promise.all([
      page.request.post("/api/trial/start"),
      page.request.post("/api/trial/start"),
    ]);
    const statuses = [a.status(), b.status()].sort();
    expect(statuses).toEqual([200, 409]);

    const first = (await trialRow(teacher.id)).current_period_end;
    expect((await page.request.post("/api/trial/start")).status()).toBe(409);
    expect((await trialRow(teacher.id)).current_period_end).toBe(first);
  });

  test("refused signed out", async ({ request }) => {
    expect((await request.post("/api/trial/start")).status()).toBe(401);
  });

  test("refused for a comp, who keeps the plan they have", async ({ page }) => {
    await setPlan(teacher, "pro", "comped");
    await signIn(page, teacher);
    expect((await page.request.post("/api/trial/start")).status()).toBe(409);
    expect((await trialRow(teacher.id)).plan).toBe("pro");
  });

  test("refused for a former subscriber", async ({ page }) => {
    await admin
      .from("profiles")
      .update({ plan: "free", stripe_customer_id: "cus_old", stripe_subscription_id: "sub_old", subscription_status: "canceled" })
      .eq("id", teacher.id);
    await signIn(page, teacher);
    expect((await page.request.post("/api/trial/start")).status()).toBe(409);
    expect((await trialRow(teacher.id)).plan).toBe("free");
  });

  test("refused for a trial already used and tidied away", async ({ page }) => {
    await admin
      .from("profiles")
      .update({ plan: "free", subscription_status: null, current_period_end: null, free_trial_started_at: "2026-01-01T00:00:00Z" })
      .eq("id", teacher.id);
    await signIn(page, teacher);
    expect((await page.request.post("/api/trial/start")).status()).toBe(409);
  });

  test("a teacher cannot reset their own marker", async ({ page }) => {
    await signIn(page, teacher);
    await page.request.post("/api/trial/start");

    const client = await asTeacher(teacher);
    const { error } = await client
      .from("profiles")
      .update({ free_trial_started_at: null })
      .eq("id", teacher.id);
    expect(error?.message).toMatch(/not authorized/);
    expect((await trialRow(teacher.id)).free_trial_started_at).not.toBeNull();
  });
});

test.describe("while it runs and when it ends", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Imani");
  });
  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  const endTrial = (when: Date) =>
    admin
      .from("profiles")
      .update({
        plan: "standard",
        subscription_status: "trialing",
        current_period_end: when.toISOString(),
        free_trial_started_at: new Date(when.getTime() - 3 * 86_400_000).toISOString(),
      })
      .eq("id", teacher.id);

  test("/welcome says it has started and asks for no plan", async ({ page }) => {
    await endTrial(new Date(Date.now() + 3 * 86_400_000));
    await signIn(page, teacher);
    await page.goto("/welcome");
    await expect(page.getByText(/your 3 day free trial has started/i)).toBeVisible();
    await expect(page.getByText(/no card needed/i)).toBeVisible();
    await expect(page.getByRole("radio", { name: "Monthly" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to my tools" })).toBeVisible();
  });

  test("the banner counts down, and the billing page says no card", async ({ page }) => {
    await endTrial(new Date(Date.now() + 2 * 86_400_000));
    await signIn(page, teacher);
    await page.goto("/dashboard");
    await expect(page.getByTestId("trial-banner")).toContainText("2 days left");
    await page.goto("/profile?section=subscription");
    await expect(page.getByTestId("review-trial")).toContainText(/no card is needed/i);
    await expect(page.getByTestId("review-trial")).not.toContainText(/ambassador/i);
  });

  test("the moment it passes, the gate refuses and the pages agree, before any cron", async ({ page }) => {
    await endTrial(new Date(Date.now() - 60_000));
    await signIn(page, teacher);

    const res = await page.request.post("/api/homework-generator", { data: {} });
    expect(res.status()).toBe(402);
    expect((await res.json()).code).toBe("plan_required");

    await page.goto("/dashboard");
    await expect(page.getByTestId("trial-banner")).toContainText(/your free trial has ended/i);
    await expect(page.getByTestId("locked-card")).toBeVisible();
    // The row was never touched: it is the read that has to be right.
    expect((await trialRow(teacher.id)).plan).toBe("standard");
  });
});

test.describe("paying during the trial", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Tomas");
    await admin
      .from("profiles")
      .update({
        plan: "standard",
        subscription_status: "trialing",
        current_period_end: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        free_trial_started_at: new Date().toISOString(),
      })
      .eq("id", teacher.id);
  });
  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("every card can be bought, Standard included, and says it charges today", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/pricing");

    await expect(page.getByTestId("charge-notice")).toContainText(
      "Your subscription starts today and you will be charged now. This ends your free trial.",
    );
    await expect(page.getByText("You will be charged £4.99 today, then £4.99 a month")).toBeVisible();
    await expect(page.getByText("You will be charged £7.99 today, then £7.99 a month")).toBeVisible();
    // Regression: Standard used to show as "Your plan", so it could not be bought.
    await expect(page.getByRole("button", { name: "Your plan" })).toHaveCount(0);
  });

  const session = async (page: import("@playwright/test").Page, interval: "month" | "year") => {
    const res = await page.request.post("/api/stripe/checkout", { data: { plan: "standard", interval } });
    expect(res.ok()).toBe(true);
    const { url } = (await res.json()) as { url: string };
    const id = url.match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0];
    expect(id).toBeTruthy();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    return stripe.checkout.sessions.retrieve(id!, { expand: ["subscription"] });
  };

  test("checkout sends no trial, takes a card, and says so", async ({ page }) => {
    await signIn(page, teacher);
    const s = await session(page, "month");
    expect(s.payment_method_collection).toBe("always");
    expect(s.custom_text?.submit?.message).toMatch(/you will be charged now/i);
    // Nothing owed later: the total is what is due today.
    expect(s.amount_total).toBe(499);
  });

  test("the code box is offered on monthly but not on yearly", async ({ page }) => {
    await signIn(page, teacher);
    expect((await session(page, "month")).allow_promotion_codes).toBe(true);
    expect((await session(page, "year")).allow_promotion_codes).toBeFalsy();
  });
});

test.describe("the trial ending email", () => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET is not set in .env.local");

  const people: TestTeacher[] = [];
  let automationWasLive = false;

  test.beforeAll(async () => {
    const { data } = await admin.from("email_automations").select("live").eq("key", "trial_ending").single();
    automationWasLive = Boolean(data?.live);
    await admin.from("email_automations").update({ live: true }).eq("key", "trial_ending");
  });
  test.afterAll(async () => {
    await admin.from("email_automations").update({ live: automationWasLive }).eq("key", "trial_ending");
  });
  test.afterEach(async () => {
    for (const p of people.splice(0)) {
      await admin.from("email_opt_outs").delete().eq("email", p.email.toLowerCase());
      await deleteTeacher(p);
    }
  });

  const inTrial = async (name: string, hoursLeft: number) => {
    const t = await createTeacher(name);
    people.push(t);
    await admin
      .from("profiles")
      .update({
        plan: "standard",
        subscription_status: "trialing",
        current_period_end: new Date(Date.now() + hoursLeft * 3_600_000).toISOString(),
        free_trial_started_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .eq("id", t.id);
    return t;
  };

  const runCron = async (request: import("@playwright/test").APIRequestContext) => {
    const res = await request.get("/api/cron/email-campaigns", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
  };

  const recipients = async (email: string) => {
    const { data, error } = await admin
      .from("email_campaign_recipients")
      .select("id, email_campaigns!inner(automation, audience_label)")
      .eq("email", email.toLowerCase())
      .eq("email_campaigns.automation", "trial_ending");
    if (error) throw error;
    return data ?? [];
  };

  test("one send, only in the last 24 hours", async ({ request }) => {
    const due = await inTrial("Due", 10);
    const early = await inTrial("Early", 30);
    const over = await inTrial("Over", -2);

    await runCron(request);
    expect(await recipients(due.email), "in the window").toHaveLength(1);
    expect(await recipients(early.email), "not yet").toHaveLength(0);
    expect(await recipients(over.email), "already over").toHaveLength(0);

    await runCron(request);
    expect(await recipients(due.email), "still one after a second run").toHaveLength(1);
  });

  test("not to someone who opted out, who subscribed, or on a review trial", async ({ request }) => {
    const optedOut = await inTrial("Optout", 10);
    await admin.from("email_opt_outs").insert({ email: optedOut.email.toLowerCase(), source: "admin" });

    const paid = await inTrial("Paid", 10);
    await admin.from("profiles").update({ stripe_subscription_id: `sub_e2e_${paid.id.slice(0, 8)}` }).eq("id", paid.id);

    const review = await inTrial("Review", 10);
    await admin.from("profiles").update({ free_trial_started_at: null }).eq("id", review.id);

    await runCron(request);
    expect(await recipients(optedOut.email)).toHaveLength(0);
    expect(await recipients(paid.email)).toHaveLength(0);
    expect(await recipients(review.email)).toHaveLength(0);
  });

  test("the cron does not send it while it is switched off", async ({ request }) => {
    await admin.from("email_automations").update({ live: false }).eq("key", "trial_ending");
    try {
      const due = await inTrial("Off", 10);
      await runCron(request);
      expect(await recipients(due.email)).toHaveLength(0);
    } finally {
      await admin.from("email_automations").update({ live: true }).eq("key", "trial_ending");
    }
  });
});
