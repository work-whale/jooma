import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Puzzle questions on the Worksheet tool: sorting, word search, crossword.
 *
 * The model writes only the words; the page builds the grids, sized for the
 * year group, and stores them. Here: the chips and the type card send the
 * puzzles, each draws on the page and on the answers page, the grid fits on
 * one page at its largest, Shuffle and an added word rebuild it and save, and
 * the sheet still exports.
 *
 * The model is never called: /api/worksheet-generator is answered by
 * page.route. NOTHING IS SPENT. The teacher and runs are real, in staging.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const WORDS = ["planet", "orbit", "comet", "star", "moon", "galaxy", "meteor", "asteroid", "telescope", "gravity", "rocket", "nebula"];

const MODEL_SHEET = {
  title: "Our solar system",
  objective: "I am learning to name the parts of the solar system.",
  intro: { variant: "fact", label: "Did you know?", text: "The Sun is a star.", emoji: "☀️" },
  sections: [
    {
      title: "Puzzles",
      emoji: "🧩",
      instructions: "Have a go at each one.",
      blocks: [
        { type: "sort", prompt: "Sort these into planets and stars.", categories: [{ name: "Planets", items: ["Mars", "Venus", "Earth"] }, { name: "Stars", items: ["Sun", "Sirius"] }], marks: 5 },
        { type: "wordsearch", prompt: "Find the space words.", words: WORDS, marks: 6 },
        {
          type: "crossword",
          prompt: "Use the clues to fill in the crossword.",
          entries: [
            { clue: "The star our planet goes round", answer: "sun" },
            { clue: "It goes round the Earth", answer: "moon" },
            { clue: "The path a planet takes", answer: "orbit" },
            { clue: "Our home planet", answer: "Earth" },
            { clue: "An icy body with a tail", answer: "comet" },
            { clue: "A pull between masses", answer: "gravity" },
            { clue: "A huge group of stars", answer: "galaxy" },
            { clue: "It carries astronauts", answer: "rocket" },
          ],
          marks: 8,
        },
      ],
    },
  ],
  teacherNotes: [{ title: "Common misconceptions", points: ["The Sun is not a planet."] }],
};

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Puzzles");
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");
const q = (page: Page, type: string) => pages(page).locator(`.js-q[data-type="${type}"]`);

async function stubModel(page: Page) {
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/worksheet-generator", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_SHEET) });
  });
  return sent;
}

async function fillBasics(page: Page, year: string) {
  await page.getByLabel("Curriculum", { exact: true }).selectOption("2014 National Curriculum", NAV);
  await page.getByLabel("Year group", { exact: true }).selectOption(year);
  await page.getByLabel("Subject", { exact: true }).fill("Science");
  await page.getByLabel("Learning objective", { exact: true }).fill("Name the parts of the solar system");
}

