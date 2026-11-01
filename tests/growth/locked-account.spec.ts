import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * An account with nothing in force: it still opens, and works like the hero.
 *
 * Needs supabase/migrations/20261101000000_no_card_trial.sql applied.
 *
 * One test calls the model, with the smallest worksheet: only a run that really
 * starts can show a colleague's tries were not counted. Everywhere else a run is
 * refused before the model starts, and the runs these tests need are written
 * straight into trial_generations, the way the routes write them.
 *
 * Refusal paths covered: the fourth run, a tool that is not free, an account with
 * a plan on the free routes, claiming while locked, and every export control.
 */

const finishedRun = async (
  owner: string,
  tool: "worksheet-generator" | "comprehension-generator" | "slideshow" = "worksheet-generator",
  output: Record<string, unknown> = { text: "# A worksheet" },
) => {
  const { data, error } = await admin
    .from("trial_generations")
    .insert({
      guest_id: owner,
      ip_hash: "account",
      tool,
      run_id: randomUUID(),
      title: "Volcanoes",
      input: {},
      output,
      status: "done",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
};

const lock = (teacher: TestTeacher) =>
  admin
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: null,
      current_period_end: null,
      free_trial_started_at: "2026-01-01T00:00:00Z",
    })
    .eq("id", teacher.id);

const asPaid = async (teacher: TestTeacher) => {
  await admin
    .from("profiles")
    .update({ stripe_customer_id: `cus_e2e_${teacher.id.slice(0, 8)}`, stripe_subscription_id: `sub_e2e_${teacher.id.slice(0, 8)}`, subscription_status: "canceled" })
    .eq("id", teacher.id);
  await admin.from("invoices").insert({
    reference: `E2E-${teacher.id.slice(0, 8)}`,
    user_id: teacher.id,
    type: "card",
    amount_gbp: 4.99,
    status: "paid",
    paid_at: new Date().toISOString(),
  });
};

// A form the route accepts, so what answers is the limit and not the validation.
// The smallest worksheet there is, for the one test that really generates.
const tryRoute = (page: Page) =>
  page.request.post("/api/try/worksheet", {
    data: {
      curriculum: "England",
      yearGroup: "Year 3",
      subject: "Science",
      learningObjective: "Name the parts of a volcano",
      questionCount: 1,
      questionTypes: [],
      outputDetail: "condensed",
    },
  });

