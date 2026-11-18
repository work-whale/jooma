import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Jooma 4.5, Stage 2 (the plans engine) on the screens. Slim: the rules are
 * pinned by the unit tests (resources-ledger, prompts, prompt-views,
 * pricing-view, pricing-cards, topups-v45 and the rest); this proves the
 * screens and routes are wired to them on staging.
 *
 * Needs, on staging: 20261118000000_plans_engine, 20261118000100_trial_expiry_guard,
 * 20261118000200_resource_topups (with the sandbox stripe_price_id set on the
 * three packs).
 *
 * No model is ever called: every generation here is refused by the gate
 * before it starts, which is the thing under test.
 *
 * Covered: the trial starts as pro_trial ending 23:59:59 UK time on day 10,
 * once only, and the sidebar says so with the real date; Free with 12 left sees
 * the cost line and P3 on opening a tool, the form keeps what was typed, and
 * Make is refused with the same numbers; P5 on turning on generated pictures;
 * the pricing page's four cards and phone order; the picker opens on Pro with
 * the one-line diff and Continue sends Pro monthly to checkout; top-ups are
 * refused on Free and open Stripe on Pro.
 *
 * Deliberately not here: the Stripe webhook (needs signed events; the
 * decisions are unit-tested in billing-rules), the email cron (switched off
 * by LIFECYCLE_EMAILS), the Sunday refill and the clocks-forward night
 * (resources-ledger and the PGlite run), and present-mode suppression
 * (prompts.spec).
 */

const RESOURCE_GBP = 0.0015;

/** Put a teacher on 4.5 Free with exactly `left` resources this week. */
async function freeWith(t: TestTeacher, left: number) {
  const { error } = await admin
    .from("profiles")
    .update({ plan: "free", subscription_status: null, stripe_subscription_id: null, current_period_end: null })
    .eq("id", t.id);
  if (error) throw error;
  const start = await admin.rpc("resources_start", { p_uid: t.id, p_plan: "free" });
  if (start.error) throw start.error;
  const spend = 50 - left;
  if (spend > 0) {
    const { data: fx } = await admin.rpc("fx_usd_to_gbp");
    const costUsd = (spend * RESOURCE_GBP) / Number(fx ?? 0.79);
    const ins = await admin.from("token_usage").insert({
      user_id: t.id,
      tool_slug: "worksheet-generator",
      model: "e2e",
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: costUsd,
    });
    if (ins.error) throw ins.error;
  }
}

async function londonDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "medium" }).format(d);
}

