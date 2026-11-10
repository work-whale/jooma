import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * The Quiz: one right answer, several, or true or false; edited in place and
 * saved into ONE run; printed through the sheet renderer; presented on the
 * board; exported to the quiz platforms.
 *
 * The screen tests answer /api/quiz-generator with page.route: NOTHING IS
 * SPENT. The last test is the live run, skipped unless LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const QUESTIONS = [
  { type: "single", question: "Which gas do plants take in?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"], answers: [1], explanation: "Plants use carbon dioxide to make glucose." },
  { type: "multiple", question: "Which two are products of photosynthesis? Choose two.", options: ["Glucose", "Oxygen", "Water", "Carbon dioxide"], answers: [0, 1], explanation: "Glucose and oxygen are made." },
  { type: "truefalse", question: "Photosynthesis happens in the chloroplasts.", options: ["True", "False"], answers: [0], explanation: "Chlorophyll is in the chloroplasts." },
];
const ADDED = { type: "single", question: "What colour is chlorophyll?", options: ["Red", "Green", "Blue", "Yellow"], answers: [1], explanation: "" };

const FIELDS = { curriculum: "2014 National Curriculum", yearGroup: "Year 8", subject: "Science", topic: "Photosynthesis", answerType: "mixed", timeLimit: 20 };

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Quizzes");
  await setPlan(teacher, "pro", "comped");
});
test.afterAll(async () => deleteTeacher(teacher));

async function quizRuns() {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "quiz-generator").order("created_at", { ascending: false });
  return data ?? [];
}

/** Answers each action with a fixed result; refine fails, so its error shows. */
async function mockQuiz(page: Page, sent: Record<string, unknown>[]) {
  await page.route("**/api/quiz-generator", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    if (body.action === "add") return route.fulfill({ json: { title: "", questions: [ADDED] } });
    if (body.action === "refine") return route.fulfill({ status: 500, json: { error: "The model was busy" } });
    return route.fulfill({ json: { title: "Photosynthesis check", questions: QUESTIONS } });
  });
}

