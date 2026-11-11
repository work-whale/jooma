import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Topic Map and Term Plan as designed unit plans: a landscape table one row
 * per lesson, columns switched on and off in Design, parts of the plan
 * switched off, and "Plan this lesson" opening Lesson Plan filled in.
 *
 * The screen tests answer the routes with page.route and a fixed unit:
 * NOTHING IS SPENT. The two LIVE tests really generate on staging and are
 * skipped unless LIVE_MODEL=1; run them when the prompt or schema changes (a
 * mock never proves the model accepts the schema).
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const LESSON = (n: number) => ({
  title: `Rivers lesson ${n}`,
  objective: `To explain river idea ${n}`,
  starter: `Recall task ${n}`,
  input: `Model ${n}`,
  activity: `Task ${n}`,
  plenary: `Exit ticket ${n}`,
  summary: `Summary of lesson ${n}`,
  keyKnowledge: [`That fact ${n} holds`],
  resources: [`OS map ${n}`],
  questions: [`Why ${n}?`],
  vocabulary: [`erosion${n}`],
});

/** What the model would stream. */
const MODEL_UNIT = {
  title: "Rivers and flooding",
  overview: "How rivers shape the land and why they flood.",
  beforeUnit: ["The water cycle"],
  afterUnit: ["Coasts"],
  lessons: [LESSON(1), LESSON(2), LESSON(3)],
  assessment: [{ when: "Lesson 2", how: "Hinge quiz", purpose: "Checks erosion" }],
  vocabulary: ["source", "mouth", "meander"],
};

const FIELDS = { curriculum: "2014 National Curriculum", yearGroup: "Year 8", subject: "Geography", topic: "Rivers" };

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Unitplan");
  // A teacher with no plan is sent to /free-tools, a different form.
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");

async function runs(slug: string) {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", slug).order("created_at", { ascending: false });
  return data ?? [];
}

async function seedUnitRun(tool: "topicMap" | "termPlan", slug: string): Promise<string> {
  const doc = normalizeDraft(MODEL_UNIT, sheetContext(tool, FIELDS));
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: slug, title: "Seeded unit", input: { ...FIELDS, numLessons: 3, numberOfLessons: 3 }, output: serializeSheet(doc) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

test("a topic map streams in as a landscape lesson table and is saved once, as a plan", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("topic-overview")).length;

  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/topic-overview", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_UNIT) });
  });

  await page.goto(`/tools/topic-overview?prefill=${encodePrefill({ slug: "topic-overview", fields: { ...FIELDS, numLessons: 3 } })}`);
  await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ topic: "Rivers", numLessons: 3, subject: "Geography" });

  // Landscape: every page is wider than it is tall.
  const box = await pages(page).locator(".js-page").first().boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height);

  await expect(pages(page).locator(".js-section-title")).toHaveText(["Unit overview", "Lessons", "Assessment points", "Key vocabulary"]);
  const table = page.getByTestId("lesson-table").first();
  await expect(table.locator(".js-seq-head > span")).toHaveText(["Lesson", "Learning objective", "Starter", "Teaching input", "Activity", "Plenary", "Resources", "Key questions", "Key vocabulary"]);
  await expect(pages(page).locator(".js-seq-row")).toHaveCount(3);
  await expect(pages(page).locator(".js-seq-row").first()).toContainText("Recall task 1");
  // No name lines, objective line or answers page on a plan for staff.
  await expect(pages(page).locator(".js-namedate")).toHaveCount(0);
  await expect(pages(page).locator(".js-answers-title")).toHaveCount(0);

  await expect.poll(async () => (await runs("topic-overview")).length, NAV).toBe(before + 1);
  const saved = JSON.parse((await runs("topic-overview"))[0].output as string);
  expect(saved).toMatchObject({ kind: "jooma-sheet", tool: "topicMap", unit: FIELDS, design: { landscape: true } });

  await page.screenshot({ path: "test-results/topic-map-sheet.png", fullPage: true });
});

