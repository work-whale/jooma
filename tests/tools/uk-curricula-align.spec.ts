import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { getCurriculum } from "@/app/lib/curricula";
import { alignmentMode } from "@/app/lib/standards";
import primary from "@/app/lib/national-curriculum/data/primary.json";
import cfeFirst from "@/app/lib/standards/data/cfe-first.json";
import nicKs1 from "@/app/lib/standards/data/nic-ks1.json";
import nicKs3 from "@/app/lib/standards/data/nic-ks3.json";
import nicKs4 from "@/app/lib/standards/data/nic-ks4.json";
import { admin, createAdmin, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * "Align to curriculum" for Scotland, Wales and Northern Ireland.
 *
 * Until their own statements were built, these three showed England's list
 * under the name "National Curriculum in England". This spec holds the line:
 *
 *   - a teacher on one of the three is never shown England's statements: they
 *     see their own, or an honest "not available yet" note (Wales has none yet)
 *   - the slides wizard keeps the UK year list for Scotland (Year 12, Year 13,
 *     Adult learners, and no Year 14), lists Northern Ireland's own years
 *     (Nursery, Year 1 to Year 14, Adult learners, no Reception), and shows the
 *     Scottish level or the Northern Irish stage beside the year
 *   - a Scotland teacher aligns a worksheet to Curriculum for Excellence, with
 *     the level and the Open Government Licence credit, and what is sent is
 *     the outcome word for word with its code
 *   - a Northern Ireland teacher does the same with the statutory requirements
 *     (Foundation Stage to Key Stage 4: Year 1 to Year 12, NI's own year list;
 *     a Year 8 teacher gets Key Stage 3, never the Learning Outcomes list),
 *     and Nursery and Year 13 say there is nothing to align to
 *   - the statements are separate chunks, fetched only when the card opens
 *
 * Teachers are admins so their regions need not be switched on. Generation and
 * the topic matcher are answered by page.route: nothing reaches a model.
 * Screenshots are taken only when SHOTS_DIR is set, before the assertions, so
 * a failing run still saves them.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A generation route, answered with a refusal once its request body is read. */
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

async function shot(page: Page, name: string, target = page.locator("body")) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await target.screenshot({ path: join(dir, `${name}.png`) });
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

const ENGLAND_STATEMENT = (primary as { statements: { id: string; text: string }[] }).statements.find(
  (s) => s.id === "y4-maths-number-fractions-01",
)!.text;

const NATIONS = [
  { id: "scotland", label: "Scottish Curriculum for Excellence" },
  { id: "wales", label: "Welsh Curriculum" },
  { id: "northern-ireland", label: "Northern Ireland Curriculum" },
];

test("a Scotland, Wales or Northern Ireland teacher is never shown England's statements", async ({ page }) => {
  const t = await teacherOn("england", "UkNations");
  await signIn(page, t);
  await noSuggestions(page);

  for (const nation of NATIONS) {
    await page.goto("/tools/worksheet-generator", NAV);
    await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("2014 National Curriculum", NAV);
    await page.getByLabel("Curriculum", { exact: true }).selectOption(nation.label);
    await page.getByLabel("Year group", { exact: true }).selectOption("Year 4");
    await page.getByLabel("Subject", { exact: true }).fill("Maths");
    await page.getByLabel("Learning objective", { exact: true }).fill("Fractions");

    const card = page.getByTestId("curriculum-alignment");
    await card.getByRole("button", { name: /Align to curriculum/ }).click();
    // Let a list or a note settle before looking.
    await expect(card.getByTestId("curriculum-not-available").or(card.getByTestId("curriculum-alignment-name"))).toBeVisible(NAV);
    await expect(card.getByText(/Loading the .* curriculum/)).toHaveCount(0, NAV);
    await shot(page, `worksheet-${nation.id}`, card);

    // Never England's name, never one of England's statements.
    await expect.soft(card).not.toContainText("National Curriculum in England");
    await expect.soft(card).not.toContainText(ENGLAND_STATEMENT);
    // Open England's Maths list if the card offers one: its statement must not be there.
    if (await card.getByLabel("Subject").count()) {
      await card.getByLabel("Subject").selectOption("Maths", { timeout: 3_000 }).catch(() => undefined);
      await expect.soft(card).not.toContainText(ENGLAND_STATEMENT);
    }

    const own = getCurriculum(nation.label)!;
    if (alignmentMode(nation.label) === "none") {
      await expect.soft(card.getByTestId("curriculum-not-available")).toContainText(own.name);
      await expect.soft(card.getByLabel("Subject")).toHaveCount(0);
    } else {
      await expect.soft(card.getByTestId("curriculum-alignment-name")).toHaveText(new RegExp(own.name));
      await expect.soft(card.getByTestId("curriculum-credits")).toBeVisible();
    }
  }
});

test("a Scotland teacher's slides wizard still offers the UK years, Year 12 and 13 included", async ({ page }) => {
  const t = await teacherOn("scotland", "UkSlides");
  await signIn(page, t);
  const asked = await noSuggestions(page);
  await page.goto(`/tools/slideshow?prefill=${encodePrefill({ slug: "slideshow", fields: { topic: "Volcanoes", year: "Year 4" } })}`, NAV);
  const wizard = page.getByRole("dialog");
  await expect(wizard).toBeVisible(NAV);
  const pill = wizard.getByRole("button", { name: "Year 4" });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.getByRole("button", { name: "Year 12", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Year 13", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adult learners", exact: true })).toBeVisible();
  // The UK list is unchanged for Scotland: Reception is there, Northern Ireland's Year 14 is not.
  await expect(page.getByRole("button", { name: "Reception", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Year 14", exact: true })).toHaveCount(0);
  await shot(page, "slides-scotland-years");

  // Step two: the card names the level beside the year, and lists Scottish areas.
  await page.getByRole("button", { name: "Year 4", exact: true }).last().click();
  await wizard.getByRole("button", { name: /^Continue/ }).click();
  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByLabel("Year", { exact: true }).locator("option:checked")).toHaveText("First level · Year 4", NAV);
  // Regression (live run, 2026-11-20): the card asked before the profile loaded, with
  // England's body, and never again for Scotland. Every ask is Scotland's.
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  for (const a of asked) expect(a).toEqual({ topic: "Volcanoes", year: "Year 4", curriculumId: "scotland" });
  await expect(card.getByLabel("Subject")).toContainText("Numeracy and mathematics", NAV);
  await expect(card).not.toContainText("National Curriculum in England");
  await shot(page, "slides-scotland-card", card);
});

test("a Scotland teacher aligns a worksheet to Curriculum for Excellence, with levels and credits", async ({ page }) => {
  const t = await teacherOn("england", "UkScotWs");
  await signIn(page, t);
  const outcome = (cfeFirst as { statements: { id: string; strand: string; text: string }[] }).statements.find((x) => x.id === "cfe-first-mnu-1-02a")!;
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/suggest-subject", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { subject: "Numeracy and mathematics", strand: outcome.strand, statementIds: [outcome.id] } });
  });
  const sent = await capture(page, "/api/worksheet-generator");

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("2014 National Curriculum", NAV);
  await page.getByLabel("Curriculum", { exact: true }).selectOption("Scottish Curriculum for Excellence");
  await page.getByLabel("Year group", { exact: true }).selectOption("Year 4");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Place value in whole numbers");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toHaveText("Curriculum for Excellence", NAV);

  // The topic matcher was asked about Scotland, not England.
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ curriculumId: "scotland", year: "Year 4", subject: "Maths" });

  const year = card.getByLabel("Year", { exact: true });
  await expect(year).toHaveValue("Year 4");
  await expect(year.locator("option:checked")).toHaveText("First level · Year 4");
  const credits = card.getByTestId("curriculum-credits");
  await expect(credits).toContainText("Open Government Licence", NAV);
  await expect(credits).toContainText("Crown copyright");

  const tick = card.getByRole("checkbox", { name: /MNU 1-02a/ });
  await expect(tick).toHaveAttribute("aria-checked", "true", NAV);
  await expect(tick).toContainText("MNU 1-02a");
  await expect(card).not.toContainText("National Curriculum in England");
  await shot(page, "worksheet-scotland-year4", card);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { curriculumName: string; countryName: string; stage: string; year: string; statements: { text: string }[] };
  expect(align).toMatchObject({ curriculumName: "Curriculum for Excellence experiences and outcomes", countryName: "Scotland", stage: "First level", year: "Year 4" });
  expect(align.statements[0].text).toBe("MNU 1-02a: " + outcome.text);
});

