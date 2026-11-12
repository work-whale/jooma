import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { EYFS_AREAS } from "@/app/lib/sheets/eyfs";

/*
 * Tool uplift batch 3: Homework, Model Texts, SMART Targets, Interventions,
 * Phonics and Early Years Plan as designed sheets.
 *
 * The screen tests answer each tool's route (and /api/jo) with page.route:
 * NOTHING IS SPENT. The LIVE tests really generate on staging and are skipped
 * unless LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const LIVE = { timeout: 360_000 };

/** A name nothing else on the page could contain. */
const NAME = "Zephyr";
const word = (w: string) => new RegExp(`\\b${w}\\b`, "i");

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Batchthree");
  await setPlan(teacher, "pro", "comped");
});
test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");
const generate = (page: Page) => page.getByRole("button", { name: /^(generate|regenerate)$/i });
const json = (body: unknown) => ({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(body) });

async function runs(slug: string) {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", slug).order("created_at", { ascending: false });
  return data ?? [];
}

async function savedSheet(slug: string, before: number) {
  await expect.poll(async () => (await runs(slug)).length, NAV).toBe(before + 1);
  return JSON.parse((await runs(slug))[0].output as string) as { kind: string; tool: string; sections: { role?: string; title: string }[]; pupil?: unknown };
}

// ── What each model would stream ────────────────────────────────────────────

const HOMEWORK = {
  title: "Adding fractions",
  objective: "I am learning to add fractions",
  instructions: "Answer every question.",
  remember: { keyWords: [{ term: "Denominator", meaning: "the bottom number" }], reminder: "Find a common denominator." },
  task: { title: "Practice", instructions: "", stimulus: { title: "", paragraphs: [] }, steps: [], successCriteria: [], questions: [{ type: "short", prompt: "1/2 + 1/4?", lines: 1, answer: "3/4", marks: 1 }] },
  checklist: ["I showed my working"],
  teacherNotes: [],
};

const MODEL_TEXT = {
  title: "Visit Sunny Bay!",
  paragraphs: ["Have you ever felt the sand between your toes?", "Pack your bucket today."],
  features: [{ feature: "Rhetorical question", quote: "Have you ever felt", why: "It pulls the reader in." }],
  teacherNote: "",
};

const TARGETS = {
  targets: [{ target: "Read ten tricky words", specific: "I will read ten tricky words", measurable: "Twice in a row", achievable: "Flashcards", relevant: "Helps [PUPIL] read", timeBound: "By half term" }],
};

const STRATEGIES = {
  findings: ["Confident orally"],
  strategies: [{ name: "Times table drills", summary: "Daily practice for [PUPIL].", steps: ["Five minutes daily"], whoAndWhen: "TA, daily", measure: "Scores rise" }],
  practiceFocus: "Recall of the 7 times table",
};

const PHONICS = {
  title: "Phonics: 'ai'",
  about: "ai makes the long a sound.",
  wordBanks: { cvc: [], ccvc: ["snail"], cvcc: ["paint"], twoSyllable: [], longer: [] },
  commonWords: ["rain"],
  trickyWords: ["said"],
  decodableText: { title: "The Snail", paragraphs: ["A snail in the rain."] },
  pseudoWords: ["blain", "zaip"],
  activities: [{ title: "Sound hunt", focus: "Find ai", resources: ["Cards"], steps: ["Hunt"], vocabulary: ["rain"], support: "Help", challenge: "Write" }],
  misconceptions: ["Reading ai as two sounds"],
  assessment: ["Read five ai words"],
};

const EYFS = {
  title: "Minibeasts",
  overview: "Small creatures.",
  weeks: [1, 2].map((n) => ({ theme: `Theme ${n}`, ...Object.fromEntries(EYFS_AREAS.map(([f]) => [f, `${f} week ${n}`])) })),
  areas: EYFS_AREAS.map(([f]) => ({ area: f, goals: "ELG: Speaking", indoor: ["Bug hotel"], outdoor: ["Bug hunt"], adultLed: [{ title: `${f} story`, focus: "Retell", resources: [], steps: ["Read"], vocabulary: [], support: "Puppets", challenge: "Alone" }] })),
  bookList: ["The Very Hungry Caterpillar by Eric Carle"],
  homeLearning: ["Look for bugs"],
};

