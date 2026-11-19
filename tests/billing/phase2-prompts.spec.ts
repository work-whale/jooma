import { test, expect, type Page } from "@playwright/test";
import { admin, createProfilelessTeacher, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Phase 2 screens on STAGING (spec Step 9): P6, P7, P8, P9, P10, the role and
 * school signup questions, and the cookie banner. The rules are pinned in the
 * unit tests (prompts-phase2, signup-questions, cookie-consent); these prove
 * the wiring on real accounts. No model is called and nothing is spent.
 */

if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("hhgfhhofbhzioywnppzr")) {
  throw new Error("Refusing to run against PRODUCTION.");
}

test.setTimeout(120_000);
const NAV = { timeout: 60_000 };
const teachers: TestTeacher[] = [];

async function teacher(name: string): Promise<TestTeacher> {
  const t = await createTeacher(name);
  teachers.push(t);
  return t;
}

async function onFree(t: TestTeacher) {
  await admin
    .from("profiles")
    .update({ plan: "free", subscription_status: null, stripe_subscription_id: null, current_period_end: null, trial_ends_at: null })
    .eq("id", t.id);
  const { error } = await admin.rpc("resources_start", { p_uid: t.id, p_plan: "free" });
  if (error) throw error;
}

async function onStandard(t: TestTeacher) {
  await setPlan(t, "standard", "paying");
  const { error } = await admin.rpc("resources_start", { p_uid: t.id, p_plan: "standard" });
  if (error) throw error;
}

async function run(t: TestTeacher, slug: string) {
  const { error } = await admin.from("tool_runs").insert({ user_id: t.id, tool_slug: slug, title: `E2E ${slug}`, input: {}, output: "x" });
  if (error) throw error;
}

async function spend(t: TestTeacher, usd: number) {
  const { error } = await admin.from("token_usage").insert({
    user_id: t.id,
    tool_slug: "slideshow",
    model: "test",
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: usd,
  });
  if (error) throw error;
}

async function events(t: TestTeacher, name: string) {
  const { data } = await admin.from("app_events").select("props").eq("user_id", t.id).eq("name", name);
  return (data ?? []).map((r) => r.props as Record<string, unknown>);
}

async function today(page: Page) {
  await page.goto("/dashboard", NAV);
  await expect(page.getByTestId("today-saved")).toBeVisible(NAV);
}

test.afterEach(async () => {
  for (const t of teachers.splice(0)) await deleteTeacher(t);
});

test("P8 on Free: this month's resources and the Pro link, which opens the picker on Pro", async ({ page }) => {
  const t = await teacher("PEight");
  await onFree(t);
  await run(t, "slideshow");
  await run(t, "worksheet-generator");
  await signIn(page, t);
  await today(page);
  await expect(page.getByTestId("today-saved")).toContainText(/^This month: 2 resources, about \d+ hours? saved\. See what Pro adds$/);
  await page.getByTestId("prompt-P8-link").click();
  await expect(page).toHaveURL(/\/pricing\?plan=pro&from=P8/, NAV);
  await expect.poll(async () => (await events(t, "prompt_clicked")).map((p) => p.prompt)).toContain("P8");
});

test("P8 on Pro: the line, never the Pro link", async ({ page }) => {
  const t = await teacher("PEightPro");
  await setPlan(t, "pro", "paying");
  await admin.rpc("resources_start", { p_uid: t.id, p_plan: "pro" });
  await signIn(page, t);
  await today(page);
  await expect(page.getByTestId("today-saved")).toContainText("Nothing made yet this month.");
  await expect(page.getByTestId("prompt-P8-link")).toHaveCount(0);
});

test("P9 and P10 on Standard: once per period each, and Top up opens the picker with P10", async ({ page }) => {
  const t = await teacher("PNine");
  await onStandard(t);
  await spend(t, 2); // well past 80% of 500
  // Signing in lands on Today, which is where P9 shows: that first landing is
  // this period's one showing, so look here rather than reloading.
  await signIn(page, t);
  if (!new URL(page.url()).pathname.startsWith("/dashboard")) await page.goto("/dashboard", NAV);
  const p9 = page.getByTestId("prompt-P9");
  await expect(p9).toContainText(/^You've used 500 of your 500 resources, and they refill on \d+ \w+\. Pro gives you double/, NAV);
  await p9.getByRole("button", { name: "Top up" }).click();
  await expect(page.getByTestId("prompt-P10")).toContainText("Pro gives you 500 more resources every month for £3 more, plus generated pictures.");
  await page.keyboard.press("Escape");

  // Same period: neither shows again.
  await today(page);
  await expect(page.getByTestId("prompt-P9")).toHaveCount(0);
  await expect.poll(async () => (await events(t, "prompt_shown")).filter((p) => p.prompt === "P9").length).toBe(1);
});

test("P7: the 11th refine on Free opens the sheet, never the generic plan box", async ({ page }) => {
  const t = await teacher("PSeven");
  await onFree(t);
  await admin
    .from("resource_accounts")
    .update({ refines_used: 10, refines_week_start: new Date().toISOString() })
    .eq("user_id", t.id);
  await signIn(page, t);
  await today(page);
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/jo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return res.status;
  });
  expect(status).toBe(402);
  const sheet = page.getByTestId("prompt-P7");
  await expect(sheet).toContainText("That's this week's 10 refines.");
  await expect(page.getByText("Choose a plan to start creating")).toHaveCount(0);
  await sheet.getByRole("button", { name: "OK" }).click();
  await expect(sheet).toHaveCount(0);
});