test.describe("the Pro trial", () => {
  let t: TestTeacher;
  test.beforeEach(async () => {
    t = await createTeacher("Priya");
  });
  test.afterEach(async () => deleteTeacher(t));

  test("starts as pro_trial, ends 23:59:59 UK time on day 10, once only", async ({ page }) => {
    await signIn(page, t);
    const res = await page.request.post("/api/trial/start");
    expect(res.status()).toBe(200);
    const { data } = await admin.from("profiles").select("plan, trial_ends_at").eq("id", t.id).single();
    expect(data!.plan).toBe("pro_trial");
    const end = new Date(data!.trial_ends_at);
    expect(await londonDate(end)).toMatch(/23:59:59$/);
    const days = (end.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(9.9);
    expect(days).toBeLessThan(11);

    expect((await page.request.post("/api/trial/start")).status()).toBe(409);

    await page.goto("/dashboard");
    await expect(page.getByTestId("sidebar-plan-chip")).toHaveText("PRO TRIAL");
    await expect(page.getByTestId("sidebar-plan-note")).toContainText("Pro trial until");
    await expect(page.getByTestId("sidebar-plan-note")).not.toContainText(/days? left/);
  });
});

test.describe("Free, running out", () => {
  let t: TestTeacher;
  test.beforeEach(async () => {
    t = await createTeacher("Fern");
    await freeWith(t, 12);
  });
  test.afterEach(async () => deleteTeacher(t));

  test("the cost line and P3 show on opening a tool, and the form keeps what was typed", async ({ page }) => {
    await signIn(page, t);
    await page.goto("/tools/lesson-planner");
    const line = page.getByTestId("tool-cost-line");
    await expect(line).toContainText("This usually needs about 30. You have 12.");

    const field = page.locator("[data-jo-form] textarea, [data-jo-form] input[type=text]").first();
    await field.fill("Fractions of amounts");

    await line.getByRole("button", { name: "See options" }).click();
    const sheet = page.getByTestId("prompt-P3");
    await expect(sheet).toContainText("That's this week's free resources used.");
    await expect(sheet.getByRole("button", { name: "Go Pro" })).toBeVisible();
    await sheet.getByRole("button", { name: "Wait for Sunday" }).click();
    await expect(sheet).toBeHidden();
    await expect(field).toHaveValue("Fractions of amounts");

    // Step 7: P3 shown counts as running out, with the plan.
    await expect
      .poll(async () => {
        const { data } = await admin.from("app_events").select("props").eq("user_id", t.id).eq("name", "credits_ran_out");
        return (data ?? []).map((r) => r.props);
      })
      .toContainEqual({ plan: "free", times_ran_out: 1 });
  });

  test("P4: with 12 left, a tool that still fits shows the low line, and no P3", async ({ page }) => {
    await signIn(page, t);
    await page.goto("/tools/quiz-generator");
    const p4 = page.getByTestId("prompt-P4");
    await expect(p4).toHaveText(/12 resources left this week\. You'll be back to 50 on Sunday\./, { timeout: 60_000 });
    await expect(p4.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/pricing?plan=pro&from=P4");
    await expect(page.getByTestId("tool-cost-line")).not.toContainText("See options");
    // A tool that does not fit gets the cost line and P3 instead, not P4.
    await page.goto("/tools/lesson-planner");
    await expect(page.getByTestId("tool-cost-line")).toContainText("This usually needs about 30. You have 12.");
    await expect(page.getByTestId("prompt-P4")).toHaveCount(0);
  });

  test("Make is refused before it starts, with the P3 payload", async ({ page }) => {
    await signIn(page, t);
    const res = await page.request.post("/api/lesson-planner", { data: {} });
    expect(res.status()).toBe(402);
    const body = await res.json();
    expect(body.prompt).toMatchObject({ prompt: "P3", variant: "free", needed: 30, left: 12 });
  });

  test("top-ups are not for Free", async ({ page }) => {
    await signIn(page, t);
    const res = await page.request.post("/api/stripe/topup", { data: { packId: "pack-500" } });
    expect(res.status()).toBe(403);
  });
});

test.describe("pictures on Free", () => {
  let t: TestTeacher;
  test.beforeEach(async () => {
    t = await createTeacher("Pia");
    await freeWith(t, 50);
  });
  test.afterEach(async () => deleteTeacher(t));

  test("turning on generated pictures opens P5, and library photos close it", async ({ page }) => {
    await signIn(page, t);
    // A prefilled topic opens the wizard; the image choice is on step two.
    const prefill = Buffer.from(JSON.stringify({ slug: "slideshow", fields: { topic: "Volcanoes" } }), "utf8")
      .toString("base64url");
    await page.goto(`/tools/slideshow?prefill=${prefill}`);
    const wizard = page.getByRole("dialog");
    await wizard.getByRole("button", { name: /^Continue$/ }).click();
    await wizard.getByRole("button", { name: /Image source/ }).click();
    await wizard.getByRole("button", { name: "Generated", exact: true }).click();
    const sheet = page.getByTestId("prompt-P5");
    await expect(sheet).toContainText("Generated pictures come with Pro.");
    await sheet.getByRole("button", { name: "Use library photos" }).click();
    await expect(sheet).toBeHidden();
  });
});

test.describe("deck pictures on Pro", () => {
  let t: TestTeacher;
  test.beforeEach(async () => {
    t = await createTeacher("Pablo");
    await setPlan(t, "pro", "comped");
    const start = await admin.rpc("resources_start", { p_uid: t.id, p_plan: "pro" });
    if (start.error) throw start.error;
    // Spend down to 40 left.
    const { data: fx } = await admin.rpc("fx_usd_to_gbp");
    const ins = await admin.from("token_usage").insert({
      user_id: t.id, tool_slug: "worksheet-generator", model: "e2e", prompt_tokens: 0, completion_tokens: 0,
      cost_usd: (960 * RESOURCE_GBP) / Number(fx ?? 0.79),
    });
    if (ins.error) throw ins.error;
  });
  test.afterEach(async () => deleteTeacher(t));

  test("the cost line follows the picture choice, and the server checks the same sum", async ({ page }) => {
    await signIn(page, t);
    const prefill = Buffer.from(JSON.stringify({ slug: "slideshow", fields: { topic: "Volcanoes" } }), "utf8")
      .toString("base64url");
    await page.goto(`/tools/slideshow?prefill=${prefill}`);
    const line = page.getByTestId("tool-cost-line");
    // Library photos by default: the deck's text only.
    await expect(line).toContainText("Usually about 15 resources. You have 40.");
    const wizard = page.getByRole("dialog");
    await wizard.getByRole("button", { name: /^Continue$/ }).click();
    await wizard.getByRole("button", { name: /Image source/ }).click();
    await wizard.getByRole("button", { name: "Generated", exact: true }).click();
    // 8 slides: 9 generated pictures at about 5.3 each.
    await expect(wizard.getByTestId("deck-picture-cost")).toHaveText("9 generated pictures add about 50 resources.");
    await expect(line).toContainText("This usually needs about 65. You have 40.");
    await wizard.getByRole("button", { name: "Web search", exact: true }).click();
    await expect(line).toContainText("Usually about 15 resources. You have 40.");
    await expect(wizard.getByTestId("deck-picture-cost")).toHaveCount(0);

    // The server refuses an all-generated deck with the same numbers, before
    // any model is called.
    const res = await page.request.post("/api/generate-slideshow", {
      data: { topic: "Volcanoes", yearGroup: "Year 4", slideCount: 8, imageSource: "ai" },
    });
    expect(res.status()).toBe(402);
    expect(await res.text()).toContain("about 65");
  });
});

test.describe("the pricing page", () => {
  test("four cards, Pro recommended", async ({ page }) => {
    await page.goto("/#pricing");
    for (const id of ["free", "standard", "pro", "max"]) await expect(page.getByTestId(`pricing-${id}`)).toBeVisible();
    await expect(page.getByTestId("pricing-pro")).toContainText("Recommended");
    await expect(page.getByTestId("pricing-max")).not.toContainText("Priority building");
    await expect(page.getByTestId("pricing-header-cta")).toHaveText("Start with 10 days of Pro free. No card.");
  });

  test("on a phone, Pro comes first", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/#pricing");
    await expect(page.getByTestId("pricing-free")).toBeVisible();
    // One read, in document coordinates: /#pricing smooth-scrolls, so boxes
    // measured one at a time against the viewport drift between reads.
    const [pro, standard, max, free] = await page.evaluate(() =>
      ["pro", "standard", "max", "free"].map(
        (id) => document.querySelector(`[data-testid="pricing-${id}"]`)!.getBoundingClientRect().top + window.scrollY,
      ),
    );
    expect(pro).toBeLessThan(standard);
    expect(standard).toBeLessThan(max);
    expect(max).toBeLessThan(free);
  });
});

test.describe("the plan picker", () => {
  let t: TestTeacher;
  test.beforeEach(async () => {
    t = await createTeacher("Paz");
    await freeWith(t, 50);
  });
  test.afterEach(async () => deleteTeacher(t));

  test("opens on Pro, says what changes, and Continue sends Pro monthly", async ({ page }) => {
    await signIn(page, t);
    let sent: unknown = null;
    await page.route("**/api/stripe/checkout", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { url: "/pricing?checkout=cancelled" } });
    });
    await page.goto("/pricing");
    await expect(page.getByTestId("picker-diff")).toHaveText(
      "Adds generated pictures, removes the Jooma mark and gives you 1,000 resources a month.",
    );
    await page.getByRole("button", { name: "Continue with Pro" }).click();
    await expect.poll(() => sent).toEqual({ plan: "pro", interval: "month" });
  });
});

