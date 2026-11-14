import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Tool uplift batch 4: Pupil Premium, EYFS Action Plan, Risk Assessment,
 * Sensory Activities and Newsletter as designed sheets, plus the step 0 fixes
 * (the ECT's name kept off the model).
 *
 * The screen tests answer each route (and /api/jo, /api/modify) with
 * page.route: NOTHING IS SPENT. The LIVE tests really generate on staging and
 * are skipped unless LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Batchfour");
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
const LIVE = { timeout: 420_000 };
const live = () => test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
const noDashes = (doc: unknown) => expect(JSON.stringify(doc)).not.toMatch(/[–—]/);

interface SavedSheet { kind: string; tool: string; title: string; roster?: string[]; design: { landscape?: boolean; hidden?: string[] }; sections: { role?: string; title: string; blocks: { type: string; text?: string; headers?: string[]; rows?: string[][] }[] }[] }

async function runs(slug: string) {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", slug).order("created_at", { ascending: false });
  return data ?? [];
}

async function savedSheet(slug: string, before: number): Promise<SavedSheet> {
  await expect.poll(async () => (await runs(slug)).length, NAV).toBe(before + 1);
  return JSON.parse((await runs(slug))[0].output as string) as SavedSheet;
}

// Step 0's ECT name test moved to tool-uplift-batch5.spec.ts when the ECT
// report became a sheet (generate and Ask Jo; Refine gave way to Jo).

// ── Step 0: a table taller than a page runs onto the next, header repeated ─

test("a long table splits between rows with its header on every page; a short one stays whole", async ({ page }) => {
  const long = Array.from({ length: 30 }, (_, i) => [`Hazard ${i + 1}`, "A realistic harm that takes a line or two to describe in full.", "Pupils and staff"]);
  const sheet = normalizeDraft(
    {
      title: "Long table",
      sections: [
        { title: "Short", blocks: [{ type: "table", headers: ["A", "B"], rows: [["1", "2"], ["3", "4"], ["5", "6"]] }] },
        { title: "Long", blocks: [{ type: "table", headers: ["Hazard", "Harm", "Who"], rows: long }] },
      ],
    },
    sheetContext("worksheet", { curriculum: "2014 National Curriculum", yearGroup: "Year 6", subject: "Maths" }),
  );
  const { data, error } = await admin.from("tool_runs").insert({ user_id: teacher.id, tool_slug: "worksheet-generator", title: "Long table", input: {}, output: serializeSheet(sheet) }).select("id").single();
  if (error) throw new Error(error.message);

  await signIn(page, teacher);
  await page.goto(`/tools/worksheet-generator?run=${data.id}`);
  const doc = page.getByTestId("sheet-document");
  await expect(doc).toHaveAttribute("data-ready", "true", NAV);
  const pagesEl = doc.locator(".js-pages .js-page");

  // Every hazard row is drawn exactly once, across more than one page.
  const rows = doc.locator(".js-pages table.js-table tbody tr");
  await expect(rows).toHaveCount(33);
  for (const n of [1, 15, 30]) await expect(doc.locator(".js-pages td", { hasText: new RegExp(`^Hazard ${n}$`) })).toHaveCount(1);

  // The long table is in pieces on at least two pages, each under the header.
  const withHazards = await pagesEl.filter({ has: page.locator("td", { hasText: /^Hazard \d+$/ }) }).count();
  expect(withHazards).toBeGreaterThanOrEqual(2);
  const hazardTables = doc.locator(".js-pages table.js-table", { has: page.locator("td", { hasText: /^Hazard \d+$/ }) });
  expect(await hazardTables.count()).toBe(withHazards);
  for (let i = 0; i < withHazards; i++) await expect(hazardTables.nth(i).locator("thead th").first()).toHaveText("Hazard");

  // No page overflows its paper.
  const overflow = await pagesEl.evaluateAll((els) => els.filter((el) => el.scrollHeight > el.clientHeight + 1).length);
  expect(overflow).toBe(0);

  // The short table is one table on one page.
  await expect(doc.locator(".js-pages table.js-table", { has: page.locator("td", { hasText: /^3$/ }) })).toHaveCount(1);
  await expect(doc.locator(".js-pages table.js-table", { has: page.locator("td", { hasText: /^3$/ }) }).locator("tbody tr")).toHaveCount(3);
});

// ── Step 1: Pupil Premium ───────────────────────────────────────────────────

const PP = {
  intent: ["We want every disadvantaged pupil to read fluently and attend well."],
  challenges: [{ detail: "Reading fluency in Key Stage 2 is low." }, { detail: "Persistent absence is 18%." }],
  outcomes: [{ outcome: "Fluent readers", successCriteria: "Fluency checks show the gap closing." }],
  teaching: [{ activity: "Fluency CPD for every teacher", evidence: "EEF guidance report: Improving literacy in key stage 2", challenges: [1] }],
  targeted: [{ activity: "Small group reading tuition", evidence: "EEF Toolkit: Small group tuition", challenges: [1, 9] }],
  wider: [{ activity: "Attendance mentor for persistent absentees", evidence: "DfE: Working together to improve school attendance", challenges: [2] }],
};

async function ppForm(page: Page) {
  await page.goto("/tools/pupil-premium-planner", NAV);
  await page.getByLabel("Challenges").fill("1. Reading fluency in Key Stage 2 is low.\n2. Persistent absence of disadvantaged pupils is 18%.");
  await page.getByLabel("School name").fill("Oakfield Primary School");
  await page.getByLabel("Number of pupils in school").fill("412");
}

test("pupil premium: the DfE template on landscape pages; school details and costs never sent or invented", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("pupil-premium-planner")).length;
  let sent = "";
  await page.route("**/api/pupil-premium-planner", (route) => { sent = route.request().postData() ?? ""; return route.fulfill(json(PP)); });
  await ppForm(page);
  await expect(page.getByText("Include differentiation")).toHaveCount(0);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(sent).not.toMatch(/Oakfield|412|differentiat/);
  expect(JSON.parse(sent)).toMatchObject({ educationPhase: "Primary" });

  for (const t of ["School overview", "Funding overview", "Challenges", "Intended outcomes", "Teaching (for example, CPD, recruitment and retention)", "Targeted academic support (for example, tutoring, one-to-one support, structured interventions)", "Wider strategies (for example, related to attendance, behaviour, wellbeing)"]) {
    await expect(titles(page).filter({ hasText: t }).first()).toBeVisible();
  }
  await expect(pages(page).getByText("Oakfield Primary School").first()).toBeVisible();
  await expect(pages(page).getByText(/^Budgeted cost:/)).toHaveCount(3);
  await expect(pages(page).getByText(/^Total budgeted cost:/)).toHaveCount(1);
  // A challenge number past the last challenge (9) is dropped.
  await expect(pages(page).locator("td", { hasText: /^1$/ })).not.toHaveCount(0);
  await expect(pages(page).locator("td", { hasText: /9/ })).toHaveCount(0);

  const saved = await savedSheet("pupil-premium-planner", before);
  expect(saved).toMatchObject({ tool: "pupilPremium", design: { landscape: true, hidden: ["service", "further"] } });
  expect(saved.title).toBe("Pupil premium strategy statement: Oakfield Primary School");

  // Part B switches off in Design.
  await expect(titles(page).filter({ hasText: "Part B" })).toHaveCount(1);
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByTestId("sheet-design-panel").getByLabel("Part B: review of last year").uncheck();
  await expect(titles(page).filter({ hasText: "Part B" })).toHaveCount(0);
});

