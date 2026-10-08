import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * The Worksheet tool's designed, editable sheet.
 *
 * The worksheet used to be markdown in a plain editor, with stray slashes in
 * the maths (LaTeX the page never typeset) and every question type ticked up
 * front. It is now a structure drawn as A4 pages: edited in place, restyled
 * from the Design panel, autosaved to the teacher's library, exported as the
 * same pages.
 *
 * The model is never called: /api/worksheet-generator is answered by
 * page.route with a fixed sheet. NOTHING IS SPENT. The run itself is real, in
 * staging, for a throwaway teacher.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What the model would stream, LaTeX and all: the staging failure. */
const MODEL_SHEET = {
  title: "Adding and subtracting fractions",
  objective: "I am learning to add and subtract fractions with the same denominator.",
  intro: { variant: "fact", label: "Did you know?", text: "A pizza cut into 8 slices shows eighths.", emoji: "🍕" },
  sections: [
    {
      title: "Warm up",
      emoji: "🔥",
      instructions: "Circle the right answer.",
      blocks: [
        { type: "mcq", prompt: "What is \\( \\frac{1}{4} + \\frac{2}{4} \\)?", options: ["\\( \\frac{3}{4} \\)", "3/8", "1/2", "2/4"], answers: [0], marks: 1 },
        { type: "truefalse", prompt: "True or false?", statements: [{ text: "\\( \\frac{2}{4} = \\frac{1}{2} \\)", answer: true }, { text: "5/6 < 1/6", answer: false }], marks: 2 },
      ],
    },
    {
      title: "Have a go",
      emoji: "✏️",
      instructions: "",
      blocks: [{ type: "calc", prompt: "Work out \\( \\frac{7}{8} - \\frac{3}{8} \\)", working: true, answer: "4/8", marks: 2 }],
    },
  ],
  teacherNotes: [{ title: "Misconceptions", points: ["Adding the denominators: 1/4 + 2/4 = 3/8."] }],
};

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Sheet");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