// ── Forms ───────────────────────────────────────────────────────────────────

async function homeworkForm(page: Page) {
  await page.goto(`/tools/homework-generator?prefill=${encodePrefill({ slug: "homework-generator", fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 6", subject: "Maths", learningObjective: "Add fractions with different denominators" } })}`);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(/Maths/i, NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 6");
  await page.getByLabel("Homework Type").selectOption("Worksheet-style questions");
  await page.getByLabel("Length / Effort Level").selectOption("Standard task (20 minutes)");
  await page.getByRole("radio", { name: /provide answers/ }).check();
}

async function modelTextForm(page: Page) {
  await page.goto(`/tools/model-text-generator?prefill=${encodePrefill({ slug: "model-text-generator", fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 4", write: "A persuasive leaflet encouraging families to visit the seaside", features: "rhetorical questions, imperative verbs", lengthWords: "250" } })}`);
  await expect(generate(page)).toBeVisible(NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 4");
}

async function targetsForm(page: Page, name = NAME) {
  await page.goto(`/tools/smart-targets?prefill=${encodePrefill({ slug: "smart-targets", fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 3", targets: "x" } })}`);
  await expect(page.getByLabel("Name (first name only)")).toBeVisible(NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 3");
  await page.getByLabel("Name (first name only)").fill(name);
  await page.getByLabel("Pronouns").selectOption("he");
  await page.getByLabel("Targets", { exact: true }).fill(`${name} should read ten tricky words.\n${name.toUpperCase()}'s help card: ask for help instead of shouting out.`);
}

async function interventionForm(page: Page) {
  await page.goto(`/tools/targeted-intervention?prefill=${encodePrefill({ slug: "targeted-intervention", fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Maths" } })}`);
  // Typing before Jo's fill-in finishes stops it, leaving the subject empty.
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(/Maths/i, NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 5");
  await page.getByLabel("Name (first name only)").fill(NAME);
  await page.getByLabel("Attitudinal data").fill(`${NAME} says "I'm rubbish at maths" and avoids written work, but enjoys practical tasks.`);
  await page.getByLabel("Attainment data").fill(`Working towards the expected standard. ${NAME}'s times tables are secure to 6.`);
  await page.getByLabel(/Other relevant data/).fill(`On SEN support. ${NAME} works best in a small group.`);
}

async function phonicsForm(page: Page, scheme = "") {
  await page.goto(`/tools/phonics-support?prefill=${encodePrefill({ slug: "phonics-support", fields: { curriculum: "2014 National Curriculum", grapheme: "ai", age: 5 } })}`);
  await expect(page.getByLabel(/Your phonics scheme/)).toBeVisible(NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel(/Your phonics scheme/).selectOption(scheme);
}

async function eyfsForm(page: Page) {
  await page.goto(`/tools/eyfs-planner?prefill=${encodePrefill({ slug: "eyfs-planner", fields: { topic: "Minibeasts", numberOfWeeks: "2", includeBookList: true } })}`);
  await expect(page.getByLabel("Topic")).toHaveValue("Minibeasts", NAV);
  await page.getByLabel("Curriculum").selectOption("Early Years Foundation Stage (EYFS)");
}

// ── Screen tests (mocked) ───────────────────────────────────────────────────

test("homework: a pupil sheet with a reminder, the task, a checklist and answers, saved once", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("homework-generator")).length;
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/homework-generator", (route) => { sent = route.request().postDataJSON(); return route.fulfill(json(HOMEWORK)); });
  await homeworkForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ homeworkType: "Worksheet-style questions", includeAnswers: true });
  await expect(pages(page).locator(".js-section-title")).toHaveText(["What to do", "Remember", "Practice", "How did I do?"]);
  await expect(pages(page).locator(".js-subtitle")).toContainText("Homework · about 20 minutes");
  await expect(pages(page).locator(".js-namedate")).toHaveCount(1);
  await expect(pages(page).locator(".js-answers-title")).toHaveText("Answers");
  await expect(page.getByRole("button", { name: "Refine", exact: true })).toHaveCount(0);
  expect(await savedSheet("homework-generator", before)).toMatchObject({ kind: "jooma-sheet", tool: "homework" });
});

test("Set homework on a lesson plan opens Homework filled in from the plan", async ({ page }) => {
  const plan = normalizeDraft(
    { title: "Fractions", objective: "I am learning to add fractions", phases: [] },
    sheetContext("lesson", { curriculum: "2014 National Curriculum", yearGroup: "Year 6", subject: "Maths", topic: "Fractions", lessonLength: 60 }),
  );
  const { data, error } = await admin.from("tool_runs").insert({ user_id: teacher.id, tool_slug: "lesson-planner", title: "Fractions", input: {}, output: serializeSheet(plan) }).select("id").single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${data.id}`);
  await page.getByTestId("lesson-handoffs").getByRole("link", { name: "Set homework" }).click(NAV);
  await expect(page).toHaveURL(/\/tools\/homework-generator\?prefill=/, NAV);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("Maths", NAV);
  await expect(page.getByLabel("Learning objective", { exact: false }).first()).toHaveValue("I am learning to add fractions");
  // The type and length stay the teacher's choice.
  await expect(page.getByLabel("Homework Type")).toHaveValue("");
});

test("model text: the clean text, then a teacher copy with the feature marked and numbered", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("model-text-generator")).length;
  await page.route("**/api/model-text-generator", (route) => route.fulfill(json(MODEL_TEXT)));
  await modelTextForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  await expect(pages(page).locator(".js-section-title")).toHaveText(["The text"]);
  await expect(pages(page).locator(".js-exemplar-level")).toHaveText("Teacher copy");
  await expect(pages(page).locator(".js-exemplar .js-mark")).toHaveText(["Have you ever felt"]);
  await expect(pages(page).locator(".js-exemplar .js-mark-n").first()).toHaveText("1");
  await expect(pages(page).locator(".js-exemplar-marks")).toHaveText("Features marked");

  // The teacher copy switches off in Design.
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByTestId("sheet-design-panel").getByLabel("Teacher copy").uncheck();
  await expect(pages(page).locator(".js-exemplar")).toHaveCount(0);
  expect(await savedSheet("model-text-generator", before)).toMatchObject({ tool: "modelText" });
});

test("SMART targets: the name never reaches the model or Jo, and is on the page", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("smart-targets")).length;
  const sent: string[] = [];
  await page.route("**/api/smart-targets", (route) => { sent.push(route.request().postData() ?? ""); return route.fulfill(json(TARGETS)); });
  const joBodies: string[] = [];
  await page.route("**/api/jo", (route) => {
    joBodies.push(route.request().postData() ?? "");
    return route.fulfill(json({ reply: "Done.", clarify: null, ops: [], summary: "No change." }));
  });
  await targetsForm(page);
  await expect(page.getByTestId("pupil-privacy-note")).toBeVisible();
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toMatch(word(NAME));
  expect(JSON.parse(sent[0])).toMatchObject({ named: true, pronouns: "he", targets: "[PUPIL] should read ten tricky words.\n[PUPIL]'s help card: ask for help instead of shouting out." });

  await expect(pages(page).locator(".js-title")).toHaveText(`SMART targets: ${NAME}`);
  await expect(pages(page).locator(".js-section-title")).toHaveText(["Pupil details", "Targets", "Review", "Agreed by"]);
  await expect(pages(page).getByText(`Helps ${NAME} read`)).toBeVisible();
  await expect(pages(page).getByText("[PUPIL]")).toHaveCount(0);

  await page.getByTestId("jo-input").fill(`Make ${NAME}'s targets simpler`);
  await page.getByTestId("jo-send").click();
  await expect.poll(() => joBodies.length, NAV).toBe(1);
  expect(joBodies[0]).not.toMatch(word(NAME));
  expect(joBodies[0]).not.toContain("Pupil details");

  const saved = await savedSheet("smart-targets", before);
  expect(saved).toMatchObject({ tool: "targets", pupil: { name: NAME } });
  expect(JSON.stringify({ ...saved, pupil: null })).not.toMatch(word(NAME));
});

test("a pupil document the model wrote nothing into is an error, not a saved page of details", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("smart-targets")).length;
  await page.route("**/api/smart-targets", (route) => route.fulfill(json({ targets: [] })));
  await targetsForm(page);
  await generate(page).click();
  await expect(page.getByText("The targets came back empty. Please try again.")).toBeVisible(NAV);
  await expect(sheet(page)).toHaveCount(0);
  await page.waitForTimeout(2000);
  expect((await runs("smart-targets")).length).toBe(before);
});

