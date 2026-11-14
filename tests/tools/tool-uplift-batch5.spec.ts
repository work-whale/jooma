import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Tool uplift batch 5: ECT Report, Performance Management, Lesson
 * Observation, Learning Walk and School Improvement Plan as designed sheets.
 *
 * The screen tests answer each route (and /api/jo) with page.route: NOTHING
 * IS SPENT. The LIVE tests really generate on staging and are skipped unless
 * LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const LIVE = { timeout: 420_000 };

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Batchfive");
  await setPlan(teacher, "pro", "comped");
});
test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const generate = (page: Page) => page.getByRole("button", { name: /^(generate|regenerate)$/i });
const plain = (body: string) => ({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body });
const json = (body: unknown) => plain(JSON.stringify(body));
const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");
const titles = (page: Page) => pages(page).locator(".js-section-title");
const live = () => test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
const noDashes = (doc: unknown) => expect(JSON.stringify(doc)).not.toMatch(/[–—]/);

interface SavedSheet { kind: string; tool: string; title: string; staff?: { placeholder: string; name: string }[]; design: { landscape?: boolean; hidden?: string[] }; sections: { role?: string; title: string; blocks: { type: string; text?: string; headers?: string[]; rows?: string[][] }[] }[] }

async function runs(slug: string) {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", slug).order("created_at", { ascending: false });
  return data ?? [];
}

async function savedSheet(slug: string, before: number): Promise<SavedSheet> {
  await expect.poll(async () => (await runs(slug)).length, NAV).toBe(before + 1);
  return JSON.parse((await runs(slug))[0].output as string) as SavedSheet;
}

const joReply = { reply: "Done.", clarify: null, ops: [], summary: "" };

// ── Step 1: ECT report ──────────────────────────────────────────────────────

const ECT = {
  summary: "[ECT] has made a strong start, with secure routines and clear explanations.",
  standards: [
    { standard: 2, strengths: "[ECT] uses worked examples so pupils make progress in algebra.", nextSteps: "" },
    { standard: 6, strengths: "Questions are planned in advance.", nextSteps: "Check the whole class understands before moving on." },
  ],
  conduct: "[ECT] upholds public trust and treats pupils with dignity.",
  targets: [{ target: "Use mini whiteboards to check understanding in every lesson", support: "Mentor modelling and a joint planning session", byWhen: "February half term" }],
};

