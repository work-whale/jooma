import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Stage 3 batch A on the screens (docs/curricula-stage3-build.md A.11).
 *
 *   - with the Middle East and Europe regions on but batch A off, a teacher
 *     sees none of the nine (the release switch holds them back)
 *   - with batch A on, a Saudi teacher picks their curriculum under Middle
 *     East, sees KG1 to Grade 12 and no UK-only tools, and a worksheet sends it
 *   - Türkiye is under Europe, next to Malta
 *
 * Generation requests are answered by page.route: nothing reaches a model.
 * Every switch is put back to what it was, whatever happens.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const KEYS = ["curricula_middle_east", "curricula_europe", "curricula_s3_a"] as const;

const before: Record<string, unknown> = {};
const people: TestTeacher[] = [];

async function setSwitch(key: (typeof KEYS)[number], value: boolean) {
  const { error } = await admin.from("app_settings").update({ value }).eq("key", key);
  if (error) throw new Error(`${key}: ${error.message}`);
}

/** Records each request body to `path` and refuses it, so nothing generates. */
async function capture(page: Page, path: string) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**${path}`, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Stubbed in test" } });
  });
  return bodies;
}

async function payingTeacher(name: string) {
  const t = await createTeacher(name);
  await setPlan(t, "max", "paying");
  people.push(t);
  return t;
}

test.beforeAll(async () => {
  const { data, error } = await admin.from("app_settings").select("key, value").in("key", [...KEYS]);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) before[row.key] = row.value;
  for (const key of KEYS) expect(before, `${key} exists on staging (migration 20261127000000)`).toHaveProperty(key);
});

test.afterAll(async () => {
  for (const key of KEYS) await admin.from("app_settings").update({ value: before[key] }).eq("key", key);
  for (const p of people) await deleteTeacher(p);
});

test("batch A stays hidden while its switch is off, even with its regions on", async ({ page }) => {
  const t = await payingTeacher("CurrS3Off");
  await signIn(page, t);
  await setSwitch("curricula_middle_east", true);
  await setSwitch("curricula_europe", true);
  await setSwitch("curricula_s3_a", false);

  await page.goto("/profile?section=curriculum", NAV);
  const region = page.getByTestId("curriculum-region");
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("middle-east");
  const picker = page.getByTestId("curriculum-picker");
  await expect(picker.locator("option:not([disabled])")).toHaveCount(1);
  await expect(picker.locator('option[value="uae-moe"]')).toHaveCount(1);
  await expect(picker.locator('option[value="saudi-arabia"]')).toHaveCount(0);

  await region.selectOption("europe");
  await expect(picker.locator('option[value="malta"]')).toHaveCount(1);
  await expect(picker.locator('option[value="turkey"]')).toHaveCount(0);
});

test("with batch A on, a Saudi teacher picks their curriculum, sees KG1 to Grade 12 and no UK-only tools", async ({ page }) => {
  const t = await payingTeacher("CurrS3Saudi");
  await signIn(page, t);
  await setSwitch("curricula_middle_east", true);
  await setSwitch("curricula_europe", true);
  await setSwitch("curricula_s3_a", true);

  await page.goto("/profile?section=curriculum", NAV);
  const region = page.getByTestId("curriculum-region");
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("middle-east");
  const picker = page.getByTestId("curriculum-picker");
  // The UAE plus the eight batch A countries under Middle East.
  await expect(picker.locator("option:not([disabled])")).toHaveCount(9);
  await picker.selectOption("saudi-arabia");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);
  const { data } = await admin.from("profiles").select("curriculum_id").eq("id", t.id).single();
  expect(data?.curriculum_id).toBe("saudi-arabia");

  // Türkiye sits under Europe, next to Malta.
  await region.selectOption("europe");
  await expect(picker.locator('option[value="malta"]')).toHaveCount(1);
  await expect(picker.locator('option[value="turkey"]')).toHaveCount(1);

  await page.goto("/tools", NAV);
  await expect(page.locator('a[href="/tools/worksheet-generator"]').first()).toBeVisible(NAV);
  for (const slug of ["pupil-premium-planner", "inspection-prep", "ect-report-writer", "eyfs-planner", "eyfs-action-plan"]) {
    await expect(page.locator(`a[href="/tools/${slug}"]`), slug).toHaveCount(0);
  }

  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Saudi Ministry of Education Curriculum", NAV);
  const year = page.getByLabel("Year group", { exact: true });
  await expect(year.locator("option")).toContainText(["KG1", "KG3", "Grade 1", "Grade 12"]);
  await expect(year.locator("option", { hasText: "Reception" })).toHaveCount(0);
  await expect(year.locator("option", { hasText: "Year 4" })).toHaveCount(0);
  await year.selectOption("Grade 7");
  await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await page.getByLabel("Learning objective", { exact: true }).fill("Ratios and rates");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "Saudi Ministry of Education Curriculum", yearGroup: "Grade 7" });
});