test("interventions: every box is sent with [PUPIL], the plan is drawn with the name, and offers a practice worksheet", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("targeted-intervention")).length;
  const sent: string[] = [];
  await page.route("**/api/targeted-intervention", (route) => { sent.push(route.request().postData() ?? ""); return route.fulfill(json(STRATEGIES)); });
  await interventionForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toMatch(word(NAME));
  const body = JSON.parse(sent[0]);
  expect(body.attitudinalData).toContain("[PUPIL] says");
  expect(body.otherData).toContain("[PUPIL] works best");

  await expect(pages(page).locator(".js-title")).toHaveText(`Intervention ideas: ${NAME}`);
  await expect(pages(page).getByText(`Daily practice for ${NAME}.`)).toBeVisible();
  await expect(pages(page).locator(".js-section-title").filter({ hasText: "Tracking the strategies" })).toHaveCount(1);
  const link = page.getByTestId("lesson-handoffs").getByRole("link", { name: "Make a practice worksheet" });
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).not.toMatch(word(NAME));
  expect(await savedSheet("targeted-intervention", before)).toMatchObject({ tool: "intervention" });
});

test("phonics: the scheme's words and note, made-up words as cards, activities with support and challenge; no bands", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("phonics-support")).length;
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/phonics-support", (route) => { sent = route.request().postDataJSON(); return route.fulfill(json(PHONICS)); });
  await phonicsForm(page, "rwi");
  await expect(page.getByText("Include differentiation")).toHaveCount(0);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ grapheme: "ai", scheme: "rwi" });
  expect(sent).not.toHaveProperty("differentiate");
  await expect(pages(page).getByText(/Extra practice to use alongside Read Write Inc\. Phonics/)).toBeVisible();
  await expect(pages(page).locator(".js-section-title").filter({ hasText: "Alien words" })).toHaveCount(1);
  await expect(pages(page).locator(".js-section-title").filter({ hasText: "Activity 1: Sound hunt" })).toHaveCount(1);
  await expect(pages(page).getByText(/Challenge:/).first()).toBeVisible();
  expect(await savedSheet("phonics-support", before)).toMatchObject({ tool: "phonics" });
});