async function ectForm(page: Page) {
  await page.goto("/tools/ect-report-writer", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("ECT name").fill("Sarah Johnson");
  await page.getByLabel("Subject").fill("Maths");
  await page.getByLabel("Strengths", { exact: true }).fill("Clear worked examples in Year 8 algebra; warm, respectful relationships; calm and consistent entry routines.");
  await page.getByLabel("Areas for development", { exact: true }).fill("Whole-class checks for understanding before moving on; adapting tasks for pupils with SEND.");
}

test("ECT report: name and outcome on the page, in no request (generate or Ask Jo); targets, comments and sign-off", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("ect-report-writer")).length;
  const bodies: string[] = [];
  await page.route("**/api/ect-report-writer", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(ECT)); });
  await page.route("**/api/jo", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(joReply)); });

  await ectForm(page);
  await page.getByLabel("Termly progress review").check();
  await page.getByLabel("Point in induction").selectOption("t2");
  await page.getByLabel(/^Outcome/).selectOption("not-on-track");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await expect(pages(page).getByText("ECT progress review: Sarah Johnson").first()).toBeVisible();
  await expect(pages(page).getByText("Sarah Johnson has made a strong start", { exact: false })).toBeVisible();
  await expect(pages(page).locator("td", { hasText: /^Not on track to complete induction successfully$/ })).toHaveCount(1);
  await expect(pages(page).locator("td", { hasText: /^2\. Promote good progress and outcomes by pupils$/ })).toHaveCount(1);
  await expect(pages(page).locator("th", { hasText: /^ECT's comments$/ })).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Agreed development targets" })).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Sign-off" })).toHaveCount(1);

  const sent = JSON.parse(bodies[0]) as Record<string, unknown>;
  expect(sent).toMatchObject({ reportType: "review", period: "t2" });
  expect(sent).not.toHaveProperty("outcome");

  const saved = await savedSheet("ect-report-writer", before);
  expect(saved).toMatchObject({ tool: "ectReport", staff: [{ placeholder: "[ECT]", name: "Sarah Johnson" }] });
  expect(JSON.stringify(saved.sections)).not.toMatch(/Sarah|Johnson/);
  await page.waitForTimeout(500);

  await page.getByTestId("jo-input").fill("Make the targets more specific");
  await page.getByTestId("jo-send").click();
  await expect.poll(() => bodies.length, NAV).toBe(2);
  for (const b of bodies) expect(b).not.toMatch(/Sarah|Johnson|ectName/);
  // The generation never hears the outcome. Jo may read it on the page it
  // edits (its rules say never to change it), but sees [ECT], not the name.
  expect(bodies[0]).not.toMatch(/on track/i);
  expect(bodies[1]).toContain("[ECT]");
});

test("ECT formal assessment: final assessment outcomes, appropriate body note", async ({ page }) => {
  await signIn(page, teacher);
  await page.route("**/api/ect-report-writer", (route) => route.fulfill(json(ECT)));
  await ectForm(page);
  await page.getByLabel("Formal assessment (draft)").check();
  await expect(page.getByLabel("Point in induction").locator("option")).toHaveCount(2);
  await page.getByLabel("Point in induction").selectOption("t6");
  await page.getByLabel(/^Outcome/).selectOption("extension");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  await expect(pages(page).getByText("ECT formal assessment: Sarah Johnson").first()).toBeVisible();
  await expect(pages(page).locator("td", { hasText: /^An extension to the induction period should be considered$/ })).toHaveCount(1);
  await expect(pages(page).getByText(/appropriate body's assessment form/)).toBeVisible();
});

test("LIVE ECT report", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("ect-report-writer")).length;
  await ectForm(page);
  await page.getByLabel(/^Outcome/).selectOption("on-track");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("ect-report-writer", before);
  expect(saved.tool).toBe("ectReport");
  const standards = saved.sections.find((s) => s.role === "standards")!;
  expect(standards.blocks[0].rows!.length).toBeGreaterThan(0);
  for (const row of standards.blocks[0].rows!) expect(row[0]).toMatch(/^[1-8]\. /);
  expect(saved.sections.find((s) => s.role === "targets")!.blocks[0].rows!.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved.sections)).not.toMatch(/Sarah|Johnson/);
  noDashes(saved);
  await expect(pages(page).getByText("ECT progress review: Sarah Johnson").first()).toBeVisible();
});

// ── Step 2: appraisal objectives ────────────────────────────────────────────

const APPRAISAL = {
  rationale: "The objectives link to Teachers' Standards 2 and 8 and to the school's maths priority.",
  objectives: [
    { objective: "Raise times tables fluency in Year 4 by the end of the summer term", successCriteria: "90% of pupils score 20 or more in the MTC", support: "Maths hub CPD", evidence: "Pupil progress data" },
    { objective: "Lead three maths CPD sessions by Easter", successCriteria: "Staff voice shows growing confidence", support: "Release time", evidence: "Staff feedback" },
  ],
};