test("LIVE pupil premium", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("pupil-premium-planner")).length;
  await ppForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("pupil-premium-planner", before);
  expect(doc.sections.filter((s) => s.role?.startsWith("area-")).length).toBe(3);
  expect(doc.sections.find((s) => s.role === "challenges")!.blocks[0].rows).toHaveLength(2);
  // No figures the school did not give, and no costs.
  const written = JSON.stringify(doc.sections.filter((s) => ["intent", "challenges", "outcomes"].includes(s.role ?? "") || s.role?.startsWith("area-")).map((s) => s.blocks.filter((b) => b.type === "table" || !b.text?.startsWith("**Budgeted"))));
  expect(written).not.toMatch(/£\s?\d|\bmonths?'? (of )?(additional )?progress/i);
  noDashes(doc);
});

// ── Step 2: EYFS Action Plan ────────────────────────────────────────────────

const EAP = {
  title: "Communication and language: action plan",
  objective: "More children reach the ELGs for Listening, Attention and Understanding, and Speaking.",
  rationale: "Talk underpins all learning.",
  successCriteria: ["Every adult models new vocabulary in continuous provision"],
  phases: [1, 2, 3, 4].map((n) => ({ title: `Step ${n}`, when: `Half term ${n}`, actions: [{ action: `Action ${n}`, lead: "EYFS lead", resources: "Training time", monitoring: "Learning walks" }] })),
  outcomes: ["Children use new words in play"],
};

