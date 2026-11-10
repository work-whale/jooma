import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, seedResource, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Exam Papers as designed pages (a cover with the total worked out, questions
 * in parts, a mark scheme on its own pages) and Model Answers opened from a
 * paper. The screen tests answer the model routes with page.route: NOTHING IS
 * SPENT. The two LIVE tests generate for real on staging, skipped unless
 * LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const PAPER = {
  title: "Biology: Photosynthesis",
  objective: "",
  intro: { variant: "fact", label: "", text: "", emoji: "" },
  sections: [
    { title: "Question 1", emoji: "", instructions: "", blocks: [{ type: "short", prompt: "State the word equation for photosynthesis.", lines: 2, answer: "carbon dioxide + water (1); glucose + oxygen (1)", marks: 2 }] },
    {
      title: "Question 2",
      emoji: "",
      instructions: "A student counted oxygen bubbles from pondweed.",
      blocks: [
        { type: "calc", prompt: "Calculate the mean number of bubbles.", working: true, answer: "12 (2)", marks: 2 },
        { type: "long", prompt: "Evaluate the student's method.", lines: 12, answer: "Controls and repeats", criteria: ["Level 3 (5 to 6 marks): detailed evaluation"], marks: 6 },
      ],
    },
  ],
  teacherNotes: [],
};

const ANSWERS = {
  title: "Biology: model answers",
  questions: [
    {
      question: "A student counted oxygen bubbles from pondweed. Evaluate the student's method.",
      marks: 6,
      exemplars: [
        { level: "full", awarded: 6, form: "prose", parts: ["The student kept the temperature constant, which is a fair test."], annotations: [{ quote: "kept the temperature constant", note: "Control variable (Level 3)" }], commentary: "Balanced and specific." },
        { level: "low", awarded: 2, form: "prose", parts: ["It was a fair test."], annotations: [], commentary: "No detail." },
      ],
      teachingNotes: ["Name the control variable"],
    },
  ],
};

const FIELDS = { curriculum: "2014 National Curriculum", yearGroup: "Year 11", subject: "Biology", topic: "Photosynthesis", examStyle: "gcse-aqa" };

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Exams");
  await setPlan(teacher, "pro", "comped");
});
test.afterAll(async () => deleteTeacher(teacher));

async function examRuns() {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "exam-question-generator").order("created_at", { ascending: false });
  return data ?? [];
}

const sheet = (page: Page) => page.getByTestId("sheet-document");

test("a paper in a board's style: cover with the total, parts, a mark scheme, saved once", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await examRuns()).length;
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/exam-question-generator", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(PAPER) });
  });

  await page.goto(`/tools/exam-question-generator?prefill=${encodePrefill({ slug: "exam-question-generator", fields: FIELDS })}`);
  // Biology is tiered at GCSE, so the tier shows.
  await expect(page.getByTestId("exam-tier")).toBeVisible(NAV);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ examStyle: "gcse-aqa", tier: "higher", subject: "Biology" });

  const cover = sheet(page).getByTestId("exam-cover");
  await expect(cover).toContainText("GCSE (9 to 1) Biology, Higher tier");
  await expect(cover).toContainText("not endorsed by AQA");
  await expect(sheet(page).getByTestId("exam-total")).toHaveText("10");
  // The questions start on page 2, labelled by part.
  await expect(sheet(page).locator('.js-pages > .js-page[data-page="1"] .js-q')).toHaveCount(0);
  await expect(sheet(page).locator(".js-pages .js-num")).toHaveText(["1", "2(a)", "2(b)"]);
  await expect(sheet(page).locator(".js-pages > .js-page").last()).toContainText("Mark scheme");
  await expect(sheet(page).locator(".js-pages > .js-page").last()).toContainText("Level 3 (5 to 6 marks)");

  await expect.poll(async () => (await examRuns()).length, NAV).toBe(before + 1);
  expect(JSON.parse((await examRuns())[0].output as string)).toMatchObject({ kind: "jooma-sheet", tool: "exam", exam: { styleId: "gcse-aqa", tier: "higher" } });

  // History is not tiered: no tier choice.
  await page.getByRole("textbox", { name: /subject/i }).first().fill("History");
  await expect(page.getByTestId("exam-tier")).toHaveCount(0);

  await page.screenshot({ path: "test-results/exam-paper.png", fullPage: true });
});

