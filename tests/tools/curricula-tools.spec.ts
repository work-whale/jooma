import { test, expect, type Page } from "@playwright/test";
import { admin, createAdmin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * The tools for a teacher on another school system (Ireland here).
 *
 *   - the five UK-only tools are not offered, and a direct link explains why
 *   - forms start from their curriculum, with its own year names
 *   - attainment bands are named in plain words, exam styles drop KS2 SATs and
 *     the GCSE boards, and Phonics drops the DfE scheme list
 *   - and a UK teacher's tools are exactly as they were
 *
 * The Irish teacher is an admin, so the region does not have to be switched on
 * for everyone. Generation is answered by page.route: nothing reaches a model.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const UK_ONLY = ["pupil-premium-planner", "inspection-prep", "ect-report-writer", "eyfs-planner", "eyfs-action-plan"];

async function capture(page: Page, path: string) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**${path}`, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Stubbed in test" } });
  });
  return bodies;
}

let irish: TestTeacher;
let english: TestTeacher;
test.beforeAll(async () => {
  irish = await createAdmin("Eire");
  await setPlan(irish, "max", "paying");
  await admin.from("profiles").update({ curriculum_id: "ireland", curriculum_confirmed_at: new Date().toISOString() }).eq("id", irish.id);
  english = await createTeacher("Eng");
  await setPlan(english, "max", "paying");
  await admin.from("profiles").update({ curriculum_id: "england", curriculum_confirmed_at: new Date().toISOString() }).eq("id", english.id);
});
test.afterAll(async () => {
  await deleteTeacher(irish);
  await deleteTeacher(english);
});

test("the UK-only tools are not offered, and a direct link says why", async ({ page }) => {
  await signIn(page, irish);
  await page.goto("/tools", NAV);
  await expect(page.locator('a[href="/tools/worksheet-generator"]').first()).toBeVisible(NAV);
  for (const slug of UK_ONLY) await expect(page.locator(`a[href="/tools/${slug}"]`), slug).toHaveCount(0);
  await expect(page.locator('a[href="/tools/phonics-support"]').first()).toBeVisible();

  await page.goto("/tools/pupil-premium-planner", NAV);
  await expect(page.getByTestId("uk-only-tool-note")).toContainText("built for schools in the UK", NAV);
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Irish Curriculum (NCCA)", NAV);
  await expect(page.getByTestId("uk-only-tool-note")).toHaveCount(0);
});

test("a form starts from their curriculum, with its year names and plain band names", async ({ page }) => {
  await signIn(page, irish);
  const sent = await capture(page, "/api/worksheet-generator");
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Irish Curriculum (NCCA)", NAV);

  const year = page.getByLabel("Year group", { exact: true });
  await expect(year.locator("option")).toContainText(["Junior Infants", "3rd Class", "Transition Year", "6th Year"]);
  await expect(year.locator("option", { hasText: "Year 4" })).toHaveCount(0);
  await year.selectOption("3rd Class");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Equivalent fractions");

  await page.getByText("Include differentiation").locator("..").getByLabel("Yes").check();
  await expect(page.getByRole("button", { name: /Expected/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^WTS/ })).toHaveCount(0);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  expect(sent[0]).toMatchObject({ curriculum: "Irish Curriculum (NCCA)", yearGroup: "3rd Class" });
});

test("exam styles and phonics schemes are England's only for England", async ({ page }) => {
  await signIn(page, irish);
  await page.goto("/tools/exam-question-generator", NAV);
  const style = page.getByTestId("exam-style");
  await expect(style).toBeEnabled(NAV);
  await expect(style.locator("option")).toHaveCount(1);
  await expect(style.locator("option", { hasText: /GCSE|SATs|AQA/ })).toHaveCount(0);

  await page.goto("/tools/phonics-support", NAV);
  const scheme = page.getByLabel(/Your phonics scheme/);
  await expect(scheme).toBeEnabled(NAV);
  await expect(scheme.locator("option")).toHaveText(["Not set", "Other (type it)"]);
});

test("a UK teacher's tools are exactly as they were", async ({ page }) => {
  await signIn(page, english);
  await page.goto("/tools", NAV);
  await expect(page.locator('a[href="/tools/worksheet-generator"]').first()).toBeVisible(NAV);
  for (const slug of UK_ONLY) await expect(page.locator(`a[href="/tools/${slug}"]`).first(), slug).toBeVisible();

  await page.goto("/tools/exam-question-generator", NAV);
  await expect(page.getByTestId("exam-style").locator("option", { hasText: /SATs/ }).first()).toBeAttached(NAV);

  await page.goto("/tools/phonics-support", NAV);
  const scheme = page.getByLabel(/Your phonics scheme/);
  await expect(scheme).toBeEnabled(NAV);
  expect(await scheme.locator("option").count()).toBeGreaterThan(2);
});