test.describe("a locked account", () => {
  const people: TestTeacher[] = [];
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Lena");
    people.push(teacher);
    await lock(teacher);
  });
  test.afterEach(async () => {
    for (const p of people.splice(0)) {
      await admin.from("trial_generations").delete().eq("guest_id", p.id);
      await admin.from("invoices").delete().eq("user_id", p.id);
      await deleteTeacher(p);
    }
  });

  test("Today offers the three tools and a plan, in place of Ask Jo", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");

    const card = page.getByTestId("locked-card");
    await expect(card.getByRole("link", { name: "Choose a plan" })).toHaveAttribute("href", "/pricing");
    await expect(card.getByRole("link", { name: "Slides" })).toHaveAttribute("href", "/free-tools?tool=slides");
    await expect(card.getByRole("link", { name: "Comprehension" })).toHaveAttribute("href", "/free-tools?tool=comp");
    await expect(card.getByRole("link", { name: "Worksheet" })).toHaveAttribute("href", "/free-tools?tool=ws");
    await expect(page.getByTestId("free-tries-left")).toContainText("3 of 3 free tries left");
    await expect(page.getByRole("textbox", { name: "Ask Jo" })).toHaveCount(0);
  });

  test("the real tool pages and /create send them to the free version", async ({ page }) => {
    test.slow(); // First compile of four routes on the dev server.
    await signIn(page, teacher);
    for (const [path, tool] of [
      ["/tools/worksheet-generator", "ws"],
      ["/tools/comprehension-generator", "comp"],
      ["/tools/slideshow", "slides"],
      ["/create?tool=ws", "ws"],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/free-tools\\?tool=${tool}`));
    }
    // With the topic carried over from the hero.
    await page.goto("/create?tool=ws&topic=Volcanoes");
    await expect(page).toHaveURL(/\/free-tools\?tool=ws&topic=Volcanoes/);
  });

  test("the page sits inside the account, and speaks of plans rather than sign up", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/free-tools?tool=ws");
    await expect(page.getByText(/three free tries a day/i)).toBeVisible();
    await expect(page.getByText(/no account needed/i)).toHaveCount(0);
    await expect(page.getByTestId("trial-banner")).toBeVisible();
  });

  test("the fourth run of the day is refused, with a plan offered", async ({ page }) => {
    await signIn(page, teacher);
    for (let i = 0; i < 3; i++) await finishedRun(teacher.id);

    const res = await tryRoute(page);
    expect(res.status()).toBe(429);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.reason).toBe("used");
    expect(body.error).toMatch(/choose a plan/i);
    expect(body.error).not.toMatch(/sign up/i);

    await page.goto("/dashboard");
    await expect(page.getByTestId("free-tries-left")).toContainText("0 of 3 free tries left");
  });

  test("a failed run gives its try back", async ({ page }) => {
    await signIn(page, teacher);
    const id = await finishedRun(teacher.id);
    await admin.from("trial_generations").update({ status: "failed" }).eq("id", id);
    await page.goto("/dashboard");
    await expect(page.getByTestId("free-tries-left")).toContainText("3 of 3 free tries left");
  });

  test("two accounts on one network do not share a limit", async ({ page }) => {
    // Regression guard for the reason accounts are not limited by IP: a staff
    // room shares one address. Every request in this file comes from the same one.
    const colleague = await createTeacher("Bea");
    people.push(colleague);
    await lock(colleague);
    for (let i = 0; i < 3; i++) await finishedRun(colleague.id);

    await signIn(page, teacher);
    const res = await tryRoute(page);
    expect(res.status()).toBe(200);
    await res.text();
  });

  test("the other 32 tools are still refused, with the upgrade prompt's 402", async ({ page }) => {
    await signIn(page, teacher);
    const res = await page.request.post("/api/homework-generator", { data: {} });
    expect(res.status()).toBe(402);
    expect(res.headers()["x-upgrade-required"]).toBe("1");
    const body = await res.json();
    expect(body.code).toBe("plan_required");
    expect(body.error).toMatch(/choose a plan/i);
  });

  test("the slideshow wizard's helpers work, within their brake", async ({ page }) => {
    await signIn(page, teacher);
    const res = await page.request.post("/api/suggest-subject", { data: {} });
    expect(res.status(), "not stopped by the plan gate").not.toBe(402);
  });

  test("/api/generate-outline is refused: it calls a model", async ({ page }) => {
    await signIn(page, teacher);
    expect((await page.request.post("/api/generate-outline", { data: {} })).status()).toBe(402);
  });

  test("a finished run opens with its exports behind the plan prompt", async ({ page }) => {
    const run = await finishedRun(teacher.id, "comprehension-generator");
    await signIn(page, teacher);
    await page.goto(`/free-tools?tool=comp&run=${run}`);

    await page.getByRole("button", { name: /export/i }).first().click();
    const gate = page.getByTestId("choose-plan-gate");
    await expect(gate).toContainText("Choose a plan to export");
    await expect(gate.getByRole("link", { name: "Choose a plan" })).toHaveAttribute("href", "/pricing");
    // Never the signed out prompt: they already have an account.
    await expect(page.getByTestId("auth-gate")).toHaveCount(0);
  });

  test("nothing is claimed into the library while locked", async ({ page }) => {
    const run = await finishedRun(teacher.id);
    await signIn(page, teacher);

    const res = await page.request.post("/api/try/claim");
    expect((await res.json()).claimed).toEqual([]);

    const { data } = await admin.from("trial_generations").select("status, claimed_by").eq("id", run).single();
    expect(data?.status).toBe("done");
    expect(data?.claimed_by).toBeNull();
  });

  test("once they have a plan, their work moves in and the free routes close", async ({ page }) => {
    const run = await finishedRun(teacher.id);
    await setPlan(teacher, "standard", "paying");
    await signIn(page, teacher);

    const claim = await page.request.post("/api/try/claim");
    expect(claim.status()).toBe(200);

    expect((await tryRoute(page)).status(), "an account with a plan has the real tools").toBe(403);
    await page.goto("/free-tools?tool=ws");
    await expect(page).toHaveURL(/\/tools\/worksheet-generator/);

    const { data } = await admin.from("trial_generations").select("status, claimed_by").eq("id", run).single();
    expect(data?.status).toBe("claimed");
    expect(data?.claimed_by).toBe(teacher.id);
  });

  test("an account that never paid cannot download from the library", async ({ page }) => {
    await admin.from("tool_runs").insert({
      user_id: teacher.id,
      tool_slug: "homework-generator",
      title: "Trial work",
      input: {},
      output: "# Trial work",
      run_id: randomUUID(),
    });
    await signIn(page, teacher);
    await page.goto("/folders");

    await page.locator('div[draggable="true"]', { hasText: "Trial work" }).getByRole("button", { name: /menu$/i }).click();
    const downloads: unknown[] = [];
    page.on("download", (d) => downloads.push(d));
    await page.locator('[role="menu"] button', { hasText: "Download" }).click();

    await expect(page.getByTestId("choose-plan-gate")).toBeVisible();
    expect(downloads).toHaveLength(0);
  });

  test("a former payer can still download what they made", async ({ page }) => {
    await asPaid(teacher);
    await admin.from("tool_runs").insert({
      user_id: teacher.id,
      tool_slug: "homework-generator",
      title: "Paid work",
      input: {},
      output: "# Paid work",
      run_id: randomUUID(),
    });
    await signIn(page, teacher);
    await page.goto("/folders");

    await page.locator('div[draggable="true"]', { hasText: "Paid work" }).getByRole("button", { name: /menu$/i }).click();
    const download = page.waitForEvent("download");
    await page.locator('[role="menu"] button', { hasText: "Download" }).click();
    await download;
    await expect(page.getByTestId("choose-plan-gate")).toHaveCount(0);
  });

  test("a former payer's banner says the plan ended, and their free work is still locked", async ({ page }) => {
    await asPaid(teacher);
    const run = await finishedRun(teacher.id, "comprehension-generator");
    await signIn(page, teacher);

    await page.goto("/dashboard");
    await expect(page.getByTestId("trial-banner")).toContainText(/your plan has ended/i);

    await page.goto(`/free-tools?tool=comp&run=${run}`);
    await page.getByRole("button", { name: /export/i }).first().click();
    await expect(page.getByTestId("choose-plan-gate")).toBeVisible();
  });
});

test.describe("an old account that never had a trial", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Otto");
  });
  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("gets a one tap trial on Today, and the clock starts when they press it", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");

    await expect(page.getByTestId("trial-banner")).not.toContainText(/has ended/i);
    const { data: before } = await admin.from("profiles").select("plan").eq("id", teacher.id).single();
    expect(before?.plan).toBe("free");

    await page.getByTestId("start-trial").click();
    await expect(page.getByTestId("trial-banner")).toContainText("3 days left");
    await expect(page.getByTestId("locked-card")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Ask Jo" })).toBeVisible();
  });
});

test.describe("a teacher with a plan", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Rae");
    await setPlan(teacher, "pro", "paying");
  });
  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("sees no banner, no locked card and no free tools", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    await expect(page.getByRole("textbox", { name: "Ask Jo" })).toBeVisible();
    await expect(page.getByTestId("trial-banner")).toHaveCount(0);
    await expect(page.getByTestId("locked-card")).toHaveCount(0);
  });
});

test.describe("a signed out visitor", () => {
  test("keeps the hero's rules, sign up prompt and all", async ({ page }) => {
    await page.goto("/create?tool=ws");
    await expect(page.getByText(/no account needed/i)).toBeVisible();
    await expect(page.getByTestId("trial-banner")).toHaveCount(0);
  });

  test("/free-tools sends them to log in", async ({ page }) => {
    await page.goto("/free-tools?tool=ws");
    await expect(page).toHaveURL(/\/login/);
  });
});