test("Write model answers opens the paper's questions, the long one ticked, and writes annotated answers", async ({ page }) => {
  await signIn(page, teacher);
  await page.route("**/api/exam-question-generator", (route) => route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(PAPER) }));
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/model-answer-generator", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(ANSWERS) });
  });

  await page.goto(`/tools/exam-question-generator?prefill=${encodePrefill({ slug: "exam-question-generator", fields: FIELDS })}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  const link = page.getByTestId("lesson-handoffs").getByRole("link", { name: "Write model answers" });
  await expect(link).toBeVisible(NAV);
  await link.click();
  await expect(page).toHaveURL(/model-answer-generator\?from=/, NAV);

  const picks = page.getByTestId("paper-questions");
  await expect(picks).toBeVisible(NAV);
  await expect(picks.getByRole("checkbox")).toHaveCount(3);
  await expect(picks.getByRole("checkbox").nth(2)).toBeChecked();
  await expect(picks.getByRole("checkbox").nth(0)).not.toBeChecked();

  await page.locator("[data-jo-generate]").click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect((sent as unknown as { questions: { marks: number }[] }).questions).toEqual([{ question: "A student counted oxygen bubbles from pondweed. Evaluate the student's method.", marks: 6 }]);
  // .js-pages: the sheet also holds a hidden copy it measures itself with.
  const pages = sheet(page).locator(".js-pages");
  await expect(pages.locator('.js-exemplar[data-level="full"]')).toContainText("6 / 6 marks");
  await expect(pages.locator(".js-exemplar-notes")).toContainText("Control variable");
  await expect(pages.locator(".js-exemplar")).toHaveCount(2);
});

test("a paper saved before the uplift still opens as the document it was", async ({ page }) => {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "exam-question-generator", title: "Old paper", input: { examType: "GCSE AQA", subject: "Biology" }, output: "# Old paper\n\n## Question 1 (2 marks)\n\nState two things." })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/exam-question-generator?run=${data.id}`);
  await expect(page.getByText("State two things.")).toBeVisible(NAV);
  await expect(sheet(page)).toHaveCount(0);
  // Its free text exam type reopens as the nearest style.
  await expect(page.getByTestId("exam-style")).toHaveValue("gcse-aqa");
  void seedResource;
});

// ── The live runs ───────────────────────────────────────────────────────────

test("LIVE: the real model writes a paper and model answers that fit their schemas", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(600_000);
  await signIn(page, teacher);
  const before = (await examRuns()).length;
  await page.goto(`/tools/exam-question-generator?prefill=${encodePrefill({ slug: "exam-question-generator", fields: { ...FIELDS, numQuestions: 4 } })}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 360_000 });
  await expect.poll(async () => (await examRuns()).length, { timeout: 60_000 }).toBe(before + 1);
  const doc = JSON.parse((await examRuns())[0].output as string);
  expect(doc.exam).toMatchObject({ styleId: "gcse-aqa" });
  const shape = doc.sections.map((s: { title: string; blocks: { type: string; marks?: number }[] }) => `${s.title}: ${s.blocks.map((b) => `${b.type}${b.marks ?? ""}`).join(" ")}`);
  const questions = doc.sections.filter((s: { blocks: { marks?: number }[] }) => s.blocks.some((b) => typeof b.marks === "number"));
  expect(questions.length, shape.join("\n")).toBe(4);
  type Part = { type: string; marks?: number; answer?: string; criteria?: string[]; answers?: unknown[]; pairs?: unknown[]; statements?: unknown[] };
  const parts: Part[] = doc.sections.flatMap((s: { blocks: Part[] }) => s.blocks).filter((b: Part) => typeof b.marks === "number");
  // Every part has a mark scheme: an answer, mark points, or (a choice
  // question) its right options.
  for (const p of parts) {
    const scheme = (p.answer ?? "").length + (p.criteria?.length ?? 0) + (p.answers?.length ?? 0) + (p.pairs?.length ?? 0) + (p.statements?.length ?? 0);
    expect(scheme, `${p.type} part has no mark scheme`).toBeGreaterThan(0);
  }
  await expect(sheet(page).getByTestId("exam-total")).not.toHaveText("0");

  await page.getByTestId("lesson-handoffs").getByRole("link", { name: "Write model answers" }).click();
  await expect(page.getByTestId("paper-questions")).toBeVisible(NAV);
  await page.locator("[data-jo-generate]").click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 360_000 });
  await expect(sheet(page).locator(".js-pages .js-exemplar").first()).toBeVisible();
  await page.screenshot({ path: "test-results/exam-live-answers.png", fullPage: true });
});
