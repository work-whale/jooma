import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import primary from "@/app/lib/national-curriculum/data/primary.json";
import { WORKSHEET_TEMPLATES } from "@/app/lib/sheets/worksheet-templates";

/*
 * Worksheet types and "Align to curriculum" on the Worksheet form.
 *
 * Every worksheet used to come out in the same four sections. A type now
 * shapes the sheet (an exam paper, a fluency drill) and presets the question
 * types and count, which the teacher can still change. The curriculum card from
 * the slides wizard sends the ticked statements with the request.
 *
 * The model is never called: /api/worksheet-generator and
 * /api/suggest-subject are answered by page.route. NOTHING IS SPENT. The
 * teacher and the restored run are real, in staging.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const MODEL_SHEET = {
  title: "Multiplying by one digit",
  objective: "I am learning to multiply a two-digit number by a one-digit number.",
  intro: { variant: "remember", label: "Instructions", text: "Answer all questions.", emoji: "📝" },
  sections: [
    {
      title: "Section A",
      emoji: "📝",
      instructions: "Answer all questions. 2 marks.",
      blocks: [{ type: "calc", prompt: "Work out 23 × 4", working: true, answer: "92", marks: 2 }],
    },
  ],
  teacherNotes: [{ title: "Common misconceptions", points: ["Forgetting to carry."] }],
};

const FRACTIONS = "Number: fractions (including decimals)";
const PICKS = ["y4-maths-number-fractions-01", "y4-maths-number-fractions-04"];
const textOf = (id: string) => (primary as { statements: { id: string; text: string }[] }).statements.find((s) => s.id === id)!.text;

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Types");
  // On a plan: a locked account gets the free try form, which has no curriculum card.
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

async function stub(page: Page) {
  const calls = { sheet: [] as Record<string, unknown>[], suggest: [] as Record<string, unknown>[] };
  await page.route("**/api/worksheet-generator", (route) => {
    calls.sheet.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_SHEET) });
  });
  await page.route("**/api/suggest-subject", (route) => {
    calls.suggest.push(route.request().postDataJSON());
    return route.fulfill({ json: { subject: "Maths", strand: FRACTIONS, statementIds: PICKS } });
  });
  return calls;
}

async function fillBasics(page: Page, year: string) {
  await page.getByLabel("Curriculum", { exact: true }).selectOption("2014 National Curriculum", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption(year);
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Learning objective", { exact: true }).fill("Fractions of amounts");
}

const typeCard = (page: Page, name: string) =>
  page.getByTestId("worksheet-type-field").getByRole("radio", { name: new RegExp(`^${name}`) });
const chip = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const count = (page: Page) => page.getByText("Number of questions").locator("..").locator("span.w-10");
const generate = (page: Page) => page.locator("[data-jo-generate]");

test("a type presets the question types and count, the teacher can change them, and the sheet is sent with its type", async ({ page }) => {
  await signIn(page, teacher);
  const calls = await stub(page);
  await page.goto("/tools/worksheet-generator");
  await fillBasics(page, "Year 8");

  // Classic is chosen to begin with, and leaves the mix to the model.
  await expect(typeCard(page, "Classic worksheet")).toHaveAttribute("aria-checked", "true", NAV);
  await expect(chip(page, "Multiple Choice")).toHaveAttribute("aria-pressed", "false");
  await expect(count(page)).toHaveText("10");

  // The filter narrows the cards, and All brings them back.
  await page.getByRole("button", { name: "Assess", exact: true }).click();
  await expect(page.getByTestId("worksheet-type-field").getByRole("radio")).toHaveCount(2);
  await typeCard(page, "Exam-style paper").click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByTestId("worksheet-type-field").getByRole("radio")).toHaveCount(WORKSHEET_TEMPLATES.length);

  // The exam paper's presets land on the chips and the count.
  await expect(typeCard(page, "Exam-style paper")).toHaveAttribute("aria-checked", "true");
  await expect(typeCard(page, "Classic worksheet")).toHaveAttribute("aria-checked", "false");
  for (const name of ["Multiple Choice", "Short Answer", "Essay / Open-Ended", "Numerical / Computational"]) {
    await expect(chip(page, name)).toHaveAttribute("aria-pressed", "true");
  }
  await expect(chip(page, "True/False")).toHaveAttribute("aria-pressed", "false");
  await expect(count(page)).toHaveText("12");

  // The teacher has the last word: drop a chip. The type stays.
  await chip(page, "Essay / Open-Ended").click();
  await expect(typeCard(page, "Exam-style paper")).toHaveAttribute("aria-checked", "true");

  // Year 8 is beyond what the curriculum card covers: it says so, and sends nothing.
  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByTestId("curriculum-not-covered")).toContainText("this worksheet will follow the topic and year you chose");

  await generate(page).click();
  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", NAV);
  expect(calls.sheet).toHaveLength(1);
  expect(calls.sheet[0]).toMatchObject({
    template: "exam-paper",
    questionTypes: ["Multiple Choice", "Short Answer", "Numerical / Computational"],
    questionCount: 12,
  });
  expect(calls.sheet[0].curriculumAlign).toBeUndefined();
  expect(calls.suggest).toEqual([]);

  // The exam paper starts without the objective line.
  await expect(page.getByTestId("sheet-document").locator(".js-pages")).not.toContainText("I am learning to multiply");

  // An exit ticket is three questions, below the old floor of five.
  await typeCard(page, "Exit ticket").click();
  await expect(count(page)).toHaveText("3");
});