test("early years: a landscape week grid and the seven areas; an unticked option is in the plan but switched off", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("eyfs-planner")).length;
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/eyfs-planner", (route) => { sent = route.request().postDataJSON(); return route.fulfill(json(EYFS)); });
  await eyfsForm(page);
  await expect(page.getByText("Include differentiation")).toHaveCount(0);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).not.toHaveProperty("differentiate");
  await expect(pages(page).locator(".js-section-title").filter({ hasText: "Weeks 1 to 2 at a glance" })).toHaveCount(1);
  for (const [, name] of EYFS_AREAS) await expect(pages(page).locator(".js-section-title").filter({ hasText: name })).toHaveCount(1);
  await expect(pages(page).locator(".js-section-title").filter({ hasText: "Books to share" })).toHaveCount(1);
  // Home learning was not ticked: written, but switched off in Design.
  await expect(pages(page).locator(".js-section-title").filter({ hasText: "Home learning" })).toHaveCount(0);
  const saved = await savedSheet("eyfs-planner", before);
  expect(saved).toMatchObject({ tool: "eyfsPlan", design: { landscape: true, hidden: ["home"] } });
  expect(saved.sections.some((s) => s.role === "home")).toBe(true);
});

test("runs saved before the uplift still open as the documents they were", async ({ page }) => {
  const slugs = ["homework-generator", "model-text-generator", "smart-targets", "targeted-intervention", "phonics-support", "eyfs-planner"];
  const ids: Record<string, string> = {};
  for (const slug of slugs) {
    const { data, error } = await admin.from("tool_runs").insert({ user_id: teacher.id, tool_slug: slug, title: "Old run", input: {}, output: `# Old ${slug}\n\nSaved before the uplift.` }).select("id").single();
    if (error) throw new Error(error.message);
    ids[slug] = data.id;
  }
  await signIn(page, teacher);
  for (const slug of slugs) {
    await page.goto(`/tools/${slug}?run=${ids[slug]}`);
    await expect(page.getByText("Saved before the uplift.").first()).toBeVisible(NAV);
    await expect(sheet(page)).toHaveCount(0);
  }
});