test("P6: after an export on Free, the note shows once that day", async ({ page }) => {
  const t = await teacher("PSix");
  await onFree(t);
  await signIn(page, t);
  await today(page);
  const fire = () => page.evaluate(() => window.dispatchEvent(new CustomEvent("jooma:exported")));
  await fire();
  const note = page.getByTestId("prompt-P6");
  await expect(note).toContainText("Exported. Pro exports don't have the Jooma mark.");
  await note.getByRole("button", { name: "Not now" }).click();
  await fire();
  await expect(note).toHaveCount(0);
});

test.describe("signup questions", () => {
  test("role and school are saved and sent with signup_completed; skipping saves nulls", async ({ page }) => {
    const t = await createProfilelessTeacher("Asked");
    teachers.push(t);
    await signIn(page, t);
    await page.goto("/complete-profile", NAV);
    await page.getByLabel("First name").fill("Asked");
    await page.getByLabel("Surname").fill("Testcase");
    await page.getByRole("textbox", { name: "Phone number" }).fill("7700900125");
    await page.getByTestId("signup-role").selectOption("senco");
    await page.getByTestId("signup-school").fill("  Oakfield   Primary School ");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/complete-profile"), NAV);

    const { data: p } = await admin.from("profiles").select("job_role, school_name").eq("id", t.id).single();
    expect(p).toEqual({ job_role: "senco", school_name: "Oakfield Primary School" });
    await expect
      .poll(async () => (await events(t, "signup_completed"))[0] ?? null)
      .toMatchObject({ role: "senco", school: "Oakfield Primary School" });
  });

  test("skipped: both null", async ({ page }) => {
    const t = await createProfilelessTeacher("Skipped");
    teachers.push(t);
    await signIn(page, t);
    await page.goto("/complete-profile", NAV);
    await page.getByLabel("First name").fill("Skipped");
    await page.getByLabel("Surname").fill("Testcase");
    await page.getByRole("textbox", { name: "Phone number" }).fill("7700900126");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/complete-profile"), NAV);
    const { data: p } = await admin.from("profiles").select("job_role, school_name").eq("id", t.id).single();
    expect(p).toEqual({ job_role: null, school_name: null });
  });
});

test.describe("cookie banner", () => {
  // No consent cookie: the visitor has not chosen yet.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("asks first; Reject is remembered; Cookie settings asks again", async ({ page, context }) => {
    await page.goto("/", NAV);
    const banner = page.getByTestId("cookie-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Reject" }).click();
    await expect(banner).toHaveCount(0);
    expect((await context.cookies()).find((c) => c.name === "jooma_consent")?.value).toBe("rejected");

    await page.reload();
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);

    await page.getByRole("link", { name: "Cookie settings" }).click();
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await page.getByTestId("cookie-banner").getByRole("button", { name: "Accept" }).click();
    expect((await context.cookies()).find((c) => c.name === "jooma_consent")?.value).toBe("accepted");
  });

  test("signed in: the choice is saved on the profile, and Reject forgets the stored Meta ids", async ({ page }) => {
    const t = await teacher("Consent");
    await admin.from("profiles").update({ meta_fbp: "fb.1.1.1", meta_fbc: "fb.1.1.abc", ads_consent: null }).eq("id", t.id);
    await signIn(page, t);
    const consent = async () =>
      (await admin.from("profiles").select("ads_consent, meta_fbp, meta_fbc").eq("id", t.id).single()).data;

    await page.getByTestId("cookie-banner").getByRole("button", { name: "Accept" }).click();
    await expect.poll(async () => (await consent())?.ads_consent).toBe("accepted");
    expect(await consent()).toMatchObject({ meta_fbp: "fb.1.1.1" });

    await page.goto("/dashboard#cookie-settings", NAV);
    await page.getByTestId("cookie-banner").getByRole("button", { name: "Reject" }).click();
    await expect.poll(async () => (await consent())?.ads_consent).toBe("rejected");
    expect(await consent()).toMatchObject({ meta_fbp: null, meta_fbc: null });
  });

  test("signed out, the save is a quiet no-op", async ({ request }) => {
    const res = await request.post("/api/consent", { data: { choice: "accepted" } });
    expect(res.status()).toBe(204);
    const junk = await request.post("/api/consent", { data: { choice: "yes" } });
    expect(junk.status()).toBe(204);
  });

  test("no Meta script loads before a choice", async ({ page }) => {
    const meta: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("connect.facebook.net")) meta.push(r.url());
    });
    await page.goto("/", NAV);
    await expect(page.getByTestId("cookie-banner")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(meta).toEqual([]);
  });
});