test("Year 4: the curriculum card pre-ticks statements for the objective, and they go with the sheet word for word", async ({ page }) => {
  await signIn(page, teacher);
  const calls = await stub(page);
  await page.goto("/tools/worksheet-generator");
  await fillBasics(page, "Year 4");

  const card = page.getByTestId("curriculum-alignment");
  await expect(card).toContainText("this worksheet should teach", NAV);
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  await expect(card.getByLabel("Year")).toHaveValue("Year 4");
  await expect(card.getByLabel("Subject")).toHaveValue("Maths", NAV);
  expect(calls.suggest).toEqual([{ topic: "Fractions of amounts", year: "Year 4" }]);
  await expect(card).toContainText("2 selected statements");

  await generate(page).click();
  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", NAV);
  expect(calls.sheet[0]).toMatchObject({
    template: "classic",
    curriculumAlign: {
      curriculumName: "National Curriculum in England",
      year: "Year 4",
      stage: "Key Stage 2",
      subject: "Maths",
      strand: FRACTIONS,
      statements: PICKS.map((id) => ({ id, text: textOf(id) })),
    },
  });
});

test("a saved run restores its type and its ticked statements, and generates with them again", async ({ page }) => {
  const doc = normalizeDraft(MODEL_SHEET, sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths", template: "fluency" }));
  const { data, error } = await admin
    .from("tool_runs")
    .insert({
      user_id: teacher.id,
      tool_slug: "worksheet-generator",
      title: "Restored fluency",
      input: {
        curriculum: "2014 National Curriculum",
        yearGroup: "Year 4",
        mixed: false,
        subject: "Maths",
        learningObjective: "Fractions of amounts",
        template: "fluency",
        questionTypes: ["Numerical / Computational"],
        questionCount: 20,
        differentiate: "no",
        differentiationLevels: [],
        outputDetail: "standard",
        additionalInfo: "",
        pictures: null,
        alignCurriculum: true,
        curSelection: { year: "", subject: "Maths", strand: FRACTIONS, statementIds: [PICKS[1]] },
      },
      output: serializeSheet(doc),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await signIn(page, teacher);
  const calls = await stub(page);
  await page.goto(`/tools/worksheet-generator?run=${data.id}`);
  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", NAV);

  await expect(typeCard(page, "Fluency drill")).toHaveAttribute("aria-checked", "true", NAV);
  await expect(count(page)).toHaveText("20");
  const card = page.getByTestId("curriculum-alignment");
  // The restored ticks survive the year arriving with them.
  await expect(card).toContainText("1 selected statement", NAV);
  await expect(card.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(1);
  // A saved selection is not second-guessed by a fresh topic match.
  expect(calls.suggest).toEqual([]);

  // Change something so Generate is live again, then regenerate.
  await chip(page, "Multiple Choice").click();
  await generate(page).click();
  await expect.poll(() => calls.sheet.length, NAV).toBe(1);
  expect(calls.sheet[0]).toMatchObject({
    template: "fluency",
    questionCount: 20,
    curriculumAlign: { statements: [{ id: PICKS[1], text: textOf(PICKS[1]) }] },
  });
});

test("a free try on /create offers the types but not the curriculum card", async ({ page }) => {
  await page.goto("/create?tool=ws&topic=Fractions%2C%20Year%204");
  await expect(page.getByTestId("worksheet-type-field")).toBeVisible(NAV);
  await expect(page.getByTestId("curriculum-alignment")).toHaveCount(0);
});