async function seedRun(year: string, title: string): Promise<string> {
  const doc = normalizeDraft({ ...MODEL_SHEET, title }, sheetContext("worksheet", { yearGroup: year, subject: "Science" }));
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "worksheet-generator", title, input: {}, output: serializeSheet(doc) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function storedBlocks(runId: string) {
  const { data } = await admin.from("tool_runs").select("output").eq("id", runId).single();
  return JSON.parse(data!.output as string).sections[0].blocks as Record<string, unknown>[];
}

test("Year 9, puzzle chips ticked: all three draw, the grids are full size, and the answers page shows them solved", async ({ page }) => {
  await signIn(page, teacher);
  const sent = await stubModel(page);
  await page.goto("/tools/worksheet-generator");
  await fillBasics(page, "Year 9");
  for (const name of ["Sorting / Categorising", "Word Search", "Crossword"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.locator("[data-jo-generate]").click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent[0].questionTypes).toEqual(["Sorting / Categorising", "Word Search", "Crossword"]);

  // While editing, sorting looks as pupils will get it: the bank and empty
  // columns. Its answers sit in a separate key that is never printed. (It used
  // to show each item in its column, which read as an answered sheet.)
  const editing = q(page, "sort");
  await expect(editing.locator(".js-wordbank .js-tile")).toHaveCount(5);
  await expect(editing.locator(".js-sort-col").first().locator(".js-sort-line")).toHaveCount(3);
  // Each column holds its heading and nothing else: no answers in it.
  expect((await editing.locator(".js-sort-col").allInnerTexts()).map((t) => t.trim())).toEqual(["Planets", "Stars"]);
  await expect(editing.getByTestId("sort-answer-key")).toContainText("not printed");
  await expect(editing.getByTestId("sort-answer-key").locator(".js-tile")).toHaveCount(5);
  await page.getByTestId("sheet-preview-toggle").click();

  // Sorting: the bank holds every item, and two columns of blank lines.
  const sort = q(page, "sort");
  await expect(sort.locator(".js-wordbank .js-tile")).toHaveCount(5);
  await expect(sort.getByTestId("sort-answer-key")).toHaveCount(0);
  await expect(sort.locator(".js-sort-head")).toHaveText(["Planets", "Stars"]);
  await expect(sort.locator(".js-sort-col").first().locator(".js-sort-line")).toHaveCount(3);

  // Word search: Year 9 is the hard grid, 15 by 15, with the word list.
  const ws = q(page, "wordsearch");
  await expect(ws.locator(".js-ws")).toHaveAttribute("data-cols", "15");
  await expect(ws.locator(".js-ws .js-cell")).toHaveCount(225);
  // Crossword: numbered squares, empty for pupils, clues in two lists, and no
  // word bank at Year 9.
  const cw = q(page, "crossword");
  await expect(cw.locator(".js-cw .js-cw-num").first()).toHaveText("1");
  expect((await cw.locator(".js-cw .js-cell").allInnerTexts()).join("")).toMatch(/^[\d\s]*$/);
  await expect(cw.locator(".js-cw-clues h4")).toHaveText(["Across", "Down"]);
  await expect(cw.locator(".js-wordbank")).toHaveCount(0);

  // The biggest grid sits inside its page.
  const pageBox = (await pages(page).locator(".js-page").first().boundingBox())!;
  for (const block of [ws, cw]) {
    const box = (await block.boundingBox())!;
    expect(box.height).toBeLessThan(pageBox.height - 120);
  }

  // The answers page: the sort filled in, and both grids solved.
  const answers = pages(page).locator(".js-answer");
  await expect(answers.filter({ hasText: "Planets: Mars, Venus, Earth" })).toHaveCount(1);
  await expect(pages(page).locator(".js-solved .js-ws .js-cell-on").first()).toBeVisible();
  expect((await pages(page).locator(".js-solved .js-cw .js-cell").allInnerTexts()).join("")).toMatch(/[A-Z]/);

  await page.screenshot({ path: "test-results/worksheet-puzzles-y9.png", fullPage: true });
});

test("Year 2: the word search is the easy 8 by 8 grid, and the crossword has a word bank", async ({ page }) => {
  const runId = await seedRun("Year 2", "Year 2 puzzles");
  await signIn(page, teacher);
  await page.goto(`/tools/worksheet-generator?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  // An easy grid holds 8 words at most; the rest are named while editing.
  await expect(q(page, "wordsearch").locator(".js-ws")).toHaveAttribute("data-cols", "8");
  await expect(q(page, "wordsearch").locator(".js-puzzle-note")).toContainText("Not in the grid");
  await page.getByTestId("sheet-preview-toggle").click();
  await expect(q(page, "crossword").locator(".js-wordbank .js-tile")).toHaveCount(8);
});

test("Shuffle rebuilds a grid and saves it; a new word goes into the grid", async ({ page }) => {
  const runId = await seedRun("Year 5", "Shuffle check");
  await signIn(page, teacher);
  await page.goto(`/tools/worksheet-generator?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  const before = (await storedBlocks(runId))[1].grid as string[];
  const block = pages(page).locator('.js-block[data-block="wordsearch"]');
  await block.hover();
  await block.getByRole("button", { name: "Shuffle the grid" }).click();
  await expect.poll(async () => JSON.stringify((await storedBlocks(runId))[1].grid), NAV).not.toBe(JSON.stringify(before));
  const shown = (await q(page, "wordsearch").locator(".js-ws .js-cell").allInnerTexts()).join("");
  expect(shown).toBe(((await storedBlocks(runId))[1].grid as string[]).join(""));

  // Harder makes the grid bigger.
  await block.hover();
  await block.getByRole("button", { name: "Harder grid" }).click();
  await expect(q(page, "wordsearch").locator(".js-ws")).toHaveAttribute("data-cols", "15");

  // A word added in the list is placed in the grid.
  await q(page, "wordsearch").getByRole("button", { name: "+ word" }).click();
  await expect
    .poll(async () => ((await storedBlocks(runId))[1].placements as { word: string }[]).map((p) => p.word), NAV)
    .toContain("word");
});

test("the Word search card ticks its chips and sends its type", async ({ page }) => {
  await signIn(page, teacher);
  const sent = await stubModel(page);
  await page.goto("/tools/worksheet-generator");
  await fillBasics(page, "Year 4");
  await page.getByRole("button", { name: "Puzzles and sorting", exact: true }).click();
  await expect(page.getByTestId("worksheet-type-field").getByRole("radio")).toHaveCount(3);
  await page.getByTestId("worksheet-type-field").getByRole("radio", { name: /^Word search/ }).click();
  await expect(page.getByRole("button", { name: "Word Search", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-jo-generate]").click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent[0]).toMatchObject({ template: "word-search", questionTypes: ["Word Search", "Matching", "Fill in the Blanks"] });
});

test("a puzzle sheet exports as a PDF and a Word document", async ({ page }) => {
  const runId = await seedRun("Year 6", "Puzzle export");
  await signIn(page, teacher);
  await page.goto(`/tools/worksheet-generator?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await page.getByRole("button", { name: "Export options" }).click();
  const pdf = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("menuitem", { name: /Download PDF/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);

  await page.getByRole("button", { name: "Export options" }).click();
  const docx = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("menuitem", { name: /Word/ }).click();
  expect((await docx).suggestedFilename()).toMatch(/\.docx$/);
});
