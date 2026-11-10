import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, seedResource, setPlan, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Lesson Plan as a designed, editable plan: the model writes one fixed shape,
 * the page arranges it in the chosen layout (UK 3-part or learning cycles)
 * with timings that add up, and the plan can be switched between layouts and
 * carried into slides, a worksheet or a quiz.
 *
 * The screen tests answer /api/lesson-planner with page.route and a fixed
 * plan: NOTHING IS SPENT. The last test is the one live run: it really
 * generates on staging and is skipped unless LIVE_MODEL=1, so run it when the
 * prompt or schema changes (a mock never proves the model accepts the schema).
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What the model would stream. Its timings add to 70, not the 60 asked for. */
const MODEL_PLAN = {
  title: "Adding fractions",
  objective: "To add fractions with the same denominator",
  successCriteria: ["Identify the denominator", "Add the numerators"],
  keywords: [{ term: "numerator", definition: "The top number" }],
  priorKnowledge: ["Know what a fraction is"],
  keyLearningPoints: ["Only the numerators are added"],
  misconceptions: [{ misconception: "Adding the denominators", response: "Model with fraction strips" }],
  phases: [
    { stage: "starter", title: "Fraction recall", minutes: 10, teacher: "Show fractions", pupils: "Name them", check: ["What is 1/2?"], feedback: "", support: "Strips", challenge: "", ta: "" },
    { stage: "main", title: "Modelling", minutes: 25, teacher: "Model 1/5 + 2/5", pupils: "Follow along", check: ["Why does the 5 stay?"], feedback: "", support: "", challenge: "", ta: "Works with group A" },
    { stage: "main", title: "Practice", minutes: 25, teacher: "Circulate", pupils: "Ten questions", check: [], feedback: "Peer check", support: "", challenge: "Three fractions", ta: "" },
    { stage: "plenary", title: "Exit check", minutes: 10, teacher: "Ask", pupils: "Answer", check: [], feedback: "", support: "", challenge: "", ta: "" },
  ],
  starterQuiz: [{ prompt: "What is the bottom number called?", options: ["Numerator", "Denominator"], answer: 1 }],
  exitQuiz: [{ prompt: "1/5 + 2/5 =", options: ["3/10", "3/5"], answer: 1 }],
  assessment: ["Exit quiz"],
  resources: ["Fraction strips"],
  teacherNotes: [],
};

const FIELDS = { curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Maths", topic: "Fractions", learningObjective: "Add fractions with the same denominator" };

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Lessonplan");
  // A teacher with no plan is sent to /free-tools, a different form.
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");

async function lessonRuns() {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "lesson-planner").order("created_at", { ascending: false });
  return data ?? [];
}

