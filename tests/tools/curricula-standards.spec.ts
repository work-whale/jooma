import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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

/** A screenshot for the owner, only when SHOTS_DIR is set (gitignored folder). */
async function shot(page: Page, name: string, target = page.locator("body")) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await target.screenshot({ path: join(dir, `${name}.png`) });
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

  // Grade 3 lists Common Core ELA and maths, credited. NGSS science stays off
  // until permission (app/lib/standards/permissions.ts), so no Science and no
  // NGSS name anywhere on the card.
  const subject = card.getByLabel("Subject");
  await expect(subject.locator("option")).toHaveText(["Select subject", "English Language Arts", "Mathematics"], NAV);
  await subject.selectOption("Mathematics");
  const credits = card.getByTestId("curriculum-credits");
  await expect(credits).toContainText("National Governors Association Center for Best Practices");
  await expect(card).not.toContainText(/NGSS|Next Generation Science/);

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

test("a Queensland Year 4 teacher aligns a worksheet to a Humanities and Social Sciences statement, with its id sent and ACARA credited", async ({ page }) => {
  const t = await teacherOn("au-qld", "StdQldHass");
  await signIn(page, t);
  const sent = await capture(page, "/api/worksheet-generator");
  const asked = await noSuggestions(page);

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Australian Curriculum v9.0 (Queensland)", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Year 4");
  await page.getByLabel("Subject", { exact: true }).fill("HASS");
  await page.getByLabel("Learning objective", { exact: true }).fill("Why the first British colony was set up in 1788");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toContainText("Queensland", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ year: "Year 4", curriculumId: "au-qld", subject: "HASS" });

  // Year 4 lists the new learning areas after English, Mathematics and Science, and none of
  // the Years 7 to 10 subjects (History, Geography, Civics, Economics) or any language.
  const subject = card.getByLabel("Subject");
  await expect(subject.locator("option")).toHaveText(
    [
      "Select subject", "English", "Mathematics", "Science", "Humanities and Social Sciences", "Health and Physical Education",
      "Design and Technologies", "Digital Technologies", "Dance", "Drama", "Media Arts", "Music", "Visual Arts",
    ],
    NAV,
  );
  await subject.selectOption("Humanities and Social Sciences");

  const colony = card.getByRole("checkbox", { name: /The causes of the establishment of the first British colony in Australia in 1788/ });
  await expect(colony).toContainText("AC9HS4K02");
  await colony.click();
  await expect(colony).toHaveAttribute("aria-checked", "true");
  await shot(page, "worksheet-queensland-year4-hass", card);

  // The ACARA credit shows under the card.
  await expect(card.getByTestId("curriculum-credits")).toContainText("Australian Curriculum, Assessment and Reporting Authority");

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { statements: { id: string; text: string }[]; year: string };
  expect(align.year).toBe("Year 4");
  expect(align.statements.map((s) => s.id)).toEqual(["ac9-ac9hs4k02"]);
  expect(align.statements[0].text).toMatch(/^AC9HS4K02: The causes of the establishment of the first British colony/);
});

test("a Japan Elementary 4 teacher aligns a worksheet to the Course of Study, in Japanese as MEXT publishes it, credited", async ({ page }) => {
  const t = await teacherOn("japan", "StdJapan");
  await signIn(page, t);
  const sent = await capture(page, "/api/worksheet-generator");
  const asked = await noSuggestions(page);

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Japanese Course of Study (MEXT)", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Elementary 4");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Units of area: square centimetres and square metres");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toContainText("Japan", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ year: "Elementary 4", curriculumId: "japan" });

  // Elementary 4 has the four core subjects, named in English for the menu.
  const subject = card.getByLabel("Subject");
  await expect(subject.locator("option")).toHaveText(["Select subject", "Japanese", "Mathematics", "Science", "English"], NAV);
  await subject.selectOption("Mathematics");

  // The statement is the Course of Study's own Japanese, superscripts written in.
  const area = card.getByRole("checkbox", { name: /面積の単位（平方センチメートル（cm²）/ });
  await area.click();
  await expect(area).toHaveAttribute("aria-checked", "true");

  // A note says why it is in Japanese, and MEXT is credited under the licence.
  await expect(card.getByTestId("curriculum-language-note")).toContainText("Statements are shown in Japanese, as MEXT publishes them.");
  await expect(card.getByTestId("curriculum-credits")).toContainText("Government of Japan Standard Terms of Use (Ver. 2.0)");
  await shot(page, "worksheet-japan-elementary4-maths", card);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { curriculumName: string; countryName: string; year: string; statements: { id: string; text: string }[] };
  expect(align).toMatchObject({ curriculumName: "Course of Study (MEXT)", countryName: "Japan", year: "Elementary 4" });
  expect(align.statements).toEqual([
    { id: "jp-cos-10e5f805c0", text: "面積の単位（平方センチメートル（cm²），平方メートル（m²），平方キロメートル（km²））について知ること。" },
  ]);
});

