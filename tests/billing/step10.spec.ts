import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";
import { trialEndsAt } from "@/app/lib/resource-periods";
import { trialDateLong, trialDateShort } from "@/app/lib/account-plan";
import { renderLifecycleEmail, type LifecycleVars } from "@/app/lib/lifecycle-emails";
import { dueEmails, eventEmails } from "@/app/lib/lifecycle";
import { offerEndsAt } from "@/app/lib/run-out-offer";

/*
 * Ash's Step 10 checklist (Jooma 4.5 build spec), run with real accounts on
 * STAGING, moving the clock by editing dates.
 *
 * Each test is named after its checklist line. What is real and what is not:
 *   - Accounts, the database functions (my_resources, resources_period), the
 *     app's own routes on localhost and the editor's export are real.
 *   - Stripe is the SANDBOX with real subscriptions. The sandbox's webhook
 *     posts to deployed staging, so the events that matter are delivered,
 *     signed, to the LOCAL webhook too (the way annual-trial-email does).
 *   - Wall-clock moments that cannot be waited for (23:59 on day 10, Sunday
 *     00:00, the clocks going forward) are reached by moving dates in the
 *     database or by calling the period function with that instant.
 *   - Nothing is generated: no model call, nothing spent. Lifecycle emails are
 *     rendered and scheduled through the same functions the cron uses; nothing
 *     is sent (LIFECYCLE_EMAILS is off on staging).
 *
 * Items 6 and 7 need the Phase 2 second run-out offer (P3b, E9b), built
 * 19 Nov.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const STANDARD_MONTHLY = process.env.STRIPE_PRICE_STANDARD_MONTHLY!;
const PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY!;

if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("hhgfhhofbhzioywnppzr")) {
  throw new Error("Refusing to run Step 10 against PRODUCTION.");
}
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  throw new Error("Step 10 needs the Stripe SANDBOX key.");
}

const teachers: TestTeacher[] = [];
const customers: string[] = [];

async function teacher(name: string, profile: Record<string, unknown> = {}): Promise<TestTeacher> {
  const t = await createTeacher(name);
  teachers.push(t);
  if (Object.keys(profile).length) {
    const { error } = await admin.from("profiles").update(profile).eq("id", t.id);
    if (error) throw error;
  }
  return t;
}

test.afterEach(async () => {
  for (const id of customers.splice(0)) await stripe.customers.del(id).catch(() => {});
  for (const t of teachers.splice(0)) await deleteTeacher(t);
});

/** The teacher's own session, so RLS and the definer functions are real. */
async function as(t: TestTeacher): Promise<SupabaseClient> {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email: t.email, password: t.password });
  if (error) throw error;
  return c;
}

type Balance = { plan: string; allowance: number; total: number; next_refill_at: string | null; trial_ends_at: string | null };
async function balance(c: SupabaseClient): Promise<Balance> {
  const { data, error } = await c.rpc("my_resources");
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as Balance;
}

async function profile(t: TestTeacher) {
  const { data, error } = await admin
    .from("profiles")
    .select("plan, trial_ends_at, subscription_status, payment_failed_at, cancel_at_period_end, stripe_subscription_id")
    .eq("id", t.id)
    .single();
  if (error) throw error;
  return data;
}

async function events(t: TestTeacher) {
  const { data } = await admin.from("app_events").select("id, name, props, created_at").eq("user_id", t.id).order("id");
  return data ?? [];
}

/** Spend as the generation routes record it: cost in USD, priced into resources. */
async function spend(t: TestTeacher, usd: number, at: Date) {
  const { error } = await admin.from("token_usage").insert({
    user_id: t.id,
    tool_slug: "slideshow",
    model: "test",
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: usd,
    created_at: at.toISOString(),
  });
  if (error) throw error;
}

/** A real sandbox subscription, paid by a good test card. */
async function subscribe(t: TestTeacher, price: string): Promise<Stripe.Subscription> {
  const customer = await stripe.customers.create({
    email: t.email,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });
  customers.push(customer.id);
  return stripe.subscriptions.create({ customer: customer.id, items: [{ price }], metadata: { userId: t.id } });
}

