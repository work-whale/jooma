import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { trialEndsAt } from "@/app/lib/resource-periods";

/*
 * Signed-in screenshots of the Jooma 4.5 screens, on STAGING, for the
 * before/after record (docs/screenshots/, gitignored). Not a test: skipped
 * unless SCREENSHOTS=1. Nothing is generated; accounts are throwaway.
 *
 *   SCREENSHOTS=1 npx playwright test tests/screens/v45-signed-in.spec.ts
 */

test.skip(process.env.SCREENSHOTS !== "1", "Screenshots only: set SCREENSHOTS=1");
test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const OUT = `docs/screenshots/${process.env.SHOTS_DIR ?? "2026-11-19-v45-signed-in"}/after`;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const RESOURCE_GBP = 0.0015;

const made: TestTeacher[] = [];
test.afterEach(async () => {
  for (const t of made.splice(0)) await deleteTeacher(t);
});

async function teacher(name: string, profile: Record<string, unknown>) {
  const t = await createTeacher(name);
  made.push(t);
  const { error } = await admin.from("profiles").update(profile).eq("id", t.id);
  if (error) throw error;
  return t;
}

async function freeWith(t: TestTeacher, left: number) {
  await admin.rpc("resources_start", { p_uid: t.id, p_plan: "free" });
  if (left >= 50) return;
  const { data: fx } = await admin.rpc("fx_usd_to_gbp");
  await admin.from("token_usage").insert({
    user_id: t.id,
    tool_slug: "worksheet-generator",
    model: "e2e",
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: ((50 - left) * RESOURCE_GBP) / Number(fx ?? 0.79),
  });
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);

for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    test("trial: Today on day 3 (chip) and day 8 (P1 banner)", async ({ page }) => {
      const d3 = await teacher("Tara", { plan: "pro_trial", free_trial_started_at: daysAgo(3).toISOString(), trial_ends_at: trialEndsAt(daysAgo(3)).toISOString() });
      await admin.rpc("resources_start", { p_uid: d3.id, p_plan: "pro_trial" });
      await signIn(page, d3);
      await page.goto("/dashboard");
      await expect(page.locator("body")).toContainText("in your trial", NAV);
      await shoot(page, `${label}-trial-day3-today`);

      const d8 = await teacher("Tobi", { plan: "pro_trial", free_trial_started_at: daysAgo(8).toISOString(), trial_ends_at: trialEndsAt(daysAgo(8)).toISOString() });
      await admin.rpc("resources_start", { p_uid: d8.id, p_plan: "pro_trial" });
      await page.context().clearCookies();
      await signIn(page, d8);
      await page.goto("/dashboard");
      await expect(page.getByTestId("prompt-P1")).toBeVisible(NAV);
      await shoot(page, `${label}-trial-day8-P1-banner`);
    });

    test("trial ended: P2, then Free's Today and sidebar", async ({ page }) => {
      const t = await teacher("Ellis", { plan: "pro_trial", free_trial_started_at: daysAgo(11).toISOString(), trial_ends_at: new Date(Date.now() - 3600_000).toISOString() });
      await signIn(page, t);
      await page.goto("/dashboard");
      await expect(page.getByTestId("prompt-P2")).toBeVisible(NAV);
      await shoot(page, `${label}-trial-ended-P2`);
      await page.keyboard.press("Escape");
      await page.goto("/dashboard");
      await shoot(page, `${label}-free-today`);
    });

    test("Free, running out: cost line, P3, P3b and P5", async ({ page }) => {
      const t = await teacher("Fenn", { plan: "free" });
      await freeWith(t, 12);
      await signIn(page, t);
      await page.goto("/tools/lesson-planner");
      await expect(page.getByTestId("tool-cost-line")).toBeVisible(NAV);
      await shoot(page, `${label}-free-cost-line`);
      await page.getByTestId("tool-cost-line").getByRole("button", { name: "See options" }).click();
      await expect(page.getByTestId("prompt-P3")).toBeVisible(NAV);
      await shoot(page, `${label}-free-P3`);

      const t2 = await teacher("Fable", { plan: "free" });
      await freeWith(t2, 12);
      await admin.from("app_events").insert({ user_id: t2.id, name: "credits_ran_out", props: { plan: "free", times_ran_out: 1 }, created_at: daysAgo(8).toISOString() });
      await page.context().clearCookies();
      await signIn(page, t2);
      await page.goto("/tools/lesson-planner");
      await page.getByTestId("tool-cost-line").getByRole("button", { name: "See options" }).click(NAV);
      await expect(page.getByTestId("prompt-P3b")).toBeVisible(NAV);
      await shoot(page, `${label}-free-P3b-offer`);

      const t3 = await teacher("Pia", { plan: "free" });
      await freeWith(t3, 50);
      await page.context().clearCookies();
      await signIn(page, t3);
      const prefill = Buffer.from(JSON.stringify({ slug: "slideshow", fields: { topic: "Volcanoes" } }), "utf8").toString("base64url");
      await page.goto(`/tools/slideshow?prefill=${prefill}`);
      const wizard = page.getByRole("dialog");
      await wizard.getByRole("button", { name: /^Continue$/ }).click(NAV);
      await wizard.getByRole("button", { name: /Image source/ }).click();
      await wizard.getByRole("button", { name: "Generated", exact: true }).click();
      await expect(page.getByTestId("prompt-P5")).toBeVisible(NAV);
      await shoot(page, `${label}-free-P5-pictures`);
    });

    test("plans: the picker on Free, and P12 on Pro", async ({ page }) => {
      const t = await teacher("Paz", { plan: "free" });
      await freeWith(t, 40);
      await signIn(page, t);
      await page.goto("/pricing");
      await expect(page.getByRole("button", { name: /Continue with Pro/ })).toBeVisible(NAV);
      await shoot(page, `${label}-free-plan-picker`);

      const p = await teacher("Pell", {});
      await setPlan(p, "pro", "comped");
      await admin.from("profiles").update({ payment_failed_at: new Date().toISOString() }).eq("id", p.id);
      await page.context().clearCookies();
      await signIn(page, p);
      await page.goto("/dashboard");
      await expect(page.getByTestId("prompt-P12")).toBeVisible(NAV);
      await shoot(page, `${label}-pro-P12-payment-failed`);
    });
  });
}