async function eapForm(page: Page) {
  await page.goto("/tools/eyfs-action-plan", NAV);
  await page.getByLabel("Curriculum").selectOption("Early Years Foundation Stage (EYFS)");
  await page.getByLabel("EYFS Objective").fill("Improve communication and language in Reception, so more children reach the Early Learning Goals for Listening, Attention and Understanding, and Speaking by the summer.");
  await page.getByLabel("Two terms").check();
}

test("EYFS action plan: four landscape phase tables with RAG for the school, no bands", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("eyfs-action-plan")).length;
  let sent: Record<string, unknown> = {};
  await page.route("**/api/eyfs-action-plan", (route) => { sent = route.request().postDataJSON(); return route.fulfill(json(EAP)); });
  await eapForm(page);
  await expect(page.getByText("Include differentiation")).toHaveCount(0);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).toMatchObject({ timescale: "Two terms" });
  expect(sent).not.toHaveProperty("differentiate");
  for (let n = 1; n <= 4; n++) await expect(titles(page).filter({ hasText: `Phase ${n}: Step ${n}` })).toHaveCount(1);
  await expect(pages(page).locator("th", { hasText: /^RAG$/ })).toHaveCount(4);
  await expect(titles(page).filter({ hasText: "Review points" })).toHaveCount(1);
  const saved = await savedSheet("eyfs-action-plan", before);
  expect(saved).toMatchObject({ tool: "eyfsActionPlan", design: { landscape: true } });
});

test("LIVE EYFS action plan", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("eyfs-action-plan")).length;
  await eapForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("eyfs-action-plan", before);
  const phases = doc.sections.filter((s) => s.role === "phase");
  expect(phases).toHaveLength(4);
  for (const p of phases) expect(p.blocks[0].rows!.every((r) => r[4] === "" && r[5] === "")).toBe(true);
  noDashes(doc);
});

// ── Step 3: Risk Assessment ─────────────────────────────────────────────────

const RISK = {
  summary: "A Year 4 coach trip to a London museum.",
  hazards: [
    { hazard: "Crossing busy roads", harm: "Struck by a vehicle", whoAtRisk: "Pupils", likelihood: 3, severity: 5, controls: ["Cross at lights"], residualLikelihood: 1, residualSeverity: 5, furtherActions: [] },
    { hazard: "Pupil separated from the group", harm: "Distress", whoAtRisk: "Pupils", likelihood: 3, severity: 3, controls: ["Head counts"], residualLikelihood: 1, residualSeverity: 3, furtherActions: ["Brief pupils on the meeting point"] },
  ],
};