test.describe("top-ups on Pro", () => {
  let t: TestTeacher;
  test.beforeEach(async () => {
    t = await createTeacher("Tom");
    await setPlan(t, "pro", "paying");
    // setPlan invents a customer id Stripe has never seen; without one the
    // route checks out by email, which the sandbox accepts.
    await admin.from("profiles").update({ stripe_customer_id: null }).eq("id", t.id);
    await admin.rpc("resources_start", { p_uid: t.id, p_plan: "pro" });
  });
  test.afterEach(async () => deleteTeacher(t));

  test("a config pack opens a Stripe Checkout; an unknown one is refused", async ({ page }: { page: Page }) => {
    await signIn(page, t);
    const ok = await page.request.post("/api/stripe/topup", { data: { packId: "pack-1500" } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).url).toContain("checkout.stripe.com");
    // An unknown id is not a 4.5 pack, so it takes the old path and is refused there.
    const bad = await page.request.post("/api/stripe/topup", { data: { packId: "pack-9" } });
    expect(bad.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("Step 7 events", () => {
  let t: TestTeacher;
  test.beforeEach(async () => {
    t = await createTeacher("Eve");
    await freeWith(t, 50);
  });
  test.afterEach(async () => deleteTeacher(t));

  const events = async (name: string) => {
    const { data } = await admin.from("app_events").select("props").eq("user_id", t.id).eq("name", name);
    return (data ?? []) as { props: Record<string, unknown> }[];
  };
  const newRun = async () => {
    const { data, error } = await admin
      .from("tool_runs")
      .insert({ user_id: t.id, tool_slug: "worksheet-generator", input: { imageSource: "web" }, output: "{}" })
      .select("id")
      .single();
    if (error) throw error;
    return data!.id as string;
  };

  test("resource_made once per run, and the second inside 7 days activates, once", async ({ page }) => {
    await signIn(page, t);
    const first = await newRun();
    expect((await page.request.post("/api/resource-made", { data: { id: first } })).status()).toBe(204);
    // A repeat call for the same run is not a second resource.
    await page.request.post("/api/resource-made", { data: { id: first } });
    expect(await events("resource_made")).toHaveLength(1);
    expect(await events("activated")).toHaveLength(0);

    const second = await newRun();
    await page.request.post("/api/resource-made", { data: { id: second } });
    const made = await events("resource_made");
    expect(made).toHaveLength(2);
    expect(made[0].props).toMatchObject({ tool: "worksheet-generator", plan: "free", with_pictures: false });
    expect(await events("activated")).toHaveLength(1);

    const third = await newRun();
    await page.request.post("/api/resource-made", { data: { id: third } });
    expect(await events("activated")).toHaveLength(1);
  });

  test("another teacher's run is never counted", async ({ page }) => {
    const other = await createTeacher("Otto");
    try {
      const { data } = await admin
        .from("tool_runs")
        .insert({ user_id: other.id, tool_slug: "worksheet-generator", input: {}, output: "{}" })
        .select("id")
        .single();
      await signIn(page, t);
      await page.request.post("/api/resource-made", { data: { id: data!.id } });
      expect(await events("resource_made")).toHaveLength(0);
    } finally {
      await deleteTeacher(other);
    }
  });

  test("checkout_started carries the prompt that led there, and only a known one", async ({ page }) => {
    await signIn(page, t);
    expect(
      (await page.request.post("/api/stripe/checkout", { data: { plan: "pro", interval: "month", sourcePrompt: "P3" } })).status(),
    ).toBe(200);
    await page.request.post("/api/stripe/checkout", { data: { plan: "standard", sourcePrompt: "<b>" } });
    const started = (await events("checkout_started")).map((e) => e.props);
    expect(started).toContainEqual({ plan: "pro", interval: "month", source_prompt: "P3" });
    expect(started).toContainEqual({ plan: "standard", interval: "month", source_prompt: null });
  });
});