async function seedPlanRun(): Promise<string> {
  const doc = normalizeDraft(MODEL_PLAN, sheetContext("lesson", { ...FIELDS, layout: "three-part", lessonLength: 60 }));
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "lesson-planner", title: "Seeded plan", input: { ...FIELDS, layout: "three-part", lessonLength: 60 }, output: serializeSheet(doc) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

test("a plan streams in as timed, designed pages and is saved once, as a plan", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await lessonRuns()).length;

  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/lesson-planner", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_PLAN) });
  });

  await page.goto(`/tools/lesson-planner?prefill=${encodePrefill({ slug: "lesson-planner", fields: FIELDS })}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ layout: "three-part", lessonLength: 60, topic: "Fractions" });

  await expect(pages(page).locator(".js-section-title")).toHaveText(["Overview", "Starter", "Main teaching", "Plenary", "Assessment", "Resources"]);
  await expect(pages(page).locator(".js-subtitle")).toHaveText(/60 minutes/i);
  // The model's 70 minutes fitted to the 60 minute lesson: the plenary ends at 1:00.
  await expect(pages(page).locator(".js-phase")).toHaveCount(4);
  await expect(pages(page).locator(".js-phase-clock").first()).toHaveText("0:00 to 0:09");
  await expect(pages(page).locator(".js-phase-clock").last()).toHaveText(/to 1:00$/);
  await expect(pages(page).locator('.js-list[data-style="check"] li:not(.js-list-add)')).toHaveCount(2);
  await expect(pages(page).locator(".js-answers-title")).toHaveText("Quiz answers and teacher notes");
  await expect(page.getByTestId("lesson-timing-warning")).toHaveCount(0);
  await expect(page.getByTestId("lesson-handoffs").getByRole("link")).toHaveText(["Make slides", "Make a worksheet", "Make a quiz"]);

  // Saved exactly once, as a plan that knows its layout and length.
  await expect.poll(async () => (await lessonRuns()).length, NAV).toBe(before + 1);
  const saved = JSON.parse((await lessonRuns())[0].output as string);
  expect(saved).toMatchObject({ kind: "jooma-sheet", tool: "lesson", lesson: { layout: "three-part", minutes: 60, topic: "Fractions" } });

  await page.screenshot({ path: "test-results/lesson-plan-sheet.png", fullPage: true });
});

test("switching to learning cycles in Design rearranges the same plan and saves it in place", async ({ page }) => {
  const runId = await seedPlanRun();
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByTestId("sheet-design-panel").getByRole("radio", { name: "Learning cycles" }).click();

  await expect(pages(page).locator(".js-section-title")).toHaveText(["Overview", "Starter quiz", "Learning cycle 1", "Learning cycle 2", "Exit quiz", "Assessment", "Resources"]);
  await expect(pages(page).locator(".js-phase-row dt").filter({ hasText: "Explain" }).first()).toBeVisible();
  // Same phases, same words.
  await expect(pages(page).locator(".js-phase-title")).toHaveText(["Fraction recall", "Modelling", "Practice", "Exit check"]);

  await expect
    .poll(async () => {
      const { data } = await admin.from("tool_runs").select("output").eq("id", runId).single();
      return JSON.parse(data!.output as string).lesson.layout;
    }, NAV)
    .toBe("cycles");

  await page.screenshot({ path: "test-results/lesson-plan-cycles.png", fullPage: true });
});

test("Make a quiz opens the quiz tool filled in from the plan", async ({ page }) => {
  const runId = await seedPlanRun();
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await page.getByTestId("lesson-handoffs").getByRole("link", { name: "Make a quiz" }).click();
  await expect(page).toHaveURL(/\/tools\/quiz-generator\?prefill=/, NAV);
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue("Fractions", NAV);
});

test("a plan saved before the uplift still opens as the document it was", async ({ page }) => {
  const runId = await seedResource(teacher, "Old plan", "## Section 1: Clarity of Objective\n\nPupils will add fractions.");
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${runId}`);
  await expect(page.getByText("Pupils will add fractions.")).toBeVisible(NAV);
  await expect(sheet(page)).toHaveCount(0);
});

// ── The live run ────────────────────────────────────────────────────────────

test("LIVE: the real model writes a plan that fits the schema and the lesson", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(420_000);
  await signIn(page, teacher);
  const before = (await lessonRuns()).length;

  await page.goto(`/tools/lesson-planner?prefill=${encodePrefill({ slug: "lesson-planner", fields: { ...FIELDS, layout: "cycles", lessonLength: 50 } })}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 360_000 });

  await expect.poll(async () => (await lessonRuns()).length, { timeout: 60_000 }).toBe(before + 1);
  const doc = JSON.parse((await lessonRuns())[0].output as string);
  const blocks = doc.sections.flatMap((s: { blocks: unknown[] }) => s.blocks) as { type: string; minutes?: number; options?: string[]; answers?: number[] }[];
  const phases = blocks.filter((b) => b.type === "phase");

  expect(doc.lesson).toMatchObject({ layout: "cycles", minutes: 50 });
  expect(doc.sections.map((s: { role?: string }) => s.role)).toEqual(expect.arrayContaining(["overview", "starter", "main", "plenary"]));
  expect(phases.length).toBeGreaterThanOrEqual(4);
  expect(phases.reduce((a, p) => a + (p.minutes ?? 0), 0)).toBe(50);
  const quizzes = blocks.filter((b) => b.type === "mcq");
  expect(quizzes.length).toBeGreaterThanOrEqual(4);
  for (const q of quizzes) expect(q.answers?.length).toBe(1);
  await expect(page.getByTestId("lesson-timing-warning")).toHaveCount(0);

  await page.screenshot({ path: "test-results/lesson-plan-live.png", fullPage: true });
});