async function appraisalForm(page: Page) {
  await page.goto("/tools/performance-management", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel(/School type/).fill("Primary");
  await page.getByLabel("Role").fill("Year 4 class teacher and maths lead");
  await page.getByLabel(/Pay scale/).fill("M4");
  await page.getByLabel("Responsibilities and target areas").fill("Improve times tables fluency across KS2; lead maths CPD for staff; raise attainment of disadvantaged pupils in Year 4 maths.");
}

test("appraisal: landscape objectives with blank review columns and sign-off; count and priorities sent", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("performance-management")).length;
  let sent = "";
  await page.route("**/api/performance-management", (route) => { sent = route.request().postData() ?? ""; return route.fulfill(json(APPRAISAL)); });
  await appraisalForm(page);
  await page.getByLabel(/School priorities/).fill("Maths fluency");
  await page.getByLabel("Number of objectives").selectOption("2");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(JSON.parse(sent)).toMatchObject({ objectiveCount: 2, priorities: "Maths fluency", staffMember: "Year 4 class teacher and maths lead" });
  await expect(pages(page).locator("th", { hasText: /^Mid-year review$/ })).toHaveCount(1);
  await expect(pages(page).locator("th", { hasText: /^End-of-year review$/ })).toHaveCount(1);
  await expect(pages(page).getByText(/^1\. Raise times tables fluency/)).toBeVisible();
  await expect(titles(page).filter({ hasText: "Sign-off" })).toHaveCount(1);
  const saved = await savedSheet("performance-management", before);
  expect(saved).toMatchObject({ tool: "appraisal", design: { landscape: true } });
  const table = saved.sections.find((s) => s.role === "objectives")!.blocks[0];
  for (const row of table.rows!) expect(row.slice(4)).toEqual(["", ""]);
});

test("LIVE appraisal", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("performance-management")).length;
  await appraisalForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("performance-management", before);
  const rows = saved.sections.find((s) => s.role === "objectives")!.blocks[0].rows!;
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row.slice(4)).toEqual(["", ""]);
  expect(JSON.stringify(saved)).not.toMatch(/observation grade/i);
  noDashes(saved);
});

// ── Step 3: lesson observation ──────────────────────────────────────────────

const OBSERVATION = {
  context: "A Year 5 English lesson on relative clauses.",
  strengths: [{ title: "Clear modelling", evidence: "[TEACHER] modelled relative clauses under the visualiser." }],
  areas: [{ title: "Questioning", evidence: "Questions went to volunteers only.", impact: "Some pupils stayed passive." }],
  recommendations: [{ title: "Cold call", how: "Use no hands up questioning." }],
  actionPlan: [{ target: "Cold call in every lesson", actions: "Plan three questions", support: "Mentor", byWhen: "By half term" }],
  followUp: [],
};

async function observationForm(page: Page) {
  await page.goto("/tools/lesson-observation-report", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 5");
  await page.getByLabel("Subject").fill("English");
  await page.getByLabel("Learning objective").fill("To use relative clauses to add detail");
  await page.getByLabel("Strengths", { exact: true }).fill("Clear modelling of relative clauses under the visualiser; sentence stems used well by most pupils.");
  await page.getByLabel("Areas for development", { exact: true }).fill("Questioning relied on volunteers only; little time left for independent writing.");
  await page.getByLabel("Date of observation").fill("2026-11-12");
  await page.getByText("Include simple action plan").click();
}

test("lesson observation: names on the page and in the filename, in no request; response box and sign-off; never graded", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("lesson-observation-report")).length;
  const bodies: string[] = [];
  await page.route("**/api/lesson-observation-report", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(OBSERVATION)); });
  await page.route("**/api/jo", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(joReply)); });
  await observationForm(page);
  await page.getByLabel("Teacher observed").fill("Sarah Johnson");
  await page.getByLabel("Observer", { exact: true }).fill("David Okafor");
  // A name typed into the notes is caught too.
  await page.getByLabel("Strengths", { exact: true }).fill("Sarah modelled relative clauses clearly; David noted the stems helped.");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await expect(pages(page).getByText("Lesson observation: Sarah Johnson").first()).toBeVisible();
  await expect(pages(page).locator("td", { hasText: /^David Okafor$/ }).first()).toBeVisible();
  await expect(pages(page).locator("th", { hasText: /^Teacher's response$/ })).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Sign-off" })).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Action plan" })).toHaveCount(1);
  expect(JSON.parse(bodies[0])).toMatchObject({ strengths: "[TEACHER] modelled relative clauses clearly; [OBSERVER] noted the stems helped.", includeActionPlan: true });

  const saved = await savedSheet("lesson-observation-report", before);
  expect(saved).toMatchObject({ tool: "lessonObservation" });
  expect(JSON.stringify(saved.sections)).not.toMatch(/Sarah|Okafor/);

  await page.getByTestId("jo-input").fill("Make it warmer");
  await page.getByTestId("jo-send").click();
  await expect.poll(() => bodies.length, NAV).toBe(2);
  for (const b of bodies) expect(b).not.toMatch(/Sarah|Johnson|David|Okafor|teacherName|observerName/);
  expect(bodies[1]).toContain("[TEACHER]");

  // The export filename carries the name (the page only).
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /export|download/i }).first().click();
  await page.getByRole("menuitem", { name: /word/i }).click().catch(() => {});
  expect((await download).suggestedFilename()).toMatch(/sarah-johnson/);
});

