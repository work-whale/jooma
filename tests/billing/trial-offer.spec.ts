import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import {
  admin,
  createAdmin,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * The end-of-trial offer, through the interface and the checkout it changes.
 *
 * Needs supabase/migrations/20261109000000_trial_end_offer.sql applied.
 *
 * Edge cases this is written against:
 *   - the trial: countdown in the sidebar (desktop) and a chip (phone), no
 *     strip across the top
 *   - the popup: shows when the trial has ended, not again the same day, again
 *     the next day; says "gone" once after the offer runs out; never on /pricing;
 *     never for someone who paid before
 *   - checkout: 50% off monthly only; refused on yearly, after the window, for
 *     a past customer, for someone who never trialled; the amount Stripe will
 *     charge is £2.49, not £2.50
 *   - the two emails: right people, once, never to opted-out or paying teachers
 *   - the Stats tab: an admin sees it
 *
 * Dates are set on the row directly. The trial end is the live
 * current_period_end while trialing, else 3 days after free_trial_started_at
 * (trial_end_of in the migration), and the offer is open 7 days after that,
 * but never closes sooner than 7 days after the migration ran on this database
 * (trial_offer_launch). For a week after it is applied, then, no real row can
 * have a closed offer, so the "gone" popup is driven by rewriting the RPC's
 * dates in the browser (goneOffer), and the offer-ending email test skips.
 */

const DAY = 86_400_000;
const POPUP_DAY_KEY = "jooma.trialEnded.lastShownDay";
const POPUP_GONE_KEY = "jooma.trialOffer.goneShown";

const people: TestTeacher[] = [];
test.afterEach(async () => {
  await admin.from("invoices").delete().like("reference", "E2E-OFFER-%");
  for (const p of people.splice(0)) {
    await admin.from("email_opt_outs").delete().eq("email", p.email.toLowerCase());
    await deleteTeacher(p);
  }
});

async function teacher(name: string): Promise<TestTeacher> {
  const t = await createTeacher(name);
  people.push(t);
  return t;
}

/** A running no-card trial ending `msLeft` from now. */
async function inTrial(t: TestTeacher, msLeft: number) {
  const end = Date.now() + msLeft;
  await admin
    .from("profiles")
    .update({
      plan: "standard",
      subscription_status: "trialing",
      current_period_end: new Date(end).toISOString(),
      free_trial_started_at: new Date(end - 3 * DAY).toISOString(),
    })
    .eq("id", t.id);
}

/** A trial that ended `agoMs` ago and has been tidied by the nightly cron. */
async function trialEnded(t: TestTeacher, agoMs: number) {
  await admin
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: null,
      current_period_end: null,
      free_trial_started_at: new Date(Date.now() - agoMs - 3 * DAY).toISOString(),
    })
    .eq("id", t.id);
}