// ── Live runs: one per tool, only with LIVE_MODEL=1 ─────────────────────────

const live = () => test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
const noDashes = (doc: unknown) => expect(JSON.stringify(doc)).not.toMatch(/[–—]/);

test("LIVE homework", async ({ page }) => {
  live();
  test.setTimeout(420_000);
  await signIn(page, teacher);
  const before = (await runs("homework-generator")).length;
  await homeworkForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("homework-generator", before);
  expect(doc.sections.map((s) => s.role)).toEqual(["instructions", "remember", "task", "checklist"]);
  noDashes(doc);
});

test("LIVE model text", async ({ page }) => {
  live();
  test.setTimeout(420_000);
  await signIn(page, teacher);
  const before = (await runs("model-text-generator")).length;
  await modelTextForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("model-text-generator", before);
  expect(doc.sections.map((s) => s.role)).toEqual(["text", "teacher"]);
  // Most features quote the text exactly, so most are marked.
  await expect.poll(async () => await pages(page).locator(".js-exemplar .js-mark").count(), NAV).toBeGreaterThanOrEqual(3);
  noDashes(doc);
});

test("LIVE targets", async ({ page }) => {
  live();
  test.setTimeout(420_000);
  await signIn(page, teacher);
  const before = (await runs("smart-targets")).length;
  await targetsForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("smart-targets", before);
  expect(JSON.stringify({ ...doc, pupil: null })).not.toMatch(word(NAME));
  expect(doc.sections.map((s) => s.role)).toEqual(["details", "targets", "review", "signatures"]);
  noDashes({ ...doc, pupil: null });
});

test("LIVE interventions", async ({ page }) => {
  live();
  test.setTimeout(420_000);
  await signIn(page, teacher);
  const before = (await runs("targeted-intervention")).length;
  await interventionForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("targeted-intervention", before);
  expect(JSON.stringify({ ...doc, pupil: null })).not.toMatch(word(NAME));
  expect(doc.sections.filter((s) => s.role === "strategy").length).toBeGreaterThanOrEqual(6);
  noDashes({ ...doc, pupil: null });
});

test("LIVE phonics", async ({ page }) => {
  live();
  test.setTimeout(420_000);
  await signIn(page, teacher);
  const before = (await runs("phonics-support")).length;
  await phonicsForm(page, "little-wandle");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("phonics-support", before);
  expect(doc.sections.filter((s) => s.role === "activity")).toHaveLength(5);
  expect(doc.sections.map((s) => s.role)).toContain("decodable");
  noDashes(doc);
});

test("LIVE early years plan", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("eyfs-planner")).length;
  await eyfsForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 420_000 });
  const doc = await savedSheet("eyfs-planner", before);
  expect(doc.sections.filter((s) => s.role === "area")).toHaveLength(7);
  expect(doc.sections.filter((s) => s.role === "grid")).toHaveLength(1);
  noDashes(doc);
});