async function generate(page: Page, sent: Record<string, unknown>[]) {
  await mockQuiz(page, sent);
  await signIn(page, teacher);
  await page.goto(`/tools/quiz-generator?prefill=${encodePrefill({ slug: "quiz-generator", fields: FIELDS })}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(page.getByTestId("quiz-card")).toHaveCount(3, NAV);
}

test("a mixed quiz is saved once, and every later change goes into that same run", async ({ page }) => {
  const before = (await quizRuns()).length;
  const sent: Record<string, unknown>[] = [];
  await generate(page, sent);
  expect(sent[0]).toMatchObject({ action: "generate", answerType: "mixed", topic: "Photosynthesis" });

  // Each type edits as itself: tick boxes for two answers, fixed True and False.
  await expect(page.getByLabel("Question 2 type")).toHaveValue("multiple");
  await expect(page.getByTestId("quiz-card").nth(1).locator('input[type="checkbox"]:checked')).toHaveCount(2);
  await expect(page.getByLabel("Question 3 type")).toHaveValue("truefalse");

  await expect.poll(async () => (await quizRuns()).length, NAV).toBe(before + 1);
  const runId = (await quizRuns())[0].id;

  // Add a generated question, and edit one by hand.
  await page.getByRole("button", { name: "Add a generated question" }).click();
  await expect(page.getByTestId("quiz-card")).toHaveCount(4, NAV);
  await page.getByLabel("Question 1", { exact: true }).fill("Which gas do plants absorb?");
  expect(sent.find((b) => b.action === "add")).toBeTruthy();

  await expect
    .poll(async () => {
      const rows = await quizRuns();
      const out = JSON.parse(rows.find((r) => r.id === runId)!.output as string);
      return { runs: rows.length, kind: out.kind, count: out.questions.length, first: out.questions[0].question, time: out.timeLimit };
    }, NAV)
    .toEqual({ runs: before + 1, kind: "jooma-quiz", count: 4, first: "Which gas do plants absorb?", time: 20 });

  // A refine that fails says so, and changes nothing.
  await page.getByPlaceholder(/add a starter activity|for example/i).first().fill("Make it harder");
  await page.getByRole("button", { name: /^refine/i }).click();
  await expect(page.getByTestId("quiz-error")).toContainText("That change did not work", NAV);
  await expect(page.getByTestId("quiz-card")).toHaveCount(4);
});

test("printable pages, presenting on the board, and the platform files", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  await generate(page, sent);

  // Printable: designed pages with the answer key on the last one.
  await page.getByRole("tab", { name: "Printable" }).click();
  const sheet = page.getByTestId("sheet-document");
  await expect(sheet).toHaveAttribute("data-ready", "true", NAV);
  await expect(sheet.locator(".js-pages .js-q")).toHaveCount(3);
  await expect(sheet.locator(".js-pages > .js-page").last()).toContainText("Answers");
  await expect(sheet.locator(".js-pages")).toContainText("Choose two.");
  await expect(sheet.locator(".js-pages")).not.toContainText("(Tick 2.)");

  // Present: reveal, explanation, next, countdown, close.
  await page.getByTestId("quiz-present").click();
  const presenter = page.getByTestId("quiz-presenter");
  await expect(presenter).toBeVisible(NAV);
  await expect(page.getByTestId("quiz-question")).toHaveText("Which gas do plants take in?");
  await expect(page.getByTestId("quiz-timer")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(presenter.locator('[data-correct="true"]')).toHaveCount(1);
  await expect(page.getByTestId("quiz-explanation")).toContainText("carbon dioxide to make glucose");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("quiz-progress")).toHaveText("Question 2 of 3");
  await page.getByTestId("quiz-advance").click();
  await expect(presenter.locator('[data-correct="true"]')).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(presenter).toHaveCount(0);

  // Kahoot: a real workbook with the questions from row 9.
  const [kahoot] = await Promise.all([page.waitForEvent("download"), (async () => {
    await page.getByRole("button", { name: "Download options" }).first().click();
    await page.getByRole("menuitem", { name: "Kahoot (Excel)" }).click();
  })()]);
  expect(kahoot.suggestedFilename()).toBe("kahoot-photosynthesis-check.xlsx");
  const zip = await JSZip.loadAsync(readFileSync((await kahoot.path())!));
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  expect(xml).toContain('r="B9"');
  expect(xml).toContain("Which gas do plants take in?");

  // Gimkit takes one right answer, so the two answer question is left out, and the teacher is told.
  const [gimkit] = await Promise.all([page.waitForEvent("download"), (async () => {
    await page.getByRole("button", { name: "Download options" }).first().click();
    await page.getByRole("menuitem", { name: "Gimkit (CSV)" }).click();
  })()]);
  const csv = readFileSync((await gimkit.path())!, "utf8");
  expect(csv).toContain("Gimkit Spreadsheet Import Template");
  expect(csv).not.toContain("Choose two");
  await expect(page.getByTestId("quiz-export-notice")).toContainText("1 question left out", NAV);

  await page.screenshot({ path: "test-results/quiz.png", fullPage: true });
});

test("on a phone the quiz fits the screen: nothing scrolls sideways", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  await generate(page, sent);
  // Generated at desktop width (Jo's prompt sits elsewhere on a phone), then
  // looked at on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByTestId("jo-fab")).toBeInViewport();
});

// ── The live run ────────────────────────────────────────────────────────────

test("LIVE: the real model writes a mixed quiz that fits the schema", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(300_000);
  await signIn(page, teacher);
  const before = (await quizRuns()).length;
  await page.goto(`/tools/quiz-generator?prefill=${encodePrefill({ slug: "quiz-generator", fields: { ...FIELDS, numQuestions: 6 } })}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(page.getByTestId("quiz-card").first()).toBeVisible({ timeout: 240_000 });

  await expect.poll(async () => (await quizRuns()).length, { timeout: 60_000 }).toBe(before + 1);
  const quiz = JSON.parse((await quizRuns())[0].output as string);
  expect(quiz.kind).toBe("jooma-quiz");
  expect(quiz.questions.length).toBeGreaterThanOrEqual(5);
  for (const q of quiz.questions) {
    expect(["single", "multiple", "truefalse"]).toContain(q.type);
    expect(q.answers.length).toBeGreaterThanOrEqual(1);
    for (const a of q.answers) expect(a).toBeLessThan(q.options.length);
    if (q.type === "truefalse") expect(q.options).toEqual(["True", "False"]);
    if (q.type === "multiple") expect(q.answers.length).toBeGreaterThanOrEqual(2);
  }
  await page.screenshot({ path: "test-results/quiz-live.png", fullPage: true });
});