test("a Norway Grade 5 teacher aligns a worksheet to an LK20 competence aim, in Udir's English, credited under NLOD", async ({ page }) => {
  const t = await teacherOn("norway", "StdNorway");
  await signIn(page, t);
  const sent = await capture(page, "/api/worksheet-generator");
  const asked = await noSuggestions(page);

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Norwegian Curriculum (LK20)", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Grade 5");
  await page.getByLabel("Subject", { exact: true }).fill("matematikk");
  await page.getByLabel("Learning objective", { exact: true }).fill("Fractions, decimals and percentages");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toContainText("Norway", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ year: "Grade 5", curriculumId: "norway" });

  const subject = card.getByLabel("Subject");
  await expect(subject.locator("option")).toHaveText(["Select subject", "Norwegian", "Mathematics", "Science", "English"], NAV);
  await subject.selectOption("Mathematics");
  const aim = card.getByRole("checkbox", { name: /use numbers, drawings, and tangible objects to describe and explore the relationships between fractions, decimals, and percentages/ });
  await aim.click();
  await expect(aim).toHaveAttribute("aria-checked", "true");

  // In English, so no language note; NLOD's credit is shown.
  await expect(card.getByTestId("curriculum-language-note")).toHaveCount(0);
  await expect(card.getByTestId("curriculum-credits")).toContainText("Contains data under NLOD (https://data.norge.no/nlod/en), made available on data.udir.no.");
  await shot(page, "worksheet-norway-grade5-maths", card);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { curriculumName: string; countryName: string; year: string; statements: { id: string; text: string }[] };
  expect(align).toMatchObject({ curriculumName: "LK20 curricula (Udir)", countryName: "Norway", year: "Grade 5" });
  expect(align.statements).toEqual([
    { id: "no-lk20-km13265", text: "use numbers, drawings, and tangible objects to describe and explore the relationships between fractions, decimals, and percentages" },
  ]);
});

test("a Taiwan Grade 8 teacher aligns a worksheet to the Curriculum Guidelines, maths in Chinese with its code, English and science in official English", async ({ page }) => {
  const t = await teacherOn("taiwan", "StdTaiwan");
  await signIn(page, t);
  const sent = await capture(page, "/api/worksheet-generator");
  const asked = await noSuggestions(page);

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Taiwan 12-Year Basic Education Curriculum (108 curriculum)", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Grade 8");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Pythagoras' theorem");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toContainText("Taiwan", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ year: "Grade 8", curriculumId: "taiwan" });

  // Grade 8 has the four core subjects from both frameworks, named in English for the menu.
  const subject = card.getByLabel("Subject");
  await expect(subject.locator("option")).toHaveText(["Select subject", "Mandarin", "Mathematics", "English", "Science"], NAV);

  // English is the official English translation.
  await subject.selectOption("English");
  await expect(card.getByRole("checkbox", { name: /Can say the words learned in class\./ }).first()).toBeVisible();

  // Maths is the Chinese text as published, with its code.
  await subject.selectOption("Mathematics");
  const pythagoras = card.getByRole("checkbox", { name: /畢氏定理：畢氏定理（勾股弦定理、商高定理）的意義及其數學史/ });
  await expect(pythagoras).toContainText("S-8-6");
  await pythagoras.click();
  await expect(pythagoras).toHaveAttribute("aria-checked", "true");

  // A note says which are in Chinese; both credits name NAER's declaration.
  await expect(card.getByTestId("curriculum-language-note")).toContainText("Mandarin and mathematics statements are shown in Chinese");
  const credits = card.getByTestId("curriculum-credits");
  await expect(credits).toContainText("Statements are excerpts from the official Chinese text");
  await expect(credits).toContainText("https://www.naer.edu.tw/PageDoc?fid=324");
  await shot(page, "worksheet-taiwan-grade8-maths", card);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { curriculumName: string; countryName: string; year: string; statements: { id: string; text: string }[] };
  expect(align).toMatchObject({ curriculumName: "Curriculum Guidelines of 12-Year Basic Education", countryName: "Taiwan", year: "Grade 8" });
  expect(align.statements).toEqual([
    {
      id: "tw-108-zh-ce31a3ca1d",
      text: "S-8-6: 畢氏定理：畢氏定理（勾股弦定理、商高定理）的意義及其數學史；畢氏定理在生活上的應用；三邊長滿足畢氏定理的三角形必定是直角三角形。",
    },
  ]);
});