/** A worksheet run in the teacher's library, as the tool would have saved it. */
async function seedSheetRun(title = "Seeded fractions"): Promise<string> {
  const doc = normalizeDraft({ ...MODEL_SHEET, title }, sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths" }));
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "worksheet-generator", title, input: {}, output: serializeSheet(doc) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function storedSheet(runId: string) {
  const { data } = await admin.from("tool_runs").select("output").eq("id", runId).single();
  return JSON.parse(data!.output as string);
}

const sheet = (page: Page) => page.getByTestId("sheet-document");

async function openRun(page: Page, runId: string) {
  await signIn(page, teacher);
  await page.goto(`/tools/worksheet-generator?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
}

test("question types start unticked, and a generation streams in as a designed sheet with clean maths", async ({ page }) => {
  await signIn(page, teacher);

  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/worksheet-generator", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_SHEET) });
  });

  const fields = { curriculum: "2014 National Curriculum", yearGroup: "Year 4", subject: "Maths", learningObjective: "Add and subtract fractions with the same denominator" };
  await page.goto(`/tools/worksheet-generator?prefill=${encodePrefill({ slug: "worksheet-generator", fields })}`);

  // Every question type starts unticked; none is required.
  for (const name of ["Multiple Choice", "True/False", "Matching", "Short Answer", "Word Ordering"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "false", NAV);
  }
  await expect(page.getByText("None picked: you will get a mix that suits the subject.")).toBeVisible();

  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 30_000 });

  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ questionTypes: [], subject: "Maths" });

  // Clean maths: no LaTeX anywhere on the page, fractions drawn stacked.
  const text = await sheet(page).locator(".js-pages").innerText();
  expect(text).not.toMatch(/\\\(|\\frac|\\\)/);
  await expect(sheet(page).locator(".js-pages .js-frac").first()).toBeVisible();

  // The design: a title band, numbered questions, an option grid, an answers page.
  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveText("Adding and subtracting fractions");
  await expect(sheet(page).locator('.js-pages .js-q[data-type="mcq"] .js-option')).toHaveCount(4);
  await expect(sheet(page).locator(".js-pages .js-num")).toHaveText(["1", "2", "3"]);
  await expect(sheet(page).locator(".js-pages .js-answers-title")).toBeVisible();
  // The answers start a page of their own.
  const pages = sheet(page).locator(".js-pages > .js-page");
  expect(await pages.count()).toBeGreaterThanOrEqual(2);
  await expect(pages.last()).toContainText("Answers");

  // Saved to the library as a sheet, not as markdown.
  await expect
    .poll(async () => {
      const { data } = await admin.from("tool_runs").select("output").eq("user_id", teacher.id).eq("tool_slug", "worksheet-generator").order("created_at", { ascending: false }).limit(1);
      return (data?.[0]?.output as string | undefined)?.slice(0, 21);
    }, NAV)
    .toBe('{"kind":"jooma-sheet"');

  await page.screenshot({ path: "test-results/worksheet-sheet.png", fullPage: true });
});

test("an edit in place autosaves, undoes, and survives a reload", async ({ page }) => {
  const runId = await seedSheetRun();
  await openRun(page, runId);

  const title = sheet(page).locator(".js-pages h1.js-title");
  await title.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Fractions with Year 4");
  await page.keyboard.press("Enter");
  await expect(title).toHaveText("Fractions with Year 4");

  await expect(page.getByTestId("sheet-save-state")).toHaveText(/Saved/, NAV);
  expect((await storedSheet(runId)).title).toBe("Fractions with Year 4");

  // Undo puts it back, and that saves too.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toHaveText("Seeded fractions");
  await expect.poll(async () => (await storedSheet(runId)).title, NAV).toBe("Seeded fractions");

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await storedSheet(runId)).title, NAV).toBe("Fractions with Year 4");

  await page.reload();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveText("Fractions with Year 4");
});

test("add a question, mark its answer, and restyle the sheet from Design", async ({ page }) => {
  const runId = await seedSheetRun("Design check");
  await openRun(page, runId);

  // Add a true or false question to the first section.
  await sheet(page).getByRole("button", { name: "+ Add question" }).first().click();
  await page.getByRole("menuitem", { name: "True or false" }).click();
  await expect(sheet(page).locator('.js-pages .js-q[data-type="truefalse"]')).toHaveCount(2);
  await expect.poll(async () => (await storedSheet(runId)).sections[0].blocks.length, NAV).toBe(3);

  // A playful year opened on a playful theme; switch to Ledger.
  await page.getByRole("button", { name: "Design", exact: true }).click();
  const panel = page.getByTestId("sheet-design-panel");
  await panel.getByRole("tab", { name: "Professional" }).click();
  await panel.locator('[data-sheet-theme="ledger"]').click();
  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveCSS("color", "rgb(122, 31, 43)");
  await panel.getByRole("radio", { name: "XL", exact: true }).click();
  await expect.poll(async () => (await storedSheet(runId)).design, NAV).toMatchObject({ themeId: "ledger", fontScale: "xl" });

  // Switching the answers page off removes it.
  await panel.getByLabel("Answers page").uncheck();
  await expect(sheet(page).locator(".js-pages .js-answers-title")).toHaveCount(0);

  await page.screenshot({ path: "test-results/worksheet-design.png", fullPage: true });
});

test("exports the pages as a PDF and the sheet as a Word document", async ({ page }) => {
  const runId = await seedSheetRun("Export check");
  await openRun(page, runId);

  await page.getByRole("button", { name: "Export options" }).click();
  const pdf = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("menuitem", { name: /Download PDF/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);

  await page.getByRole("button", { name: "Export options" }).click();
  const docx = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("menuitem", { name: /Word/ }).click();
  expect((await docx).suggestedFilename()).toMatch(/\.docx$/);
});
