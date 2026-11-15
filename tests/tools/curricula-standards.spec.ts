import { test, expect, type Page } from "@playwright/test";
import { admin, createAdmin, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * "Align to curriculum" outside England: published standards by year, with
 * their codes and licence credits, and what a generation sends.
 *
 *   - a California teacher aligns a worksheet to Common Core statements
 *   - a Texas teacher (the state's own standards) gets an honest "not yet"
 *   - the slides wizard offers the teacher's own year names
 *
 * Teachers are admins so their regions need not be switched on. Generation and
 * the topic matcher are answered by page.route: nothing reaches a model.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function capture(page: Page, path: string) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**${path}`, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Stubbed in test" } });
  });
  return bodies;
}

/** The topic matcher, answered with "no match" so the card waits for the teacher. */
async function noSuggestions(page: Page) {
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/suggest-subject", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { subject: "", strand: "", statementIds: [] } });
  });
  return asked;
}

const people: TestTeacher[] = [];
async function teacherOn(curriculumId: string, name: string) {
  const t = await createAdmin(name);
  people.push(t);
  await setPlan(t, "max", "paying");
  await admin.from("profiles").update({ curriculum_id: curriculumId, curriculum_confirmed_at: new Date().toISOString() }).eq("id", t.id);
  return t;
}
test.afterAll(async () => {
  for (const p of people) await deleteTeacher(p);
});

test("a California teacher aligns a worksheet to Common Core, with codes and credits", async ({ page }) => {
  const t = await teacherOn("us-ca", "StdCa");
  await signIn(page, t);
  const sent = await capture(page, "/api/worksheet-generator");
  const asked = await noSuggestions(page);

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue(/^California: /, NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Grade 3");
  await page.getByLabel("Subject", { exact: true }).fill("Math");
  await page.getByLabel("Learning objective", { exact: true }).fill("Round whole numbers to the nearest 10");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toContainText("California", NAV);
  await expect(card.getByLabel("Year", { exact: true })).toHaveValue("Grade 3");

  // The topic matcher was asked about this curriculum's standards.
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ year: "Grade 3", curriculumId: "us-ca" });

  // Grade 3 lists Common Core ELA and maths and NGSS, each credited.
  const subject = card.getByLabel("Subject");
  await expect(subject.locator("option")).toContainText(["English Language Arts", "Mathematics", "Science"], NAV);
  await subject.selectOption("Mathematics");
  const credits = card.getByTestId("curriculum-credits");
  await expect(credits).toContainText("National Governors Association Center for Best Practices");
  await expect(credits).toContainText("NGSS is a registered trademark of WestEd");

  const round = card.getByRole("checkbox", { name: /Use place value understanding to round whole numbers/ });
  await expect(round).toContainText("3.NBT.A.1");
  await round.click();
  await expect(round).toHaveAttribute("aria-checked", "true");

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { curriculumName: string; statements: { text: string }[]; countryName: string; year: string };
  expect(align).toMatchObject({ curriculumName: "Common Core State Standards for Mathematics", countryName: "California", year: "Grade 3" });
  expect(align.statements[0].text).toMatch(/^3\.NBT\.A\.1: Use place value understanding to round whole numbers/);
});

test("a state with its own standards is told alignment is not available yet", async ({ page }) => {
  const t = await teacherOn("us-tx", "StdTx");
  await signIn(page, t);
  await noSuggestions(page);
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue(/^Texas: /, NAV);
  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-not-available")).toContainText("TEKS");
  await expect(card.getByLabel("Subject")).toHaveCount(0);
});

test("the slides wizard offers the teacher's own year names, and Jo's year is fitted to them", async ({ page }) => {
  const t = await teacherOn("us-ca", "StdSlides");
  await signIn(page, t);
  // Jo would send England's year for "a Year 4 class": the wizard shows Grade 3.
  await page.goto(`/tools/slideshow?prefill=${encodePrefill({ slug: "slideshow", fields: { topic: "Volcanoes", year: "Grade 3" } })}`, NAV);
  const wizard = page.getByRole("dialog");
  await expect(wizard).toBeVisible(NAV);
  const pill = wizard.getByRole("button", { name: "Grade 3" });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.getByRole("button", { name: "Kindergarten", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adult learners", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Year 4", exact: true })).toHaveCount(0);
});