test("LIVE lesson observation", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("lesson-observation-report")).length;
  await observationForm(page);
  await page.getByLabel("Teacher observed").fill("Sarah Johnson");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("lesson-observation-report", before);
  expect(saved.sections.find((s) => s.role === "strengths")!.blocks[0].rows!.length).toBeGreaterThan(1);
  expect(saved.sections.find((s) => s.role === "actionPlan")!.blocks[0].rows!.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved.sections)).not.toMatch(/Sarah|Johnson|\b(outstanding|requires improvement|inadequate)\b/i);
  noDashes(saved);
});

// ── Step 4: learning walk ───────────────────────────────────────────────────

const WALK = {
  summary: "Retrieval practice is well established across the classes visited.",
  overall: "positive",
  strengths: [{ title: "Do Now quizzes", evidence: "Seen in every room." }],
  areas: [{ title: "Feedback", evidence: "Brief feedback on answers.", impact: "Misconceptions persist." }],
  recommendations: [{ title: "Model full answers", how: "Show a strong answer after each quiz." }],
  nextSteps: [{ action: "Brief staff on a feedback routine", when: "immediate", leadRole: "Head of English" }, { action: "Plan CPD on extended answers", when: "halfTerm", leadRole: "CPD lead" }],
};

async function walkForm(page: Page) {
  await page.goto("/tools/learning-walk-report", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Date", { exact: true }).fill("2026-11-12");
  await page.getByLabel(/Classes/).fill("Year 7 and Year 9 English, including Mr Patel's Year 7 class");
  await page.getByLabel(/Focus of learning walk/).fill("Retrieval practice and questioning");
  await page.getByLabel("Observed strengths").fill("Do Now retrieval quizzes in every room; Mr Patel's cold calling kept all pupils thinking.");
  await page.getByLabel("Areas for development", { exact: true }).fill("Feedback on retrieval answers was brief; few pupils extended answers in full sentences.");
}

test("learning walk: 'Mr Patel' reaches no request and not the page; next steps by when; response and sign-off", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("learning-walk-report")).length;
  const bodies: string[] = [];
  await page.route("**/api/learning-walk-report", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(WALK)); });
  await page.route("**/api/jo", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(joReply)); });
  await walkForm(page);
  await expect(page.getByTestId("walk-names-note")).toContainText("First names on their own are not caught");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(JSON.parse(bodies[0])).toMatchObject({ classesVisited: "Year 7 and Year 9 English, including a teacher's Year 7 class", strengths: "Do Now retrieval quizzes in every room; a teacher's cold calling kept all pupils thinking." });
  await expect(pages(page).locator("td", { hasText: /^Positive$/ })).toHaveCount(1);
  await expect(pages(page).locator("td", { hasText: /^Within two weeks$/ })).toHaveCount(1);
  await expect(pages(page).locator("th", { hasText: /^Response from the team$/ })).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Sign-off" })).toHaveCount(1);
  await expect(pages(page).getByText(/Patel/)).toHaveCount(0);

  const saved = await savedSheet("learning-walk-report", before);
  expect(saved.tool).toBe("learningWalk");
  expect(JSON.stringify(saved)).not.toMatch(/Patel/);

  await page.getByTestId("jo-input").fill("Make the next steps more specific");
  await page.getByTestId("jo-send").click();
  await expect.poll(() => bodies.length, NAV).toBe(2);
  for (const b of bodies) expect(b).not.toMatch(/Patel/);
});