async function riskForm(page: Page, offsite = true) {
  await page.goto("/tools/risk-assessment", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 4");
  await page.getByLabel(/Activity/).first().fill("Day trip to the Natural History Museum, London");
  if (offsite) {
    await page.getByLabel("Off site (a trip or visit)").check();
    await page.getByLabel(/^Destination/).fill("Natural History Museum, London");
    await page.getByLabel(/Mode of transport/).fill("Coach");
  } else {
    await page.getByLabel("On the school site").check();
  }
  await page.getByLabel("Resources (optional)").fill("Packed lunches, clipboards, first aid kit").catch(() => {});
  await page.getByLabel("Date", { exact: true }).fill("2027-03-04");
  await page.getByLabel(/^(Trip|Activity) leader$/).fill("Ms Zephyrine");
  await page.getByLabel("Number of pupils").fill("30");
  await page.getByLabel("Number of staff").fill("4");
}

test("risk assessment: scores done in code, sign-off and emergency box off site, leader never sent; trip letter handoff", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("risk-assessment")).length;
  let sent = "";
  await page.route("**/api/risk-assessment", (route) => { sent = route.request().postData() ?? ""; return route.fulfill(json(RISK)); });
  await riskForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(sent).not.toMatch(/Zephyrine|2027-03-04/);
  expect(JSON.parse(sent)).toMatchObject({ offsite: true, transport: "Coach" });

  await expect(pages(page).locator("td", { hasText: /^15 High \(3 × 5\)$/ })).toHaveCount(1);
  await expect(pages(page).locator("td", { hasText: /^9 Medium \(3 × 3\)$/ })).toHaveCount(1);
  await expect(pages(page).locator("td", { hasText: /^5 Low \(1 × 5\)$/ })).toHaveCount(1);
  await expect(pages(page).getByText("Ms Zephyrine").first()).toBeVisible();
  await expect(pages(page).getByText("1:8")).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Emergency information" })).toHaveCount(1);
  await expect(pages(page).getByText("Educational Visits Coordinator (EVC)")).toHaveCount(1);
  const saved = await savedSheet("risk-assessment", before);
  expect(saved).toMatchObject({ tool: "riskAssessment", design: { landscape: true } });

  // Write the trip letter: Letter Writer opens as a trip letter, filled in.
  await page.getByRole("link", { name: "Write the trip letter" }).click();
  await expect(page).toHaveURL(/\/tools\/letter-writer\?prefill=/, NAV);
  await expect(page.locator("[data-jo-panel]").first()).toBeVisible(NAV);
  await expect(page.getByText("Jo is filling this in")).toHaveCount(0, NAV);
  await expect(page.getByTestId("letter-type").getByRole("radio", { name: /Trip or visit/ })).toBeChecked();
  await expect(page.getByLabel("Where", { exact: true })).toHaveValue("Natural History Museum, London");
  await expect(page.getByLabel("Who is going")).toHaveValue("Year 4");
  await expect(page.getByLabel("Date of the trip")).toHaveValue("2027-03-04");
});

test("risk assessment on site: no emergency box, no EVC, no trip letter", async ({ page }) => {
  await signIn(page, teacher);
  await page.route("**/api/risk-assessment", (route) => route.fulfill(json(RISK)));
  await riskForm(page, false);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  await expect(titles(page).filter({ hasText: "Sign-off" })).toHaveCount(1);
  await expect(titles(page).filter({ hasText: "Emergency information" })).toHaveCount(0);
  await expect(pages(page).getByText("Educational Visits Coordinator (EVC)")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Write the trip letter" })).toHaveCount(0);
});

test("LIVE risk assessment", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("risk-assessment")).length;
  await riskForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("risk-assessment", before);
  const rows = doc.sections.find((s) => s.role === "hazards")!.blocks[0].rows!;
  expect(rows.length).toBeGreaterThanOrEqual(10);
  for (const r of rows) {
    const m = /^(\d+) (Low|Medium|High) \((\d) × (\d)\)$/.exec(r[2])!;
    const score = Number(m[3]) * Number(m[4]);
    expect(Number(m[1])).toBe(score);
    expect(m[2]).toBe(score <= 6 ? "Low" : score <= 12 ? "Medium" : "High");
  }
  expect(JSON.stringify(doc)).toContain("Ms Zephyrine");
  noDashes(doc);
});