test("a Northern Ireland teacher aligns a worksheet to the statutory requirements", async ({ page }) => {
  const t = await teacherOn("england", "UkNiWs");
  await signIn(page, t);
  const req = (nicKs1 as { statements: { id: string; subject: string; strand: string; text: string }[] }).statements.find(
    (x) => x.text === "Use prepositions to state position",
  )!;
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/suggest-subject", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { subject: req.subject, strand: req.strand, statementIds: [req.id] } });
  });
  const sent = await capture(page, "/api/worksheet-generator");

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("2014 National Curriculum", NAV);
  await page.getByLabel("Curriculum", { exact: true }).selectOption("Northern Ireland Curriculum");
  await page.getByLabel("Year group", { exact: true }).selectOption("Year 3");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Position and direction");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toHaveText("Northern Ireland Curriculum", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ curriculumId: "northern-ireland", year: "Year 3", subject: "Maths" });

  const year = card.getByLabel("Year", { exact: true });
  await expect(year).toHaveValue("Year 3");
  await expect(year.locator("option:checked")).toHaveText("Key Stage 1 · Year 3");
  // The Key Stage 1 Areas of Learning, as the Order names them.
  await expect(card.getByLabel("Subject")).toContainText("Physical Education", NAV);
  await expect(card.getByLabel("Subject")).not.toContainText("Physical Development and Movement");
  await expect(card.getByTestId("curriculum-credits")).toContainText("Curriculum Minimum Content");
  await expect(card.getByTestId("curriculum-credits")).toContainText("Open Government Licence");

  const tick = card.getByRole("checkbox", { name: /Use prepositions to state position/ });
  await expect(tick).toHaveAttribute("aria-checked", "true", NAV);
  await expect(card).not.toContainText("National Curriculum in England");
  await shot(page, "worksheet-northern-ireland-year3", card);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { curriculumName: string; countryName: string; stage: string; year: string; statements: { text: string }[] };
  expect(align).toMatchObject({ curriculumName: "Northern Ireland Curriculum statutory requirements", countryName: "Northern Ireland", stage: "Key Stage 1", year: "Year 3" });
  // No code: the Order has none, so the text goes as it stands.
  expect(align.statements[0].text).toBe(req.text);
});

