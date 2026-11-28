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
 *   - batch B: with Asia on, its nine wait for their own switch; then a
 *     Japanese teacher sees Elementary 1 to Senior High 3
 *   - batch C: a French teacher who never chose a language is switched to
 *     French on picking France, sees CP to Terminale, and the worksheet
 *     request carries both
 *   - batch D: with Latin America on and batch D off, the region is not
 *     offered; with batch D on, a Mexican teacher picks Mexico, is switched
 *     to Spanish, sees Preescolar to Bachillerato, and the request carries both
 *   - batch E: with Africa on and batch E off, Africa lists the Stage 2 five;
 *     with batch E on, a Tanzanian teacher picks Tanzania, keeps English and
 *     sees Standard 1 to Form 6
 *
 * Generation requests are answered by page.route: nothing reaches a model.
 * Every switch is put back to what it was, whatever happens.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const KEYS = ["curricula_middle_east", "curricula_europe", "curricula_asia", "curricula_latin_america", "curricula_s3_a", "curricula_s3_b", "curricula_s3_c", "curricula_s3_d", "curricula_africa", "curricula_s3_e"] as const;

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
  for (const key of KEYS) expect(before, `${key} exists on staging (migrations 20261127000000 and 20261128000000)`).toHaveProperty(key);
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

test("batch B: Asia shows its nine only with the batch B switch, and a Japanese teacher gets Japan's years", async ({ page }) => {
  const t = await payingTeacher("CurrS3Japan");
  await signIn(page, t);
  await setSwitch("curricula_asia", true);
  await setSwitch("curricula_s3_a", true);
  await setSwitch("curricula_s3_b", false);

  await page.goto("/profile?section=curriculum", NAV);
  const region = page.getByTestId("curriculum-region");
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("asia");
  const picker = page.getByTestId("curriculum-picker");
  // Batch A being on does not let batch B through: only the Stage 2 six.
  await expect(picker.locator("option:not([disabled])")).toHaveCount(6);
  await expect(picker.locator('option[value="japan"]')).toHaveCount(0);

  await setSwitch("curricula_s3_b", true);
  await page.reload();
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("asia");
  await expect(picker.locator("option:not([disabled])")).toHaveCount(15);
  await picker.selectOption("japan");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);

  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Japanese Course of Study (MEXT)", NAV);
  const year = page.getByLabel("Year group", { exact: true });
  await expect(year.locator("option")).toContainText(["Elementary 1", "Junior High 2", "Senior High 3"]);
  await expect(year.locator("option", { hasText: "Year 4" })).toHaveCount(0);
  await year.selectOption("Junior High 2");
  await page.getByLabel("Subject", { exact: true }).fill("Science");
  await page.getByLabel("Learning objective", { exact: true }).fill("Plant cells and animal cells");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "Japanese Course of Study (MEXT)", yearGroup: "Junior High 2" });
});

test("batch C: a French teacher picks France, is switched to French output, and sees CP to Terminale", async ({ page }) => {
  const t = await payingTeacher("CurrS3France");
  await signIn(page, t);
  await setSwitch("curricula_europe", true);
  await setSwitch("curricula_s3_a", false);
  await setSwitch("curricula_s3_c", true);

  await page.goto("/profile?section=curriculum", NAV);
  // Never chose a language in this browser.
  await page.evaluate(() => localStorage.removeItem("ll:language"));
  await page.reload();
  const region = page.getByTestId("curriculum-region");
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("europe");
  const picker = page.getByTestId("curriculum-picker");
  // Malta plus the twenty-nine (Turkiye stays hidden with batch A off).
  await expect(picker.locator("option:not([disabled])")).toHaveCount(30);
  await expect(picker.locator('option[value="turkey"]')).toHaveCount(0);
  await picker.selectOption("france");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ll:language")), NAV).toBe(JSON.stringify("fr"));

  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("French National Curriculum (programmes scolaires)", NAV);
  const year = page.getByLabel("Year group", { exact: true });
  await expect(year.locator("option")).toContainText(["PS", "CP", "CM2", "6e", "Terminale"]);
  await expect(year.locator("option", { hasText: "Year 4" })).toHaveCount(0);
  await year.selectOption("CM1");
  await page.getByLabel("Subject", { exact: true }).fill("Mathématiques");
  await page.getByLabel("Learning objective", { exact: true }).fill("Les fractions simples");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "French National Curriculum (programmes scolaires)", yearGroup: "CM1", language: "fr" });
});