// ── Step 4: Sensory Activities ──────────────────────────────────────────────

const SENSORY = {
  title: "Everyday materials: sensory activities",
  intro: "Pupils learn the properties of materials by feeling, hearing and seeing them.",
  activities: [1, 2, 3, 4, 5].map((n) => ({
    title: `Activity ${n}`, objective: "Pupils will be able to describe materials.", senses: n === 2 ? ["Smell", "Touch"] : ["Touch", "Sight"], focus: "Describing by feel.", resources: ["Feely bag"], steps: ["Feel it", "Describe it"], vocabulary: ["rough", "smooth"],
    sensitive: ["Offer gloves"], seeking: ["Add heavier objects"], sendNote: "Helps pupils with autism.", crossCurricular: ["English: describing words"],
  })),
};

async function sensoryForm(page: Page) {
  await page.goto("/tools/sensory-activities", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 2");
  await page.getByLabel("Subject").fill("Science");
  await page.getByLabel("Topic").fill("Everyday materials and their properties");
}

test("sensory activities: five activity sections, sensory adaptations side by side, allergy reminder", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("sensory-activities")).length;
  await page.route("**/api/sensory-activities", (route) => route.fulfill(json(SENSORY)));
  await sensoryForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  for (let n = 1; n <= 5; n++) await expect(titles(page).filter({ hasText: `${n}. Activity ${n}` })).toHaveCount(1);
  await expect(pages(page).getByText("For pupils who are sensory-sensitive")).toHaveCount(5);
  await expect(pages(page).getByText(/Check every pupil's allergies/)).toHaveCount(1);
  const saved = await savedSheet("sensory-activities", before);
  expect(saved).toMatchObject({ tool: "sensory" });
  // Cross-curricular links switch off in Design.
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByTestId("sheet-design-panel").getByLabel("Cross-curricular links").uncheck();
  await expect(titles(page).filter({ hasText: "Cross-curricular links" })).toHaveCount(0);
});

test("LIVE sensory activities", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("sensory-activities")).length;
  await sensoryForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("sensory-activities", before);
  expect(doc.sections.filter((s) => s.role === "activity")).toHaveLength(5);
  noDashes(doc);
});

// ── Step 5: Newsletter ──────────────────────────────────────────────────────

const NEWS = {
  title: "Autumn Term Newsletter",
  intro: ["Welcome to our autumn newsletter."],
  sections: [
    { heading: "Harvest festival", paragraphs: ["Thank you for 212 food donations."] },
    { heading: "Stars of the week", paragraphs: ["Well done to [PUPIL 1] for kindness and [PUPIL 2] for never giving up in maths."] },
  ],
  celebrationsIntro: "This week we celebrate:",
  signOff: "With best wishes from everyone at Oakfield.",
};

async function newsletterForm(page: Page) {
  await page.goto("/tools/newsletter-writer", NAV);
  await page.getByLabel(/Newsletter title/).fill("Autumn Term Newsletter");
  await page.getByLabel(/School name/).fill("Oakfield Primary School");
  await page.getByLabel("Newsletter tone").selectOption("Warm and friendly");
  await page.getByLabel("Sections").fill("Harvest festival: thank you for 212 food donations, all taken to the local food bank on Friday.");
  await page.getByRole("button", { name: "Add another section" }).click();
  await page.getByLabel("Section 2", { exact: true }).fill("Stars of the week: Amira (Year 3) for kindness to a new classmate, and Leo (Year 5) for never giving up in maths.");
  await page.getByLabel("Pupil 1 name", { exact: true }).fill("Amira");
  await page.getByLabel("Pupil 1 class").fill("Year 3");
  await page.getByLabel("Pupil 1 reason").fill("Kindness to a new classmate");
  await page.getByRole("button", { name: "Add a pupil" }).click();
  await page.getByLabel("Pupil 2 name", { exact: true }).fill("Leo");
  await page.getByLabel("Pupil 2 class").fill("Year 5");
  await page.getByLabel("Pupil 2 reason").fill("Never giving up in maths");
  await page.getByLabel("Date 1", { exact: true }).fill("2026-12-16");
  await page.getByLabel("Event 1", { exact: true }).fill("Year 2 nativity, 2pm");
}