test("a Northern Ireland Year 8 teacher aligns a worksheet to the Key Stage 3 minimum content", async ({ page }) => {
  const t = await teacherOn("northern-ireland", "UkNiKs3");
  await signIn(page, t);
  const req = (nicKs3 as { statements: { id: string; subject: string; strand: string; text: string }[] }).statements.find(
    (x) => x.text === "Cells, genes and reproduction",
  )!;
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/suggest-subject", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { subject: req.subject, strand: req.strand, statementIds: [req.id] } });
  });
  const sent = await capture(page, "/api/worksheet-generator");

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Northern Ireland Curriculum", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Year 8");
  await page.getByLabel("Subject", { exact: true }).fill("Science");
  await page.getByLabel("Learning objective", { exact: true }).fill("Cells and microscopes");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toHaveText("Northern Ireland Curriculum", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ curriculumId: "northern-ireland", year: "Year 8", subject: "Science" });

  const year = card.getByLabel("Year", { exact: true });
  await expect(year).toHaveValue("Year 8");
  await expect(year.locator("option:checked")).toHaveText("Key Stage 3 · Year 8");
  // The Key Stage 3 Areas of Learning, not Key Stage 1 and 2's.
  const subjects = card.getByLabel("Subject");
  await expect(subjects).toContainText("Environment and Society", NAV);
  await expect(subjects).toContainText("Learning for Life and Work");
  await expect(subjects).not.toContainText("The World Around Us");
  await expect(card.getByTestId("curriculum-credits")).toContainText("Curriculum Minimum Content");

  const tick = card.getByRole("checkbox", { name: /Cells, genes and reproduction/ });
  await expect(tick).toHaveAttribute("aria-checked", "true", NAV);
  // Never the Learning Outcomes list repeated under every subject.
  await expect(card).not.toContainText("research and manage information effectively");
  await expect(card).not.toContainText("National Curriculum in England");
  await shot(page, "worksheet-northern-ireland-year8", card);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { curriculumName: string; stage: string; year: string; subject: string; statements: { text: string }[] };
  expect(align).toMatchObject({ curriculumName: "Northern Ireland Curriculum statutory requirements", stage: "Key Stage 3", year: "Year 8", subject: "Science and Technology" });
  expect(align.statements).toEqual([{ id: req.id, text: "Cells, genes and reproduction" }]);
});