/** Deliver one event to the LOCAL webhook, signed as Stripe would. */
async function deliver(request: APIRequestContext, type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_test_${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    object: "event",
    type,
    data: { object },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  const res = await request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function checkoutCompleted(request: APIRequestContext, t: TestTeacher, sub: Stripe.Subscription) {
  await deliver(request, "checkout.session.completed", {
    id: `cs_test_${sub.id}`,
    object: "checkout.session",
    mode: "subscription",
    subscription: sub.id,
    client_reference_id: t.id,
    metadata: {},
  });
}

async function startTrial(page: Page, t: TestTeacher): Promise<string> {
  await signIn(page, t);
  const res = await page.request.post("/api/trial/start", { data: {} });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { trialEndsAt: string }).trialEndsAt;
}

const london = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

function vars(trialEnd: Date): LifecycleVars {
  // Built the way app/api/cron/lifecycle/route.ts builds them.
  return {
    firstName: "Sam",
    trialEnds: trialDateLong(trialEnd),
    trialEndsDay: trialDateLong(trialEnd).split(" ")[0],
    made: 0,
    hours: 0,
    plan: "Pro",
    resources: 1000,
    refill: "",
    planEnds: "",
  };
}

/* ── 1 ───────────────────────────────────────────────────────────────────── */

test("1. sign up on Sunday 15 November: Pro until Wednesday 25 November 23:59, on every banner and email", async ({ page }) => {
  // The rule, in the app and in the database, for that exact sign-up.
  const signup = new Date("2026-11-15T10:30:00Z");
  const end = trialEndsAt(signup);
  expect(london(end.toISOString())).toBe("Wednesday 25 November at 23:59:59");
  const { data: sql, error } = await admin.rpc("resources_period", {
    p_plan: "pro_trial",
    p_anchor: null,
    p_at: signup.toISOString(),
    p_trial_start: signup.toISOString(),
  });
  expect(error).toBeNull();
  expect(new Date((Array.isArray(sql) ? sql[0] : sql).next_refill).getTime()).toBe(end.getTime());

  // A real account started through the real route lands on the same rule today.
  // (Either side of the call, in case it straddles UK midnight.)
  const fresh = await teacher("Tilly");
  const sentAt = new Date();
  const started = await startTrial(page, fresh);
  const doneAt = new Date();
  expect([trialEndsAt(sentAt).getTime(), trialEndsAt(doneAt).getTime()]).toContain(new Date(started).getTime());
  expect(london(started)).toMatch(/ at 23:59:59$/);

  // A teacher who signed up on 15 November (clock moved back): the sidebar
  // shows the date, never "N days left".
  const t = await teacher("Sunday", {
    plan: "pro_trial",
    trial_ends_at: end.toISOString(),
    free_trial_started_at: signup.toISOString(),
  });
  await page.context().clearCookies();
  await signIn(page, t);
  await page.goto("/dashboard");
  const sidebar = page.locator("nav, aside").filter({ hasText: "in your trial" }).first();
  await expect(sidebar).toContainText(`Trial ends ${trialDateShort(end)}.`, NAV);
  expect(trialDateShort(end)).toBe("Wed 25 Nov");
  await expect(page.locator("body")).not.toContainText(/\bdays? left\b/i);

  // On a phone the sidebar is a drawer, so the top bar carries P1's chip:
  // the date again, never a countdown (it used to say "7d left").
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.getByTestId("trial-chip")).toHaveText("Pro trial until Wed 25 Nov", NAV);
  await expect(page.locator("body")).not.toContainText(/\d+d left|\bdays? left\b/i);
  // Regression: the full chip squeezed the page title to "To...". A narrow
  // phone shows the short form, and the title is not cut off.
  await expect(page.getByTestId("trial-chip")).toHaveText("Pro until 25 Nov", { useInnerText: true });
  const title = page.locator("[data-topbar] h2");
  expect(await title.evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  // Day 8 for that teacher (clock moved forward): the P1 banner on Today.
  const day8 = await teacher("Banner", {
    plan: "pro_trial",
    trial_ends_at: trialEndsAt(new Date(Date.now() - 8 * 864e5)).toISOString(),
    free_trial_started_at: new Date(Date.now() - 8 * 864e5).toISOString(),
  });
  await page.context().clearCookies();
  await signIn(page, day8);
  await page.goto("/dashboard");
  const banner = page.getByTestId("prompt-P1");
  await expect(banner).toBeVisible(NAV);
  await expect(banner).toContainText(trialDateLong(trialEndsAt(new Date(Date.now() - 8 * 864e5))));

  // The three trial emails carry the same date.
  expect(renderLifecycleEmail("E1", vars(end)).body).toContain("Wednesday 25 November");
  expect(renderLifecycleEmail("E5", vars(end)).subject).toBe("Your Pro trial ends on Wednesday");
  expect(renderLifecycleEmail("E5", vars(end)).body).toContain("Wednesday 25 November");
  expect(renderLifecycleEmail("E6", vars(end)).body).toContain("23:59");
});

/* ── 2 and 3 ─────────────────────────────────────────────────────────────── */

test("2. a deck still running at 23:59 on day 10 finishes, and the next request is on Free", async () => {
  const t = await teacher("Midnight", {
    plan: "pro_trial",
    trial_ends_at: new Date(Date.now() + 864e5).toISOString(),
    free_trial_started_at: new Date(Date.now() - 9 * 864e5).toISOString(),
  });
  const c = await as(t);
  expect((await balance(c)).plan).toBe("pro_trial");

  // The clock passes 23:59:59 while the deck is generating.
  await admin.from("profiles").update({ trial_ends_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", t.id);
  // The deck finishes and records its spend (about 25 resources) after the end.
  await spend(t, 0.05, new Date(Date.now() - 30_000));
  // Nothing has moved the account yet: the generation was not stopped.
  expect((await profile(t)).plan).toBe("pro_trial");

  // The next request is on Free, with a fresh 50 the finished deck does not eat.
  const { data: gate } = await c.rpc("my_generation_gate");
  expect((Array.isArray(gate) ? gate[0] : gate).plan).toBe("free");
  const after = await balance(c);
  expect(after).toMatchObject({ plan: "free", allowance: 50, total: 50 });
  expect((await profile(t)).plan).toBe("free");

  // A deck that ends after the move and goes over: finished, balance 0, never negative.
  await spend(t, 0.2, new Date());
  expect((await balance(c)).total).toBe(0);
});

test("3. after the trial: 50, the whole library, trial decks keep their pictures, a re-export adds the mark", async ({ page }) => {
  const t = await teacher("Library", {
    plan: "pro_trial",
    trial_ends_at: new Date(Date.now() + 864e5).toISOString(),
    free_trial_started_at: new Date(Date.now() - 9 * 864e5).toISOString(),
  });
  // Made during the trial: a deck with a generated picture and a lesson plan.
  const picture = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=400";
  const { data: deck, error } = await admin
    .from("presentations")
    .insert({
      user_id: t.id,
      title: "Volcanoes",
      slides: [
        {
          shapes: [],
          background: "#ffffff",
          images: [{ id: "i1", src: picture, x: 500, y: 100, width: 300, height: 200 }],
          texts: [{ id: "t1", x: 80, y: 80, width: 600, text: "Volcanoes", fontSize: 48, fontWeight: "800", fontStyle: "normal", underline: false, fontFamily: "'Inter', sans-serif", color: "#1d1730", textAlign: "left" }],
        },
      ],
    })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("tool_runs").insert({
    user_id: t.id,
    tool_slug: "lesson-planner",
    title: "Rivers",
    input: {},
    output: "# Rivers",
    created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
  });

  // The trial ends.
  await admin.from("profiles").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", t.id);
  const c = await as(t);
  expect(await balance(c)).toMatchObject({ plan: "free", total: 50 });

  // The library, read as the teacher: both still there, the picture intact.
  const { data: decks } = await c.from("presentations").select("id, slides").eq("user_id", t.id);
  expect(decks).toHaveLength(1);
  expect(JSON.stringify(decks![0].slides)).toContain(picture);
  const { data: runs } = await c.from("tool_runs").select("id").eq("user_id", t.id);
  expect(runs).toHaveLength(1);

  // The first visit after the trial: P2 says what they made and that they are
  // on Free (spec Step 5, "First visit after the trial ends", once).
  await signIn(page, t);
  await page.goto("/dashboard");
  const p2 = page.getByTestId("prompt-P2");
  await expect(p2).toBeVisible(NAV);
  await expect(p2).toContainText("Your 10 days of Pro have ended.");
  await expect(p2).toContainText("You made 1 resource");
  await p2.getByRole("button", { name: "Carry on with Free" }).click();
  await expect(p2).toBeHidden();
  await page.goto("/dashboard");
  await page.waitForTimeout(3000);
  await expect(p2).toHaveCount(0);

  // Re-exported on Free: the mark is on every slide.
  await page.goto(`/editor/${deck.id}`);
  await expect(page.getByRole("button", { name: "Present" })).toBeVisible(NAV);
  const [download] = await Promise.all([
    page.waitForEvent("download", NAV),
    (async () => {
      await page.getByRole("button", { name: "Export options" }).click();
      await page.getByRole("menuitem", { name: "Download PowerPoint (PPTX)" }).click();
    })(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
  const slideXml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(slideXml).toContain("Made with Jooma");
  // And the picture went into the file too.
  expect(Object.keys(zip.files).some((f) => f.startsWith("ppt/media/"))).toBe(true);
});

/* ── 5 ───────────────────────────────────────────────────────────────────── */

test("5. Sunday 00:00 UK time, including 28 March 2027: Free is set to 50, not increased by 50", async () => {
  // The week boundary itself, in the database, either side of each change.
  const period = async (at: string) => {
    const { data, error } = await admin.rpc("resources_period", { p_plan: "free", p_anchor: 1, p_at: at, p_trial_start: null });
    expect(error).toBeNull();
    const r = Array.isArray(data) ? data[0] : data;
    return { start: new Date(r.period_start).toISOString(), next: new Date(r.next_refill).toISOString() };
  };
  // Saturday 23:59:59 GMT, the night the clocks go forward: still last week.
  expect(await period("2027-03-27T23:59:59Z")).toEqual({ start: "2027-03-21T00:00:00.000Z", next: "2027-03-28T00:00:00.000Z" });
  // Sunday 00:00 GMT (the clocks go forward at 01:00): the new week.
  expect(await period("2027-03-28T00:00:00Z")).toEqual({ start: "2027-03-28T00:00:00.000Z", next: "2027-04-03T23:00:00.000Z" });
  // Sunday 02:30 BST, after the change: the same week, not a second refill.
  expect((await period("2027-03-28T01:30:00Z")).start).toBe("2027-03-28T00:00:00.000Z");
  // A week later, refill at 00:00 BST, which is 23:00 UTC on the Saturday.
  expect((await period("2027-04-03T23:00:00Z")).start).toBe("2027-04-03T23:00:00.000Z");
  expect((await period("2027-04-03T22:59:59Z")).start).toBe("2027-03-28T00:00:00.000Z");
  // And the night the clocks go back (25 October 2026, 00:00 BST = 23:00 UTC Saturday).
  expect((await period("2026-10-24T23:00:00Z")).start).toBe("2026-10-24T23:00:00.000Z");

  // A real Free account with resources left over: the refill SETS 50.
  const t = await teacher("Sunday", { plan: "free" });
  const c = await as(t);
  expect(await balance(c)).toMatchObject({ plan: "free", total: 50 });
  // Move the clock back a week: last week ran from the Sunday before last to
  // last Sunday 00:00, and 10 of its 50 were spent, so 40 were left.
  const thisWeek = await period(new Date().toISOString());
  const lastSunday = new Date(thisWeek.start);
  const sundayBefore = new Date(lastSunday.getTime() - 7 * 864e5);
  await spend(t, 0.02, new Date(sundayBefore.getTime() + 3600_000)); // ~10 resources
  await admin
    .from("resource_accounts")
    .update({ period_start: sundayBefore.toISOString(), next_refill_at: lastSunday.toISOString() })
    .eq("user_id", t.id);
  const refilled = await balance(c);
  expect(refilled).toMatchObject({ plan: "free", allowance: 50, total: 50 });
  // The new week starts at a Sunday 00:00 UK time.
  const start = new Date((await admin.from("resource_accounts").select("period_start").eq("user_id", t.id).single()).data!.period_start);
  expect(london(start.toISOString())).toMatch(/^Sunday .* at 00:00:00$/);
});

/* ── 6 and 7 ─────────────────────────────────────────────────────────────── */

const RESOURCE_GBP = 0.0015;

/** On Free with `left` resources this week, and an earlier run-out last week. */
async function freeRunOutTwice(t: TestTeacher, left: number) {
  await admin.from("profiles").update({ plan: "free", subscription_status: null, stripe_subscription_id: null }).eq("id", t.id);
  await admin.rpc("resources_start", { p_uid: t.id, p_plan: "free" });
  const { data: fx } = await admin.rpc("fx_usd_to_gbp");
  await admin.from("token_usage").insert({
    user_id: t.id,
    tool_slug: "worksheet-generator",
    model: "e2e",
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: ((50 - left) * RESOURCE_GBP) / Number(fx ?? 0.79),
  });
  // Clock moved back: the first run-out was in an earlier UK week.
  await admin.from("app_events").insert({
    user_id: t.id,
    name: "credits_ran_out",
    props: { plan: "free", times_ran_out: 1 },
    created_at: new Date(Date.now() - 8 * 864e5).toISOString(),
  });
}

async function seeOptions(page: Page) {
  await page.goto("/tools/lesson-planner");
  await page.getByTestId("tool-cost-line").getByRole("button", { name: "See options" }).click(NAV);
}

async function sessionDiscounts(page: Page, plan: string, interval: string): Promise<string[]> {
  const res = await page.request.post("/api/stripe/checkout", { data: { plan, interval } });
  expect(res.status(), await res.text()).toBe(200);
  const url = ((await res.json()) as { url: string }).url;
  const id = url.match(/cs_test_[A-Za-z0-9]+/)![0];
  const session = await stripe.checkout.sessions.retrieve(id);
  return (session.discounts ?? []).map((d) => {
    if (d.coupon) return `coupon:${typeof d.coupon === "string" ? d.coupon : d.coupon.id}`;
    return `promo:${typeof d.promotion_code === "string" ? d.promotion_code : (d.promotion_code?.id ?? "")}`;
  });
}

test("6. run out a second time in a different week: P3b and E9b offer £3.99 once, and Stripe applies it to Pro monthly only", async ({ page }) => {
  const t = await teacher("Twice", { marketing_consent: true });
  await freeRunOutTwice(t, 12);
  await signIn(page, t);
  await seeOptions(page);

  const sheet = page.getByTestId("prompt-P3b");
  await expect(sheet).toBeVisible(NAV);
  await expect(sheet).toContainText("Your first month of Pro for £3.99.");
  const opened = async () =>
    (await admin.from("app_events").select("props, created_at").eq("user_id", t.id).eq("name", "offer_opened")).data ?? [];
  await expect.poll(async () => (await opened()).length, NAV).toBe(1);
  const [offer] = await opened();
  const ends = new Date((offer.props as { ends_at: string }).ends_at);
  expect(ends.getTime()).toBe(offerEndsAt(new Date(offer.created_at)).getTime());
  await expect(sheet).toContainText(`This offer ends on ${trialDateLong(ends)}.`);
  await expect(sheet.getByRole("button", { name: "Get Pro for £3.99" })).toBeVisible();

  // E9b, an hour later, as the cron asks it (moved to daytime if need be).
  const openedAt = new Date(offer.created_at);
  const ranOut = (await admin.from("app_events").select("props, created_at").eq("user_id", t.id).eq("name", "credits_ran_out")).data ?? [];
  const asCron = {
    plan: "free" as const,
    signupAt: new Date(Date.now() - 30 * 864e5),
    trialEndsAt: null,
    fromTrial: false,
    hasPaid: false,
    marketingConsent: true,
    sundayEmails: false,
    ranOutAt: ranOut.filter((e) => (e.props as { plan?: string }).plan === "free").map((e) => new Date(e.created_at)),
    offerOpenedAt: openedAt,
    offerEndsAt: ends,
  };
  const daytime = (d: Date) => {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(d));
    return h >= 7 && h < 21;
  };
  const hourLater = new Date(openedAt.getTime() + 3600_000);
  if (daytime(hourLater)) {
    expect(dueEmails(asCron, new Set(), hourLater).map((e) => e.id)).toEqual(["E9b"]);
  }
  expect(dueEmails(asCron, new Set(["E9b"]), hourLater).map((e) => e.id)).not.toContain("E9b");
  expect(dueEmails({ ...asCron, marketingConsent: false }, new Set(), hourLater)).toEqual([]);

  // Once only: the next run-out is plain P3, and nothing new opens.
  await sheet.getByRole("button", { name: "Wait for Sunday" }).click();
  await seeOptions(page);
  await expect(page.getByTestId("prompt-P3")).toBeVisible(NAV);
  await expect(page.getByTestId("prompt-P3b")).toHaveCount(0);
  expect(await opened()).toHaveLength(1);

  // Stripe: the offer coupon on Pro monthly, and on nothing else.
  expect(await sessionDiscounts(page, "pro", "month")).toEqual(["coupon:PRO-HALF-FIRST-MONTH"]);
  expect(await sessionDiscounts(page, "pro", "year")).toEqual([]);
  expect(await sessionDiscounts(page, "standard", "month")).toEqual([]);
  expect(await sessionDiscounts(page, "max", "month")).toEqual([]);

  // Once the seven days are up, it is gone.
  await admin
    .from("app_events")
    .update({ props: { ...(offer.props as object), ends_at: new Date(Date.now() - 1000).toISOString() } })
    .eq("user_id", t.id)
    .eq("name", "offer_opened");
  expect(await sessionDiscounts(page, "pro", "month")).toEqual([]);
});

test("7. an ambassador code and the £3.99 offer together: only one discount", async ({ page }) => {
  const t = await teacher("Both", { marketing_consent: true });
  await freeRunOutTwice(t, 12);

  // A real sandbox ambassador code (half the first month, like every code).
  const tag = Date.now().toString(36);
  const coupon = await stripe.coupons.create({ percent_off: 50, duration: "once", name: `zz step10 ${tag}` });
  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: `ZZSTEPTEN${tag}`.toUpperCase(),
  } as Stripe.PromotionCodeCreateParams);
  const { data: amb, error } = await admin
    .from("ambassadors")
    .insert({ full_name: `ZZ Step10 ${tag}`, email: `zz-step10-${tag}@example.com` })
    .select("id")
    .single();
  if (error) throw error;
  try {
    const { data: code, error: codeError } = await admin
      .from("ambassador_codes")
      .insert({ ambassador_id: amb.id, promotion_code_id: promo.id, code: promo.code })
      .select("id")
      .single();
    if (codeError) throw codeError;
    const { error: refError } = await admin.from("ambassador_referrals").insert({ ambassador_id: amb.id, code_id: code.id, user_id: t.id });
    if (refError) throw refError;

    await signIn(page, t);
    await seeOptions(page);
    await expect(page.getByTestId("prompt-P3b")).toBeVisible(NAV);

    // Both are open; Stripe is given exactly one. On a tie, the code they chose.
    expect(await sessionDiscounts(page, "pro", "month")).toEqual([`promo:${promo.id}`]);
    // Standard monthly carries the code alone, never the offer.
    expect(await sessionDiscounts(page, "standard", "month")).toEqual([`promo:${promo.id}`]);
  } finally {
    await admin.from("ambassadors").delete().eq("id", amb.id);
    await stripe.promotionCodes.update(promo.id, { active: false }).catch(() => {});
    await stripe.coupons.del(coupon.id).catch(() => {});
  }
});

/* ── 8 ───────────────────────────────────────────────────────────────────── */

test("8. sign up again with the same email address: no second trial", async ({ page }) => {
  const first = await teacher("Repeat");
  await startTrial(page, first);
  const email = first.email;
  await deleteTeacher(first);
  teachers.splice(teachers.indexOf(first), 1);

  // Same address, a brand new account. Also tried with different capitals.
  for (const address of [email, email.toUpperCase()]) {
    const { data, error } = await admin.auth.admin.createUser({ email: address, password: first.password, email_confirm: true });
    if (error) throw error;
    const again: TestTeacher = { ...first, id: data.user.id, email: address, username: `rp${Date.now().toString(36)}`.slice(0, 20) };
    teachers.push(again);
    await admin.from("profiles").upsert({ id: again.id, first_name: "Repeat", surname: "Testcase", username: again.username });
    await page.context().clearCookies();
    await signIn(page, again);
    const res = await page.request.post("/api/trial/start", { data: {} });
    expect(res.status()).toBe(409);
    expect((await profile(again)).plan).toBe("free");
    await deleteTeacher(again);
    teachers.splice(teachers.indexOf(again), 1);
  }
});

/* ── 9 ───────────────────────────────────────────────────────────────────── */

test("9. pay during the trial: the plan starts at once with its full resources, and trial emails stop", async ({ page, request }) => {
  const t = await teacher("Payer");
  await startTrial(page, t);
  const c = await as(t);
  expect(await balance(c)).toMatchObject({ plan: "pro_trial", allowance: 300 });

  const sub = await subscribe(t, PRO_MONTHLY);
  await checkoutCompleted(request, t, sub);

  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("pro");
  expect((await profile(t)).trial_ends_at).toBeNull();
  expect(await balance(c)).toMatchObject({ plan: "pro", allowance: 1000, total: 1000 });
  expect((await events(t)).some((e) => e.name === "subscribed")).toBe(true);

  // The trial emails due on day 8 and day 10, asked as the cron asks: none.
  const signup = new Date();
  const day8 = new Date(signup.getTime() + 8 * 864e5);
  day8.setUTCHours(16, 45);
  const asPaid = { plan: "pro" as const, signupAt: signup, trialEndsAt: null, fromTrial: false, hasPaid: true, marketingConsent: true, sundayEmails: true };
  expect(dueEmails(asPaid, new Set(), day8)).toEqual([]);
  expect(dueEmails({ ...asPaid, plan: "pro_trial", hasPaid: false, trialEndsAt: trialEndsAt(signup) }, new Set(["E1"]), day8).map((e) => e.id)).toEqual(["E5"]);
});

/* ── 10 and 11 ───────────────────────────────────────────────────────────── */

test("10. Standard to Pro mid-month: charged the difference, 500 added, refill date unchanged", async ({ page, request }) => {
  const t = await teacher("Upgrade");
  const sub = await subscribe(t, STANDARD_MONTHLY);
  await checkoutCompleted(request, t, sub);
  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("standard");
  const c = await as(t);
  const before = await balance(c);
  expect(before).toMatchObject({ plan: "standard", allowance: 500 });

  await signIn(page, t);
  const res = await page.request.post("/api/stripe/upgrade", { data: { plan: "pro" } });
  expect(res.status(), await res.text()).toBe(200);

  // Stripe holds the difference for the rest of the period as proration lines.
  const updated = await stripe.subscriptions.retrieve(sub.id);
  expect(updated.items.data[0].price.id).toBe(PRO_MONTHLY);
  const pending = await stripe.invoiceItems.list({ customer: updated.customer as string, pending: true });
  const net = pending.data.reduce((sum, i) => sum + i.amount, 0);
  // £7.99 less £4.99, for the part of the month left (all of it, just bought).
  expect(net).toBeGreaterThan(250);
  expect(net).toBeLessThanOrEqual(300);

  await deliver(request, "customer.subscription.updated", updated as unknown as Record<string, unknown>);
  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("pro");
  const after = await balance(c);
  expect(after.allowance).toBe(before.allowance + 500);
  expect(after.next_refill_at).toBe(before.next_refill_at);

  // The same change arriving again (a second delivery, or the page's own
  // balance read racing the webhook) adds nothing more.
  await admin.rpc("resources_change_plan", { p_uid: t.id, p_from: "standard", p_to: "pro" });
  await Promise.all([
    admin.rpc("resources_change_plan", { p_uid: t.id, p_from: "standard", p_to: "pro" }),
    admin.rpc("resources_change_plan", { p_uid: t.id, p_from: "standard", p_to: "pro" }),
  ]);
  expect((await balance(c)).allowance).toBe(before.allowance + 500);
});

test("11. Pro to Standard: the change happens on the next refill date", async ({ page, request }) => {
  const t = await teacher("Downgrade");
  const sub = await subscribe(t, PRO_MONTHLY);
  await checkoutCompleted(request, t, sub);
  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("pro");

  await signIn(page, t);
  const res = await page.request.post("/api/stripe/downgrade", { data: { plan: "standard" } });
  expect(res.status(), await res.text()).toBe(200);

  const s = await stripe.subscriptions.retrieve(sub.id, { expand: ["schedule"] });
  const schedule = s.schedule as Stripe.SubscriptionSchedule;
  expect(schedule).toBeTruthy();
  const next = schedule.phases[schedule.phases.length - 1];
  expect(next.items[0].price).toBe(STANDARD_MONTHLY);
  expect(next.start_date).toBe(s.items.data[0].current_period_end);
  // Still Pro, with Pro's resources, until then.
  expect(s.items.data[0].price.id).toBe(PRO_MONTHLY);
  expect((await profile(t)).plan).toBe("pro");
  expect((await balance(await as(t))).allowance).toBe(1000);
});

/* ── 12 and 13 ───────────────────────────────────────────────────────────── */

test("12. cancel: the plan lasts to the end of the period, then Free with 50, and E13 is sent", async ({ request }) => {
  const t = await teacher("Cancel");
  const sub = await subscribe(t, PRO_MONTHLY);
  await checkoutCompleted(request, t, sub);
  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("pro");

  // The teacher sets the plan to end. Built here rather than asked of Stripe:
  // the sandbox would also post its own copy to deployed staging (older code),
  // which shares this database and would log a cancel of its own.
  const ending = { ...(await stripe.subscriptions.retrieve(sub.id)), cancel_at_period_end: true };
  // Stripe may deliver the same change twice, at once: still ONE E13.
  await Promise.all([
    deliver(request, "customer.subscription.updated", ending as unknown as Record<string, unknown>),
    deliver(request, "customer.subscription.updated", ending as unknown as Record<string, unknown>),
  ]);
  await expect.poll(async () => (await profile(t)).cancel_at_period_end, NAV).toBe(true);
  expect((await profile(t)).plan).toBe("pro");

  // E13, from the logged event, as the cron would send it in the daytime.
  const cancelled = (await events(t)).filter((e) => e.name === "cancelled");
  expect(cancelled).toHaveLength(1);
  const noon = new Date();
  noon.setUTCHours(12, 0, 0, 0);
  const due = eventEmails(
    cancelled.map((e) => ({ id: e.id, name: e.name, createdAt: new Date(Math.min(Date.parse(e.created_at), noon.getTime())) })),
    new Set(),
    noon,
    { paymentFailing: false },
  );
  expect(due.map((d) => d.id)).toEqual(["E13"]);

  // The period ends: Stripe deletes the subscription.
  const ended = await stripe.subscriptions.cancel(sub.id);
  await deliver(request, "customer.subscription.deleted", ended as unknown as Record<string, unknown>);
  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("free");
  expect(await balance(await as(t))).toMatchObject({ plan: "free", allowance: 50, total: 50 });
  expect((await events(t)).some((e) => e.name === "moved_to_free")).toBe(true);
});

test("13. a payment that keeps failing: Pro while Stripe retries, then Free, and nothing deleted", async ({ page, request }) => {
  const t = await teacher("Failing");
  const sub = await subscribe(t, PRO_MONTHLY);
  await checkoutCompleted(request, t, sub);
  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("pro");
  await admin.from("tool_runs").insert({ user_id: t.id, tool_slug: "lesson-planner", title: "Kept", input: {}, output: "# Kept" });

  // The renewal fails and Stripe starts retrying.
  const invoice = (await stripe.invoices.list({ subscription: sub.id, limit: 1 })).data[0];
  await deliver(request, "invoice.payment_failed", { ...invoice, status: "open" } as unknown as Record<string, unknown>);
  await deliver(request, "customer.subscription.updated", { ...sub, status: "past_due" } as unknown as Record<string, unknown>);
  await expect.poll(async () => (await profile(t)).payment_failed_at, NAV).not.toBeNull();
  // Still Pro while Stripe retries, with P12 telling them.
  expect((await profile(t)).plan).toBe("pro");
  await signIn(page, t);
  await page.goto("/dashboard");
  await expect(page.getByTestId("prompt-P12")).toBeVisible(NAV);

  // Stripe stops retrying and cancels.
  const gone = await stripe.subscriptions.cancel(sub.id);
  await deliver(request, "customer.subscription.deleted", gone as unknown as Record<string, unknown>);
  await expect.poll(async () => (await profile(t)).plan, NAV).toBe("free");
  expect(await balance(await as(t))).toMatchObject({ plan: "free", total: 50 });
  const { data: runs } = await admin.from("tool_runs").select("id").eq("user_id", t.id);
  expect(runs).toHaveLength(1);
  const { data: still } = await admin.from("profiles").select("id").eq("id", t.id);
  expect(still).toHaveLength(1);
});

/* ── 14 ──────────────────────────────────────────────────────────────────── */

test("14. present mode: no banner, sheet or pop-up", async ({ page }) => {
  // A teacher with a banner that shows on every screen (P12).
  const t = await teacher("Present", {
    plan: "pro",
    subscription_status: "active",
    payment_failed_at: new Date().toISOString(),
  });
  const { data: deck, error } = await admin
    .from("presentations")
    .insert({
      user_id: t.id,
      title: "Present check",
      slides: [1, 2].map((n) => ({
        shapes: [],
        images: [],
        background: "#ffffff",
        texts: [{ id: `t${n}`, x: 80, y: 80, width: 800, text: `Slide ${n}`, fontSize: 48, fontWeight: "800", fontStyle: "normal", underline: false, fontFamily: "'Inter', sans-serif", color: "#1d1730", textAlign: "left" }],
      })),
    })
    .select("id")
    .single();
  if (error) throw error;

  await signIn(page, t);
  await page.goto("/dashboard");
  await expect(page.getByTestId("prompt-P12")).toBeVisible(NAV);

  // Quiz presenter, inside the app: P12 goes while presenting, and comes back.
  await page.route("**/api/quiz-generator", (route) =>
    route.fulfill({
      json: {
        title: "Check",
        questions: [{ type: "single", question: "Two plus two?", options: ["3", "4"], answers: [1], explanation: "" }],
      },
    }),
  );
  const prefill = Buffer.from(
    JSON.stringify({ slug: "quiz-generator", fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 3", subject: "Maths", topic: "Adding", answerType: "single", timeLimit: 20 } }),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await page.goto(`/tools/quiz-generator?prefill=${prefill}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(page.getByTestId("quiz-card")).toHaveCount(1, NAV);
  await expect(page.getByTestId("prompt-P12")).toBeVisible();
  await page.getByTestId("quiz-present").click();
  await expect(page.getByTestId("quiz-presenter")).toBeVisible(NAV);
  await expect(page.getByTestId(/^prompt-/)).toHaveCount(0);
  await expect(page.getByRole("dialog").filter({ hasNotText: "Two plus two?" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("quiz-presenter")).toHaveCount(0);
  await expect(page.getByTestId("prompt-P12")).toBeVisible();

  // The slide editor's present mode shows nothing of ours either.
  await page.goto(`/editor/${deck.id}`);
  await page.getByRole("button", { name: "Present" }).click({ timeout: 60_000 });
  await expect(page.getByText("Slide 1").first()).toBeVisible(NAV);
  await expect(page.getByTestId(/^prompt-/)).toHaveCount(0);
});
