import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Cover Lesson as designed pages: the cover teacher's plan, then the pupil
 * task on a page of its own, then the answers.
 *
 * The screen tests answer /api/cover-lesson with page.route: NOTHING IS
 * SPENT. The LIVE test really generates on staging and is skipped unless
 * LIVE_MODEL=1.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const MODEL = {
  title: "Photosynthesis practice",
  notes: ["The class has been learning about photosynthesis"],
  phases: [
    { stage: "starter", title: "Quick recall", minutes: 10, say: "Good morning, I'm covering today.", teacher: "1. Write three questions on the board.", pupils: "Answer in books", challenge: "Write a fourth question" },
    { stage: "main", title: "Practice questions", minutes: 40, say: "Turn to the task sheet.", teacher: "1. Hand out the sheet.", pupils: "Complete the task", challenge: "Try the last question" },
    { stage: "plenary", title: "Go through answers", minutes: 10, say: "Pens down.", teacher: "1. Read the answers.", pupils: "Mark their work", challenge: "" },
  ],
  checklist: ["Collect the task sheets"],
  task: {
    title: "Photosynthesis: practice questions",
    instructions: "Answer every question.",
    questions: [
      { type: "mcq", prompt: "What gas do plants take in?", options: ["Oxygen", "Carbon dioxide"], answers: [1], marks: 1 },
      { type: "short", prompt: "Where does photosynthesis happen?", lines: 2, answer: "In the chloroplasts", marks: 1 },
    ],
  },
};

const FIELDS = { curriculum: "2014 National Curriculum", yearGroup: "Year 8", subject: "Science", topic: "Photosynthesis", lessonLength: "60 minutes", resources: "Basic stationery only (pen and paper)" };

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Coverlesson");
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");

async function runs() {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "cover-lesson").order("created_at", { ascending: false });
  return data ?? [];
}

test("a cover lesson is a plan for the cover teacher, then the pupil task on its own page, then answers", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs()).length;
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/cover-lesson", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL) });
  });

  await page.goto(`/tools/cover-lesson?prefill=${encodePrefill({ slug: "cover-lesson", fields: FIELDS })}`);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("Science", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 8");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ lessonLength: "60 minutes", topic: "Photosynthesis" });

  await expect(pages(page).locator(".js-section-title")).toHaveText(["Before you go in", "The lesson", "Before you leave", "Photosynthesis: practice questions"]);
  await expect(pages(page).locator(".js-phase-row dt").filter({ hasText: "What to say to the class" })).toHaveCount(3);
  await expect(pages(page).locator(".js-phase-clock").last()).toHaveText(/to 1:00$/);
  await expect(pages(page).locator(".js-subtitle")).toHaveText(/Cover lesson · 60 minutes/);

  // The pupil task starts a page, with the name lines on it and nowhere else.
  const taskPage = pages(page).locator(".js-page").filter({ has: page.getByTestId("pupil-page-namedate") });
  await expect(taskPage).toHaveCount(1);
  await expect(taskPage.locator(".js-section-title").first()).toHaveText("Photosynthesis: practice questions");
  await expect(pages(page).locator(".js-namedate")).toHaveCount(1);
  await expect(pages(page).locator(".js-answers-title")).toHaveText("Answers to the pupil task");

  await expect.poll(async () => (await runs()).length, NAV).toBe(before + 1);
  expect(JSON.parse((await runs())[0].output as string)).toMatchObject({ kind: "jooma-sheet", tool: "cover" });

  await page.screenshot({ path: "test-results/cover-lesson-sheet.png", fullPage: true });
});

test("a cover lesson saved before the uplift still opens as the document it was", async ({ page }) => {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "cover-lesson", title: "Old cover", input: FIELDS, output: "# Cover Lesson: Science\n\nHand out the textbooks." })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/cover-lesson?run=${data.id}`);
  await expect(page.getByText("Hand out the textbooks.")).toBeVisible(NAV);
  await expect(sheet(page)).toHaveCount(0);
});

test("LIVE: the real model writes a cover lesson that fits the schema and the lesson", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(360_000);
  await signIn(page, teacher);
  const before = (await runs()).length;
  await page.goto(`/tools/cover-lesson?prefill=${encodePrefill({ slug: "cover-lesson", fields: FIELDS })}`);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("Science", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 8");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 300_000 });
  await expect.poll(async () => (await runs()).length, { timeout: 60_000 }).toBe(before + 1);
  const doc = JSON.parse((await runs())[0].output as string);
  const blocks = doc.sections.flatMap((s: { blocks: { type: string; minutes?: number; say?: string }[] }) => s.blocks);
  const phases = blocks.filter((b: { type: string }) => b.type === "phase");
  expect(phases.reduce((a: number, p: { minutes?: number }) => a + (p.minutes ?? 0), 0)).toBe(60);
  for (const p of phases) expect(p.say).toBeTruthy();
  expect(doc.sections.at(-1).role).toBe("task");
  expect(doc.sections.at(-1).blocks.length).toBeGreaterThanOrEqual(6);
  expect(JSON.stringify(doc)).not.toMatch(/[–—]/);
  await page.screenshot({ path: "test-results/cover-lesson-live.png", fullPage: true });
});