test("a Northern Ireland teacher's year list has no Reception, and Nursery and Year 13 say there is nothing to align to", async ({ page }) => {
  const t = await teacherOn("northern-ireland", "UkNiRec");
  await signIn(page, t);
  await noSuggestions(page);
  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Northern Ireland Curriculum", NAV);
  const years = page.getByLabel("Year group", { exact: true });
  await expect(years.locator("option")).toHaveText(["Select year group", "Nursery", ...Array.from({ length: 14 }, (_, i) => `Year ${i + 1}`)]);
  await expect(years.locator("option", { hasText: "Reception" })).toHaveCount(0);

  await years.selectOption("Nursery");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Counting");
  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-not-covered")).toContainText("Nursery", NAV);
  await expect(card.getByLabel("Subject")).toHaveCount(0);
  await expect(card).not.toContainText("National Curriculum in England");
  await shot(page, "worksheet-northern-ireland-nursery", card);

  await years.selectOption("Year 13");
  await expect(card.getByTestId("curriculum-not-covered")).toContainText("Year 13", NAV);
  await expect(card.getByLabel("Subject")).toHaveCount(0);
});

test("a Northern Ireland Year 12 teacher aligns a worksheet to Key Stage 4", async ({ page }) => {
  const t = await teacherOn("northern-ireland", "UkNiKs4");
  await signIn(page, t);
  const req = (nicKs4 as { statements: { id: string; subject: string; strand: string; text: string }[] }).statements.find(
    (x) => x.text.includes("xplore self employment"),
  )!;
  const asked: Record<string, unknown>[] = [];
  await page.route("**/api/suggest-subject", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { subject: req.subject, strand: req.strand, statementIds: [req.id] } });
  });
  const sent = await capture(page, "/api/worksheet-generator");

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Northern Ireland Curriculum", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption("Year 12");
  await page.getByLabel("Subject", { exact: true }).fill("Careers");
  await page.getByLabel("Learning objective", { exact: true }).fill("Self employment");

  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-alignment-name")).toHaveText("Northern Ireland Curriculum", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  expect(asked[0]).toMatchObject({ curriculumId: "northern-ireland", year: "Year 12" });

  const year = card.getByLabel("Year", { exact: true });
  await expect(year.locator("option:checked")).toHaveText("Key Stage 4 · Year 12", NAV);
  const subjects = card.getByLabel("Subject");
  await expect(subjects).toContainText("Learning for Life and Work", NAV);
  await expect(subjects).toContainText("Physical Education");
  await expect(subjects).not.toContainText("Language and Literacy");
  await expect(card).not.toContainText("National Curriculum in England");
  await shot(page, "worksheet-northern-ireland-year12", card);

  await page.locator("[data-jo-generate]").click();
  await expect.poll(() => sent.length, NAV).toBeGreaterThan(0);
  const align = sent[0].curriculumAlign as { stage: string; year: string; subject: string; strand: string; statements: { id: string; text: string }[] };
  expect(align).toMatchObject({ stage: "Key Stage 4", year: "Year 12", subject: "Learning for Life and Work", strand: "Employability" });
  expect(align.statements).toEqual([{ id: req.id, text: req.text }]);

  // A KS2 SATs style sets the teacher's own Year 6, which is Year 7 in Northern Ireland.
  await page.goto("/tools/exam-question-generator", NAV);
  // The profile's curriculum arrives after the page opens; a style picked before it reads England's list.
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("Northern Ireland Curriculum", NAV);
  await page.getByTestId("exam-style").selectOption({ label: "KS2 SATs style: maths arithmetic" });
  await expect(page.getByLabel("Year group", { exact: true })).toHaveValue("Year 7");
});

