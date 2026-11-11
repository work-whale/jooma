import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { PROFILE_LIST_FIELDS } from "@/app/lib/sheets/pupil-profile";

/*
 * One Page Profile as a designed page in the pupil's own voice, with an empty
 * photo frame and the name kept away from the model.
 *
 * The screen test answers /api/one-page-profile with page.route: NOTHING IS
 * SPENT. The LIVE test really generates on staging and is skipped unless
 * LIVE_MODEL=1.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const NAME = "Zephyr";
const word = (w: string) => new RegExp(`\\b${w}\\b`, "i");

const MODEL: Record<string, string[]> = Object.fromEntries(PROFILE_LIST_FIELDS.map((f) => [f, [`I ${f}, says [PUPIL]`]]));

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Pupilprofile");
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");

async function runs() {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "one-page-profile").order("created_at", { ascending: false });
  return data ?? [];
}

async function fillForm(page: Page) {
  await page.goto("/tools/one-page-profile");
  await expect(page.getByLabel("Name (first name only)")).toBeVisible(NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 4");
  await page.getByLabel("Name (first name only)").fill(NAME);
  await page.getByLabel("What people like and admire about the student").fill(`${NAME} is kind and ${NAME}'s drawings are brilliant`);
  await page.getByLabel("What the student needs support with").fill("Reading longer texts");
  await page.getByLabel("Outside agency input").fill("CAMHS");
}

test("a profile is written without the name or agencies reaching the model, under an empty photo frame", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs()).length;
  const sent: string[] = [];
  await page.route("**/api/one-page-profile", (route) => {
    sent.push(route.request().postData() ?? "");
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL) });
  });

  await fillForm(page);
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toMatch(word(NAME));
  expect(sent[0]).not.toContain("CAMHS");
  expect(JSON.parse(sent[0]).likes).toBe("[PUPIL] is kind and [PUPIL]'s drawings are brilliant");

  await expect(pages(page).locator(".js-title")).toHaveText(`${NAME}'s one page profile`);
  await expect(pages(page).getByTestId("photo-box")).toBeVisible();
  await expect(pages(page).locator(".js-twocol").first()).toContainText(`I likes, says ${NAME}`);
  await expect(pages(page).getByText("CAMHS")).toBeVisible();

  await expect.poll(async () => (await runs()).length, NAV).toBe(before + 1);
  const saved = JSON.parse((await runs())[0].output as string);
  expect(saved).toMatchObject({ tool: "pupilProfile", pupil: { name: NAME } });
  expect(JSON.stringify({ ...saved, pupil: null })).not.toMatch(word(NAME));

  // The photo frame can be switched off in Design.
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByTestId("sheet-design-parts").getByLabel("Photo box").uncheck();
  await expect(pages(page).getByTestId("photo-box")).toHaveCount(0);

  await page.screenshot({ path: "test-results/pupil-profile-sheet.png", fullPage: true });
});

test("LIVE: the real model writes a first-person profile with [PUPIL], never a name", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(300_000);
  await signIn(page, teacher);
  const before = (await runs()).length;
  await fillForm(page);
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 240_000 });
  await expect.poll(async () => (await runs()).length, { timeout: 60_000 }).toBe(before + 1);
  const saved = JSON.parse((await runs())[0].output as string);
  const text = JSON.stringify({ ...saved, pupil: null });
  expect(text).not.toMatch(word(NAME));
  expect(text).not.toMatch(/[–—]/);
  expect(text).toMatch(/\bI\b|\bmy\b|\bme\b/);
  await page.screenshot({ path: "test-results/pupil-profile-live.png", fullPage: true });
});