test("a term plan opens with its own columns; Design changes columns and parts, saved in place", async ({ page }) => {
  const runId = await seedUnitRun("termPlan", "medium-term-planner");
  await signIn(page, teacher);
  await page.goto(`/tools/medium-term-planner?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  const head = page.getByTestId("lesson-table").first().locator(".js-seq-head > span");
  await expect(head).toHaveText(["Lesson", "Learning objective", "Summary of the lesson", "Key knowledge"]);

  await page.getByRole("button", { name: "Design", exact: true }).click();
  const panel = page.getByTestId("sheet-design-panel");
  // Switch a teaching column on: already written, so it shows at once.
  await panel.getByTestId("sheet-design-columns").getByLabel("Starter").check();
  await expect(head).toHaveText(["Lesson", "Learning objective", "Summary of the lesson", "Starter", "Key knowledge"]);
  await expect(pages(page).locator(".js-seq-row").first()).toContainText("Recall task 1");
  // And the overview off.
  await panel.getByTestId("sheet-design-parts").getByLabel("Unit overview").uncheck();
  await expect(pages(page).locator(".js-section-title")).toHaveText(["Lessons", "Assessment points", "Key vocabulary"]);

  await expect
    .poll(async () => {
      const { data } = await admin.from("tool_runs").select("output").eq("id", runId).single();
      const d = JSON.parse(data!.output as string).design;
      return { columns: d.columns, hidden: d.hidden };
    }, NAV)
    .toEqual({ columns: ["objective", "summary", "starter", "keyKnowledge"], hidden: ["overview"] });

  // Portrait is one click away, and the page turns.
  await panel.getByRole("radio", { name: "Portrait" }).click();
  const box = await pages(page).locator(".js-page").first().boundingBox();
  expect(box!.height).toBeGreaterThan(box!.width);

  await page.screenshot({ path: "test-results/term-plan-design.png", fullPage: true });
});

test("Plan this lesson opens Lesson Plan filled in from that row", async ({ page }) => {
  const runId = await seedUnitRun("topicMap", "topic-overview");
  await signIn(page, teacher);
  await page.goto(`/tools/topic-overview?run=${runId}`);
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  const link = pages(page).getByTestId("plan-this-lesson").nth(1);
  await expect(link).toHaveAttribute("target", "_blank");
  const href = await link.getAttribute("href");
  await page.goto(href!);
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue("Rivers: Rivers lesson 2", NAV);
  await expect(page.getByLabel("Learning objective", { exact: false }).first()).toHaveValue("To explain river idea 2", NAV);
});

test("a topic overview saved before the uplift still opens as the document it was", async ({ page }) => {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "topic-overview", title: "Old overview", input: FIELDS, output: "# Rivers Topic Overview\n\nPupils will study rivers." })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/topic-overview?run=${data.id}`);
  await expect(page.getByText("Pupils will study rivers.")).toBeVisible(NAV);
  await expect(sheet(page)).toHaveCount(0);
});

// ── The live runs ───────────────────────────────────────────────────────────

for (const [tool, slug, fieldName] of [["topicMap", "topic-overview", "numLessons"], ["termPlan", "medium-term-planner", "numberOfLessons"]] as const) {
  test(`LIVE: the real model writes a ${tool} that fits the schema and the lesson count`, async ({ page }) => {
    test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
    test.setTimeout(480_000);
    await signIn(page, teacher);
    const before = (await runs(slug)).length;

    await page.goto(`/tools/${slug}?prefill=${encodePrefill({ slug, fields: { ...FIELDS, [fieldName]: 5 } })}`);
    await page.getByRole("button", { name: /yes, generate/i }).click({ timeout: 60_000 });
    await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 420_000 });

    await expect.poll(async () => (await runs(slug)).length, { timeout: 60_000 }).toBe(before + 1);
    const doc = JSON.parse((await runs(slug))[0].output as string);
    expect(doc).toMatchObject({ tool, unit: FIELDS, design: { landscape: true } });
    expect(doc.sections.map((s: { role?: string }) => s.role)).toEqual(["overview", "lessons", "assessment", "vocabulary"]);
    const seq = doc.sections[1].blocks[0];
    expect(seq.type).toBe("sequence");
    expect(seq.lessons).toHaveLength(5);
    for (const l of seq.lessons) {
      for (const f of ["title", "objective", "starter", "input", "activity", "plenary", "summary"]) expect(l[f], `${f} filled`).not.toBe("");
      expect(l.keyKnowledge.length).toBeGreaterThan(0);
      expect(JSON.stringify(l)).not.toMatch(/[–—]/);
    }
    await page.screenshot({ path: `test-results/${tool}-live.png`, fullPage: true });
  });
}