test("a Northern Ireland teacher's slides wizard offers NI's own years", async ({ page }) => {
  const t = await teacherOn("northern-ireland", "UkNiSlides");
  await signIn(page, t);
  const asked = await noSuggestions(page);
  await page.goto(`/tools/slideshow?prefill=${encodePrefill({ slug: "slideshow", fields: { topic: "Careers", year: "Year 12" } })}`, NAV);
  const wizard = page.getByRole("dialog");
  await expect(wizard).toBeVisible(NAV);
  const pill = wizard.getByRole("button", { name: "Year 12" });
  await expect(pill).toBeVisible();
  await pill.click();
  for (const y of ["Nursery", "Year 1", "Year 14", "Adult learners"]) {
    await expect(page.getByRole("button", { name: y, exact: true }), y).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Reception", exact: true })).toHaveCount(0);
  await shot(page, "slides-northern-ireland-years");

  await page.getByRole("button", { name: "Year 12", exact: true }).last().click();
  await wizard.getByRole("button", { name: /^Continue/ }).click();
  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByLabel("Year", { exact: true }).locator("option:checked")).toHaveText("Key Stage 4 · Year 12", NAV);
  await expect.poll(() => asked.length, NAV).toBeGreaterThan(0);
  for (const a of asked) expect(a).toEqual({ topic: "Careers", year: "Year 12", curriculumId: "northern-ireland" });
  await expect(card).not.toContainText("National Curriculum in England");
  await shot(page, "slides-northern-ireland-card", card);
});

test("the statements download only when the card opens", async ({ page }) => {
  const t = await teacherOn("england", "UkLazy");
  await signIn(page, t);
  await noSuggestions(page);
  // A phrase from one Scottish outcome: it can only be in a chunk that holds cfe-first.json.
  const MARKER = "can understand the importance of zero within the system";
  const scripts = new Set<string>();
  page.on("response", (r) => {
    if (/\.js(\?|$)/.test(r.url())) scripts.add(r.url());
  });

  await page.goto("/tools/worksheet-generator", NAV);
  await expect(page.getByLabel("Curriculum", { exact: true })).toHaveValue("2014 National Curriculum", NAV);
  await page.getByLabel("Curriculum", { exact: true }).selectOption("Scottish Curriculum for Excellence");
  await page.getByLabel("Year group", { exact: true }).selectOption("Year 4");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Place value");
  await page.waitForLoadState("networkidle");

  // Curriculum and year chosen, card closed: no chunk holds the statements.
  const before = new Set(scripts);
  expect(before.size).toBeGreaterThan(0);
  for (const url of before) expect(await (await page.request.get(url)).text(), url).not.toContain(MARKER);

  // Open the card: the First level chunk is fetched, and it holds the statements.
  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByLabel("Subject")).toBeVisible(NAV);
  await card.getByLabel("Subject").selectOption("Numeracy and mathematics");
  await expect(card.getByRole("checkbox", { name: /MNU 1-02a/ })).toBeVisible(NAV);
  const added = [...scripts].filter((u) => !before.has(u));
  expect(added.length).toBeGreaterThan(0);
  let found = false;
  for (const url of added) if ((await (await page.request.get(url)).text()).includes(MARKER)) found = true;
  expect(found).toBe(true);
});