test("LIVE learning walk", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("learning-walk-report")).length;
  await walkForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("learning-walk-report", before);
  expect(saved.sections.find((s) => s.role === "nextSteps")!.blocks[0].rows!.length).toBeGreaterThan(2);
  expect(JSON.stringify(saved)).not.toMatch(/Patel/);
  noDashes(saved);
});

// ── Step 5: school improvement plan ─────────────────────────────────────────

const SIP = {
  summary: "Two priorities for the year: reading fluency and attendance.",
  context: "[school to add] context.",
  rationale: "Fluency underpins comprehension; absence limits learning.",
  priorities: [
    { title: "KS2 reading fluency", ofstedArea: "Curriculum and teaching", actions: [{ action: "Daily fluency practice in KS2", leadRole: "English lead", timescale: "From September", monitoring: "Termly reading checks", successCriteria: "[school to add] words per minute" }] },
    { title: "Attendance of disadvantaged pupils", ofstedArea: "Attendance and behaviour", actions: [{ action: "First day calling", leadRole: "Attendance lead", timescale: "Autumn 1", monitoring: "Weekly data", successCriteria: "Persistent absence falls" }] },
  ],
  monitoring: [{ halfTerm: "Spring 1", activity: "Reading data review" }, { halfTerm: "Autumn 1", activity: "Baseline checks" }],
};

async function sipForm(page: Page) {
  await page.goto("/tools/school-improvement-plan", NAV);
  await page.getByLabel("School type").selectOption("Primary");
  await page.getByLabel("Priorities to improve").fill("1. KS2 reading fluency for disadvantaged pupils\n2. Attendance of disadvantaged pupils");
}

test("SIP: no format picker; landscape action table per priority with blank Cost and RAG; narrative switchable", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("school-improvement-plan")).length;
  let sent = "";
  await page.route("**/api/school-improvement-plan", (route) => { sent = route.request().postData() ?? ""; return route.fulfill(json(SIP)); });
  await sipForm(page);
  await expect(page.getByText("Narrative format")).toHaveCount(0);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(JSON.parse(sent)).not.toHaveProperty("outputFormat");
  await expect(titles(page).filter({ hasText: "Priority 1: KS2 reading fluency" })).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Priority 2: Attendance of disadvantaged pupils" })).toHaveCount(1);
  await expect(pages(page).locator("th", { hasText: /^RAG$/ })).toHaveCount(2);
  await expect(titles(page).filter({ hasText: "Monitoring calendar" })).toHaveCount(1);
  const saved = await savedSheet("school-improvement-plan", before);
  expect(saved).toMatchObject({ tool: "sip", design: { landscape: true } });
  for (const s of saved.sections.filter((x) => x.role === "priority")) for (const row of s.blocks[0].rows!) expect(row.slice(5)).toEqual(["", ""]);

  // The narrative parts switch off in Design.
  await expect(titles(page).filter({ hasText: "School context" })).toHaveCount(1);
  await page.getByRole("button", { name: /^design$/i }).click();
  await page.getByRole("checkbox", { name: "School context" }).uncheck();
  await expect(titles(page).filter({ hasText: "School context" })).toHaveCount(0);
});

test("LIVE SIP", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("school-improvement-plan")).length;
  await sipForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("school-improvement-plan", before);
  const ps = saved.sections.filter((s) => s.role === "priority");
  expect(ps).toHaveLength(2);
  for (const s of ps) for (const row of s.blocks[0].rows!) expect(row.slice(5)).toEqual(["", ""]);
  expect(JSON.stringify(saved)).not.toMatch(/£\s?\d|\bIntent\b|requires improvement|quality of education/i);
  noDashes(saved);
});