test("newsletter: celebrated pupils never reach the model or Jo, and are named on the page", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("newsletter-writer")).length;
  const bodies: string[] = [];
  await page.route("**/api/newsletter-writer", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(NEWS)); });
  await page.route("**/api/jo", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json({ reply: "Done.", clarify: null, ops: [], summary: "" })); });
  await newsletterForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await expect(pages(page).getByText("Well done to Amira for kindness and Leo for never giving up in maths.")).toBeVisible();
  await expect(pages(page).locator("td", { hasText: /^Amira$/ })).toHaveCount(1);
  await expect(pages(page).locator("td", { hasText: /^Wednesday 16 December$/ })).toHaveCount(1);
  expect(JSON.parse(bodies[0])).toMatchObject({ sections: [expect.any(String), "Stars of the week: [PUPIL 1] (Year 3) for kindness to a new classmate, and [PUPIL 2] (Year 5) for never giving up in maths."], celebrated: 2 });

  const saved = await savedSheet("newsletter-writer", before);
  expect(saved).toMatchObject({ tool: "newsletter", roster: ["Amira", "Leo"] });
  expect(JSON.stringify(saved.sections)).not.toMatch(/Amira|Leo/);

  await page.getByTestId("jo-input").fill("Make it warmer");
  await page.getByTestId("jo-send").click();
  await expect.poll(() => bodies.length, NAV).toBe(2);
  // No name in any request; the dates and the celebrations only on the page
  // (Jo may read the page it edits, never the names).
  for (const b of bodies) expect(b).not.toMatch(/Amira|\bLeo\b/);
  expect(bodies[0]).not.toMatch(/nativity|Kindness to a new classmate/);
  expect(bodies[1]).toContain("[PUPIL 1]");
});

test("newsletter: a malformed body is a 400, not a 500", async ({ page }) => {
  await signIn(page, teacher);
  const status = await page.evaluate(async () => (await fetch("/api/newsletter-writer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tone: "Warm and friendly" }) })).status);
  expect(status).toBe(400);
});

test("LIVE newsletter", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("newsletter-writer")).length;
  await newsletterForm(page);
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const doc = await savedSheet("newsletter-writer", before);
  expect(doc.sections.filter((s) => s.role === "section")).toHaveLength(2);
  expect(JSON.stringify(doc.sections)).toContain("[PUPIL 1]");
  expect(JSON.stringify(doc.sections)).not.toMatch(/Amira|\bLeo\b/);
  await expect(pages(page).getByText(/Amira/).first()).toBeVisible();
  noDashes(doc);
});

// ── Old runs ────────────────────────────────────────────────────────────────

test("runs saved before the uplift still open as the documents they were", async ({ page }) => {
  const slugs = ["pupil-premium-planner", "eyfs-action-plan", "risk-assessment", "sensory-activities", "newsletter-writer"];
  const ids: Record<string, string> = {};
  for (const slug of slugs) {
    const { data, error } = await admin.from("tool_runs").insert({ user_id: teacher.id, tool_slug: slug, title: "Old run", input: {}, output: `# Old ${slug}\n\nSaved before the uplift.` }).select("id").single();
    if (error) throw new Error(error.message);
    ids[slug] = data.id;
  }
  await signIn(page, teacher);
  for (const slug of slugs) {
    await page.goto(`/tools/${slug}?run=${ids[slug]}`, NAV);
    await expect(page.locator(".ProseMirror")).toContainText("Saved before the uplift.", NAV);
    await expect(sheet(page)).toHaveCount(0);
  }
});