test("batch D: Latin America waits for its switch, then a Mexican teacher picks Mexico and is switched to Spanish", async ({ page }) => {
  const t = await payingTeacher("CurrS3Mexico");
  await signIn(page, t);
  await setSwitch("curricula_latin_america", true);
  await setSwitch("curricula_s3_d", false);

  await page.goto("/profile?section=curriculum", NAV);
  const region = page.getByTestId("curriculum-region");
  await expect(region).toBeEnabled(NAV);
  // The region is on but holds only batch D, so it has nothing to offer yet.
  await expect(region.locator('option[value="latin-america"]')).toHaveCount(0);

  await setSwitch("curricula_s3_d", true);
  // Never chose a language in this browser.
  await page.evaluate(() => localStorage.removeItem("ll:language"));
  await page.reload();
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("latin-america");
  const picker = page.getByTestId("curriculum-picker");
  await expect(picker.locator("option:not([disabled])")).toHaveCount(6);
  await picker.selectOption("mexico");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ll:language")), NAV).toBe(JSON.stringify("es"));

  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Mexican Curriculum (Nueva Escuela Mexicana)", NAV);
  const year = page.getByLabel("Year group", { exact: true });
  await expect(year.locator("option")).toContainText(["Preescolar 1", "Primaria 4", "Secundaria 3", "Bachillerato 3"]);
  await expect(year.locator("option", { hasText: "Year 4" })).toHaveCount(0);
  await year.selectOption("Primaria 4");
  await page.getByLabel("Subject", { exact: true }).fill("Matemáticas");
  await page.getByLabel("Learning objective", { exact: true }).fill("Fracciones con el mismo denominador");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "Mexican Curriculum (Nueva Escuela Mexicana)", yearGroup: "Primaria 4", language: "es" });
});

test("batch E: Africa lists its Stage 2 five until batch E is on, then a Tanzanian teacher picks Tanzania and stays in English", async ({ page }) => {
  const t = await payingTeacher("CurrS3Tanzania");
  await signIn(page, t);
  await setSwitch("curricula_africa", true);
  await setSwitch("curricula_s3_e", false);

  await page.goto("/profile?section=curriculum", NAV);
  const region = page.getByTestId("curriculum-region");
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("africa");
  const picker = page.getByTestId("curriculum-picker");
  await expect(picker.locator("option:not([disabled])")).toHaveCount(5);
  await expect(picker.locator('option[value="tanzania"]')).toHaveCount(0);

  await setSwitch("curricula_s3_e", true);
  await page.evaluate(() => localStorage.removeItem("ll:language"));
  await page.reload();
  await expect(region).toBeEnabled(NAV);
  await region.selectOption("africa");
  await expect(picker.locator("option:not([disabled])")).toHaveCount(10);
  await picker.selectOption("tanzania");
  await page.getByTestId("curriculum-save").click();
  await expect(page.getByTestId("curriculum-status")).toContainText("Saved", NAV);
  // English default: picking Tanzania sets no other language.
  expect(await page.evaluate(() => localStorage.getItem("ll:language"))).toBeNull();

  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Tanzanian Curriculum (Tanzania Institute of Education)", NAV);
  const year = page.getByLabel("Year group", { exact: true });
  await expect(year.locator("option")).toContainText(["Pre-primary", "Standard 1", "Standard 7", "Form 1", "Form 6"]);
  await expect(year.locator("option", { hasText: "Year 4" })).toHaveCount(0);
  await year.selectOption("Standard 4");
  await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await page.getByLabel("Learning objective", { exact: true }).fill("Adding fractions with the same denominator");
  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBe(1);
  expect(sent[0]).toMatchObject({ curriculum: "Tanzanian Curriculum (Tanzania Institute of Education)", yearGroup: "Standard 4" });
  expect(sent[0].language ?? "en-GB").toBe("en-GB");
});