/** A paid card invoice: "has paid" to my_account_access(). */
async function paidBefore(t: TestTeacher) {
  const { error } = await admin.from("invoices").insert({
    reference: `E2E-OFFER-${t.id.slice(0, 8)}`,
    user_id: t.id,
    type: "card",
    status: "paid",
    amount_gbp: 4.99,
    paid_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not seed an invoice: ${error.message}`);
}

/** Replaces the offer dates the page reads with an offer that ran out. */
async function goneOffer(page: Page) {
  await page.route("**/rest/v1/rpc/my_account_access*", async (route) => {
    const res = await route.fetch();
    const rows = (await res.json()) as Record<string, unknown>[];
    const past = new Date(Date.now() - DAY).toISOString();
    for (const r of rows) {
      r.trial_ends_at = new Date(Date.now() - 8 * DAY).toISOString();
      r.trial_offer_ends_at = past;
    }
    await route.fulfill({ response: res, json: rows });
  });
}

const modal = (page: Page) => page.getByTestId("trial-ended-modal");

test.describe("during the trial", () => {
  test("the countdown is in the sidebar, not across the top", async ({ page }) => {
    const t = await teacher("Ada");
    await inTrial(t, 2 * DAY - 60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, t);
    await page.goto("/dashboard");

    const card = page.getByTestId("sidebar-plan");
    await expect(card).toContainText("Free trial");
    await expect(page.getByTestId("sidebar-plan-countdown")).toContainText("2 days left of your free trial");
    await expect(card.getByRole("progressbar")).toBeVisible();
    await expect(page.getByTestId("trial-banner")).toHaveCount(0);
    await expect(page.getByTestId("trial-chip")).toBeHidden();
    await expect(modal(page)).toHaveCount(0);
  });

  test("on a phone, a chip in the top bar carries it", async ({ page }) => {
    const t = await teacher("Ada");
    await inTrial(t, 5 * 3_600_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, t);
    await page.goto("/dashboard");
    const chip = page.getByTestId("trial-chip");
    await expect(chip).toBeVisible();
    // Under a day: hours, not "1d".
    await expect(chip).toHaveText(/^[45]h \d+m left$/);
    await expect(chip).toHaveAttribute("href", "/pricing");
  });
});

test.describe("when the trial has ended", () => {
  test("a popup with the 50% offer and a live countdown, once a day", async ({ page }) => {
    const t = await teacher("Bea");
    await trialEnded(t, 3_600_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, t);
    await page.goto("/dashboard");

    await expect(modal(page)).toBeVisible();
    await expect(modal(page)).toHaveAttribute("data-variant", "offer");
    await expect(modal(page)).toContainText("Your free trial has ended");
    await expect(modal(page)).toContainText("first month is half price");
    // Live: it ticks.
    const countdown = page.getByTestId("offer-countdown");
    const first = await countdown.textContent();
    await page.waitForTimeout(1500);
    expect(await countdown.textContent()).not.toBe(first);
    await expect(modal(page).getByRole("link", { name: "Get 50% off" })).toHaveAttribute("href", "/pricing");

    // The sidebar says the same.
    await expect(page.getByTestId("sidebar-plan")).toContainText("Claim 50% off");

    // Escape closes it, and it does not come back today.
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(modal(page)).toHaveCount(0);

    // Tomorrow it does.
    await page.evaluate((k) => localStorage.setItem(k, "2000-01-01"), POPUP_DAY_KEY);
    await page.reload();
    await expect(modal(page)).toBeVisible();
    await modal(page).getByRole("button", { name: "Continue with free tools" }).click();
    await expect(modal(page)).toHaveCount(0);
  });

  test("not on /pricing, which shows the offer above the plans instead", async ({ page }) => {
    const t = await teacher("Cy");
    await trialEnded(t, 3_600_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, t);
    await page.goto("/pricing");
    await expect(page.getByTestId("trial-offer-banner")).toBeVisible();
    await expect(page.getByTestId("trial-offer-banner")).toContainText("50% off your first month");
    await page.waitForTimeout(1500);
    await expect(modal(page)).toHaveCount(0);

    // Monthly cards: £2.49 first month for Standard, full price struck.
    await expect(page.getByText("You will be charged £2.49 today, then £4.99 a month")).toBeVisible();
    // Yearly: no discount, and the banner says the offer is monthly.
    // The radio itself is visually hidden; its label is what a teacher clicks.
    await page.locator('label[data-option="year"]').click();
    await expect(page.getByRole("radio", { name: /Yearly/ })).toBeChecked();
    await expect(page.getByTestId("trial-offer-banner")).toContainText("monthly plans");
    await expect(page.getByText(/£2\.49/)).toHaveCount(0);
  });

  test("once the offer has run out: one popup saying so, then never again", async ({ page }) => {
    const t = await teacher("Dee");
    await trialEnded(t, 10 * DAY);
    await goneOffer(page);
    await signIn(page, t);
    await page.goto("/dashboard");

    await expect(modal(page)).toHaveAttribute("data-variant", "gone");
    await expect(modal(page)).toContainText("Your 50% offer has ended");
    await page.keyboard.press("Escape");
    // Even on a new day.
    await page.evaluate((k) => localStorage.setItem(k, "2000-01-01"), POPUP_DAY_KEY);
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(modal(page)).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), POPUP_GONE_KEY)).toBe("1");
  });

  test("a past customer gets no popup and no offer", async ({ page }) => {
    const t = await teacher("Eve");
    await trialEnded(t, 3_600_000);
    await paidBefore(t);
    await signIn(page, t);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);
    await expect(modal(page)).toHaveCount(0);
    await expect(page.getByTestId("trial-banner")).toContainText("Your plan has ended");
  });
});

test.describe("checkout", () => {
  const session = async (page: Page, interval: "month" | "year") => {
    const res = await page.request.post("/api/stripe/checkout", { data: { plan: "standard", interval } });
    expect(res.ok()).toBe(true);
    const { url } = (await res.json()) as { url: string };
    const id = url.match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0];
    expect(id).toBeTruthy();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    return stripe.checkout.sessions.retrieve(id!, { expand: ["discounts"] });
  };

  test("monthly: 50% off the first payment, £2.49, automatically", async ({ page }) => {
    const t = await teacher("Fin");
    await trialEnded(t, 3_600_000);
    await signIn(page, t);
    const s = await session(page, "month");
    expect(s.amount_total).toBe(249);
    expect(JSON.stringify(s.discounts)).toContain("jooma-trial-end-50-once");
    expect(s.allow_promotion_codes).toBeFalsy();
  });

  test("yearly: full price, no discount", async ({ page }) => {
    const t = await teacher("Gus");
    await trialEnded(t, 3_600_000);
    await signIn(page, t);
    const s = await session(page, "year");
    expect(JSON.stringify(s.discounts ?? [])).not.toContain("jooma-trial-end-50-once");
    expect(s.amount_total).toBe(4799);
  });

  test("still in the trial: no discount yet", async ({ page }) => {
    const t = await teacher("Hal");
    await inTrial(t, DAY);
    await signIn(page, t);
    expect((await session(page, "month")).amount_total).toBe(499);
  });

  test("never trialled, or paid before: no discount", async ({ page }) => {
    const never = await teacher("Ivy");
    await signIn(page, never);
    expect((await session(page, "month")).amount_total).toBe(499);

    const paid = await teacher("Jon");
    await trialEnded(paid, 3_600_000);
    await paidBefore(paid);
    await page.context().clearCookies();
    await signIn(page, paid);
    expect((await session(page, "month")).amount_total).toBe(499);
  });
});

test.describe("the offer and an ambassador code", () => {
  // The ambassador must be credited whichever discount the teacher gets, so a
  // code is still asked for while the offer is open, and claiming one keeps the
  // referral row that pays commission. The teacher gets the bigger saving.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const made: { ambassadorId?: string; promoId?: string; couponId?: string } = {};
  const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

  test.afterEach(async () => {
    if (made.ambassadorId) await admin.from("ambassadors").delete().eq("id", made.ambassadorId);
    if (made.promoId) await stripe.promotionCodes.update(made.promoId, { active: false }).catch(() => {});
    if (made.couponId) await stripe.coupons.del(made.couponId).catch(() => {});
    made.ambassadorId = made.promoId = made.couponId = undefined;
  });

  /** An ambassador and a claimed code. `promotionCodeId` may be a real Stripe
   *  promotion code or a placeholder that Stripe will not recognise. */
  async function claimedCode(t: TestTeacher, promotionCodeId: string) {
    const k = tag();
    const { data: amb, error } = await admin
      .from("ambassadors")
      .insert({ full_name: `ZZ Offer ${k}`, email: `zz-offer-${k}@example.com` })
      .select()
      .single();
    if (error) throw error;
    made.ambassadorId = amb.id;
    const { data: codeRow, error: codeErr } = await admin
      .from("ambassador_codes")
      .insert({ ambassador_id: amb.id, promotion_code_id: promotionCodeId, code: `ZZOFFER${k}`.toUpperCase() })
      .select()
      .single();
    if (codeErr) throw codeErr;
    const { error: refErr } = await admin
      .from("ambassador_referrals")
      .insert({ user_id: t.id, ambassador_id: amb.id, code_id: codeRow.id });
    if (refErr) throw refErr;
    return codeRow.code as string;
  }

  const sessionFor = async (page: Page) => {
    const res = await page.request.post("/api/stripe/checkout", { data: { plan: "standard", interval: "month" } });
    expect(res.ok()).toBe(true);
    const { url } = (await res.json()) as { url: string };
    const id = url.match(/cs_(test|live)_[A-Za-z0-9]+/)![0];
    return stripe.checkout.sessions.retrieve(id, { expand: ["discounts"] });
  };

  test("/pricing still asks for a code while the offer is open", async ({ page }) => {
    const t = await teacher("Sol");
    await trialEnded(t, 3_600_000);
    await signIn(page, t);
    await page.goto("/pricing");
    await expect(page.getByTestId("trial-offer-banner")).toContainText("Got a code from an ambassador?");
    await expect(page.getByTestId("promo-code-input")).toBeVisible();
    await expect(page.locator("#ambassador-code")).toContainText("so they are credited");
  });

  test("a smaller code: the offer is used, and the ambassador is still credited", async ({ page }) => {
    const t = await teacher("Tia");
    await trialEnded(t, 3_600_000);
    // 20% once: smaller than the offer.
    const coupon = await stripe.coupons.create({ percent_off: 20, duration: "once", name: "ZZ e2e 20" });
    made.couponId = coupon.id;
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code: `ZZTWENTY${tag()}`.toUpperCase(),
    } as Stripe.PromotionCodeCreateParams);
    made.promoId = promo.id;
    await claimedCode(t, promo.id);

    await signIn(page, t);
    const s = await sessionFor(page);
    expect(s.amount_total).toBe(249);
    expect(JSON.stringify(s.discounts)).toContain("jooma-trial-end-50-once");
    // The referral that pays commission is untouched.
    const { data: ref } = await admin.from("ambassador_referrals").select("first_paid_at").eq("user_id", t.id).single();
    expect(ref?.first_paid_at).toBeNull();
  });

  test("a bigger code wins over the offer", async ({ page }) => {
    const t = await teacher("Uma");
    await trialEnded(t, 3_600_000);
    const coupon = await stripe.coupons.create({ percent_off: 100, duration: "once", name: "ZZ e2e 100" });
    made.couponId = coupon.id;
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code: `ZZFREE${tag()}`.toUpperCase(),
    } as Stripe.PromotionCodeCreateParams);
    made.promoId = promo.id;
    await claimedCode(t, promo.id);

    await signIn(page, t);
    const s = await sessionFor(page);
    expect(s.amount_total).toBe(0);
    expect(JSON.stringify(s.discounts)).not.toContain("jooma-trial-end-50-once");

    // And the cards on /pricing show the code's price, not half price.
    await page.goto("/pricing");
    await expect(page.getByText("You will be charged £0.00 today, then £4.99 a month")).toBeVisible();
  });
});

test.describe("the two offer emails", () => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET is not set in .env.local");

  const KEYS = ["trial_ended_offer", "trial_offer_ending"] as const;
  const wasLive: Record<string, boolean> = {};

  test.beforeAll(async () => {
    for (const key of KEYS) {
      const { data } = await admin.from("email_automations").select("live").eq("key", key).single();
      wasLive[key] = Boolean(data?.live);
      await admin.from("email_automations").update({ live: true }).eq("key", key);
    }
  });
  test.afterAll(async () => {
    for (const key of KEYS) {
      await admin.from("email_automations").update({ live: wasLive[key] }).eq("key", key);
    }
  });

  const runCron = async (request: import("@playwright/test").APIRequestContext) => {
    const res = await request.get("/api/cron/email-campaigns", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
  };

  const got = async (email: string, key: string) => {
    const { data, error } = await admin
      .from("email_campaign_recipients")
      .select("id, email_campaigns!inner(automation)")
      .eq("email", email.toLowerCase())
      .eq("email_campaigns.automation", key);
    if (error) throw error;
    return (data ?? []).length;
  };

  test("trial ended: once, to the right people only", async ({ request }) => {
    const ended = await teacher("Kai");
    await trialEnded(ended, 3_600_000);
    const running = await teacher("Lea");
    await inTrial(running, DAY);
    const optedOut = await teacher("Mo");
    await trialEnded(optedOut, 3_600_000);
    await admin.from("email_opt_outs").insert({ email: optedOut.email.toLowerCase(), source: "admin" });
    const subscribed = await teacher("Ned");
    await trialEnded(subscribed, 3_600_000);
    await admin.from("profiles").update({ stripe_subscription_id: `sub_e2e_${subscribed.id.slice(0, 8)}` }).eq("id", subscribed.id);

    await runCron(request);
    expect(await got(ended.email, "trial_ended_offer"), "ended").toBe(1);
    expect(await got(running.email, "trial_ended_offer"), "still trialling").toBe(0);
    expect(await got(optedOut.email, "trial_ended_offer"), "opted out").toBe(0);
    expect(await got(subscribed.email, "trial_ended_offer"), "subscribed").toBe(0);

    await runCron(request);
    expect(await got(ended.email, "trial_ended_offer"), "still once after a second run").toBe(1);
  });

  test("offer ending: only inside its last 36 hours", async ({ request }) => {
    // The offer closes 7 days after the trial ended, or 7 days after launch
    // if that is later. Launch is when the migration ran on this database.
    const { data: launchRow } = await admin.rpc("trial_offer_launch");
    const launch = new Date(launchRow as unknown as string).getTime();
    // A trial that ended 6 days 12 hours ago closes in 12 hours, unless launch
    // was less than 7 days ago, in which case every window is at least launch + 7d.
    test.skip(Date.now() - launch < 7 * DAY, "launch was under 7 days ago, so no offer can be this close to closing");

    const closing = await teacher("Ola");
    await trialEnded(closing, 6.5 * DAY);
    const plenty = await teacher("Pip");
    await trialEnded(plenty, 3_600_000);

    await runCron(request);
    expect(await got(closing.email, "trial_offer_ending")).toBe(1);
    expect(await got(plenty.email, "trial_offer_ending")).toBe(0);
  });
});

test.describe("admin stats", () => {
  test("the Stats tab shows each automation and the trial funnel", async ({ page }) => {
    const a = await createAdmin("Quinn");
    people.push(a);
    await signIn(page, a);
    await page.goto("/admin/emails?tab=stats");
    await expect(page.getByTestId("automation-stats")).toBeVisible();
    await expect(page.getByTestId("automation-trial_ending")).toBeVisible();
    await expect(page.getByTestId("automation-trial_ended_offer")).toBeVisible();
    await expect(page.getByText("Some of this page could not load")).toHaveCount(0);
  });

  test("a teacher is refused", async ({ page }) => {
    const t = await teacher("Rio");
    await signIn(page, t);
    await page.goto("/admin/emails?tab=stats");
    await expect(page).not.toHaveURL(/\/admin\/emails/);
  });
});
