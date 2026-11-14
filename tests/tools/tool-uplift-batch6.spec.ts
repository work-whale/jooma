import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { renderSlide, type SlideSpec } from "../../app/lib/slideshow-layouts";
import { getTheme } from "../../app/lib/slideshowThemes";

/*
 * Tool uplift batch 6: Inspection Prep, Policy, Meeting Planner, Staff
 * Slides and Assembly.
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
  teacher = await createTeacher("Batchsix");
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

interface SavedSheet { kind: string; tool: string; title: string; design: { landscape?: boolean; hidden?: string[] }; sections: { role?: string; title: string; blocks: { type: string; text?: string; title?: string; items?: string[]; headers?: string[]; rows?: string[][] }[] }[] }

async function runs(slug: string) {
  const { data } = await admin.from("tool_runs").select("id, output, input").eq("user_id", teacher.id).eq("tool_slug", slug).order("created_at", { ascending: false });
  return data ?? [];
}

async function savedSheet(slug: string, before: number): Promise<SavedSheet> {
  await expect.poll(async () => (await runs(slug)).length, NAV).toBe(before + 1);
  return JSON.parse((await runs(slug))[0].output as string) as SavedSheet;
}

// ── Step 1: Inspection Prep ─────────────────────────────────────────────────

const AREA = (area: string) => ({
  area,
  questions: [`How do leaders know ${area.toLowerCase()} is strong?`, "What would pupils say?"],
  actions: [{ action: `Review ${area.toLowerCase()} evidence with governors`, leadRole: "Deputy head", byWhen: "Before half term" }],
  evidence: ["Minutes of governor visits"],
  successCriteria: ["Leaders can explain their priorities"],
});
const INSPECTION = {
  intro: "This guide helps leaders prepare for an Ofsted inspection under the renewed framework.",
  areas: [AREA("Achievement"), AREA("Safeguarding"), AREA("Inclusion"), AREA("Quality of education")],
};

test("inspection prep: Ofsted areas in framework order with blank tick rows; no policy developments; saved as a sheet", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("inspection-prep")).length;
  let sent = "";
  await page.route("**/api/inspection-prep", (route) => { sent = route.request().postData() ?? ""; return route.fulfill(json(INSPECTION)); });
  await page.goto("/tools/inspection-prep", NAV);
  await expect(page.getByText("Include recent policy changes")).toHaveCount(0);
  await expect(page.getByLabel("Inspection or accreditation body")).toHaveValue("ofsted");
  await page.getByLabel("Early years (nursery or reception)").check();
  await page.getByLabel("Include evidence examples").check();
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(JSON.parse(sent)).toMatchObject({ inspectionBody: "ofsted", earlyYears: true, includeEvidence: true, includeSuccessCriteria: false });
  await expect(titles(page)).toContainText(["Introduction", "Safeguarding", "Inclusion", "Achievement"]);
  await expect(titles(page).filter({ hasText: "Quality of education" })).toHaveCount(0);
  await expect(pages(page).getByText("Exceptional", { exact: true })).toHaveCount(2);
  await expect(pages(page).getByText("Not met", { exact: true })).toHaveCount(1);
  await expect(pages(page).getByText("Minutes of governor visits").first()).toBeVisible();
  await expect(pages(page).getByText("Leaders can explain their priorities")).toHaveCount(0);

  const saved = await savedSheet("inspection-prep", before);
  expect(saved.tool).toBe("inspection");
  const area = saved.sections.find((s) => s.title === "Achievement")!;
  expect(area.blocks.find((b) => b.type === "table")!.rows!.map((r) => r[3])).toEqual([""]);
});

test("inspection prep: another body, typed via Other, gets its own headings and the check note", async ({ page }) => {
  await signIn(page, teacher);
  let sent = "";
  await page.route("**/api/inspection-prep", (route) => {
    sent = route.request().postData() ?? "";
    return route.fulfill(json({ intro: "For CIS.", areas: [AREA("Purpose and direction"), AREA("Wellbeing")] }));
  });
  await page.goto("/tools/inspection-prep", NAV);
  await page.getByLabel("Inspection or accreditation body").selectOption("other");
  await expect(page.getByText("Our school has")).toHaveCount(0);
  await expect(generate(page)).toBeDisabled();
  await page.getByLabel("Name of the inspection or accreditation body").fill("CIS");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  expect(JSON.parse(sent)).toMatchObject({ inspectionBody: "other", otherBody: "CIS" });
  await expect(titles(page)).toContainText(["Purpose and direction", "Wellbeing"]);
  await expect(pages(page).getByText(/Check these headings against CIS's current framework/)).toBeVisible();
  await expect(pages(page).getByText("Where are we now?")).toHaveCount(0);
});

test("LIVE inspection prep", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("inspection-prep")).length;
  await page.goto("/tools/inspection-prep", NAV);
  await page.getByLabel("Include success criteria").check();
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("inspection-prep", before);
  const areas = saved.sections.filter((s) => s.role === "area");
  expect(areas.map((s) => s.title)).toEqual(["Safeguarding", "Inclusion", "Curriculum and teaching", "Achievement", "Attendance and behaviour", "Personal development and wellbeing", "Leadership and governance"]);
  for (const a of areas) expect(a.blocks.find((b) => b.type === "table")!.rows!.every((r) => r[3] === "")).toBe(true);
  expect(JSON.stringify(saved)).not.toMatch(/requires improvement|quality of education|overall effectiveness/i);
  noDashes(saved);
});

// ── Step 2: Policy ──────────────────────────────────────────────────────────

const POLICY = {
  summary: "This policy sets out how we promote good behaviour.",
  sections: [
    { title: "Our approach", clauses: ["We teach routines explicitly.", "We praise effort."] },
    { title: "Sanctions", clauses: ["Sanctions are fair and consistent."] },
  ],
  roles: [{ role: "Headteacher", duties: "Publishes the policy on the website." }],
  references: [{ title: "Behaviour in schools (DfE)", note: "Statutory guidance." }],
  linkedPolicies: ["Anti-Bullying Policy"],
};

test("policy: catalogue status in the form and details box, numbered clauses, version history switchable", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("policy-generator")).length;
  let sent = "";
  await page.route("**/api/policy-generator", (route) => { sent = route.request().postData() ?? ""; return route.fulfill(json(POLICY)); });
  await page.goto("/tools/policy-generator", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByRole("button", { name: "Behaviour & Pastoral" }).click();
  await page.getByRole("button", { name: "Behaviour Policy", exact: true }).click();
  await expect(page.getByTestId("policy-status")).toContainText("Statutory for state-funded schools");
  await page.getByLabel("Additional requirements").fill("Mrs Khan is our DSL.");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  // The form posts the raw text; the route scrubs it before the model.
  expect(JSON.parse(sent)).toMatchObject({ policy: "Behaviour Policy", outputType: "full" });
  await expect(titles(page)).toContainText(["1. Purpose", "2. Our approach", "3. Sanctions", "4. Roles and responsibilities", "5. Legislation and guidance", "6. Linked policies", "Version history"]);
  await expect(pages(page).getByText("2.2 We praise effort.")).toBeVisible();
  await expect(pages(page).locator("td", { hasText: /^Statutory for state-funded schools/ })).toHaveCount(1);
  await expect(pages(page).getByText(/check these are the current versions/i)).toBeVisible();

  const saved = await savedSheet("policy-generator", before);
  expect(saved.tool).toBe("policy");

  await page.getByRole("button", { name: /^design$/i }).click();
  await page.getByRole("checkbox", { name: "Version history" }).uncheck();
  await expect(titles(page).filter({ hasText: "Version history" })).toHaveCount(0);
});

test("policy: a typed policy is told to check its status", async ({ page }) => {
  await signIn(page, teacher);
  await page.route("**/api/policy-generator", (route) => route.fulfill(json(POLICY)));
  await page.goto("/tools/policy-generator", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Policy", { exact: true }).fill("School Uniform Policy");
  await expect(page.getByTestId("policy-status")).toContainText("Not in our list");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  await expect(pages(page).locator("td", { hasText: /^Check whether this policy is statutory/ })).toHaveCount(1);
});

test("LIVE policy", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("policy-generator")).length;
  await page.goto("/tools/policy-generator", NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Policy", { exact: true }).fill("Attendance Policy");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("policy-generator", before);
  const numbered = saved.sections.filter((s) => /^\d+\. /.test(s.title)).map((s) => s.title);
  expect(numbered.length).toBeGreaterThanOrEqual(5);
  numbered.forEach((t, i) => expect(t.startsWith(`${i + 1}. `)).toBe(true));
  expect(JSON.stringify(saved)).not.toMatch(/requires improvement|quality of education/i);
  noDashes(saved);
});

// ── Step 3: Meeting Planner ─────────────────────────────────────────────────

const MEETING = {
  title: "Annual review",
  overview: "A review of [PUPIL]'s progress and support.",
  preparation: ["Share reports a week before"],
  icebreaker: "",
  items: [
    { title: "Welcome", minutes: 5, leadRole: "SENCo", purpose: "inform", notes: ["Set the aims"] },
    { title: "Progress since last review", minutes: 25, leadRole: "Class teacher", purpose: "discuss", notes: ["Use the data"] },
    { title: "Agree outcomes", minutes: 10, leadRole: "SENCo", purpose: "decide", notes: [] },
  ],
  followUp: ["Send the minutes within a week"],
};

test("meeting: the pupil's name and 'Mr Patel' reach no request (generate or Jo); clock times add up; action log blank", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("meeting-planner")).length;
  const bodies: string[] = [];
  await page.route("**/api/meeting-planner", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json(MEETING)); });
  await page.route("**/api/jo", (route) => { bodies.push(route.request().postData() ?? ""); return route.fulfill(json({ reply: "Done.", clarify: null, ops: [], summary: "" })); });
  await page.goto("/tools/meeting-planner", NAV);
  await page.getByLabel("Pupil (optional, page only)").fill("Amira");
  await page.getByLabel("Start time (optional)").fill("15:30");
  await page.getByLabel(/purpose/i).first().fill("Annual review for Amira with Mr Patel");
  await page.getByLabel(/participants/i).first().fill("SENCo, class teacher, Mr Patel, parents");
  await page.getByLabel("Include a blank action log").check();
  await expect(page.getByTestId("meeting-privacy")).toBeVisible();
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await expect(pages(page).getByText("A review of Amira's progress and support.")).toBeVisible();
  await expect(pages(page).locator("td", { hasText: /^15:30 to 16:30$/ })).toHaveCount(1);
  // 5, 25 and 10 minutes scaled to 60 and rounded to 5: 10, 40, 10.
  await expect(pages(page).locator("td", { hasText: /^15:40 to 16:20$/ })).toHaveCount(1);
  await expect(pages(page).locator("td", { hasText: /^16:20 to 16:30$/ })).toHaveCount(1);
  await expect(titles(page)).toContainText(["Agenda", "Facilitator notes", "Minutes", "Action log"]);

  const saved = await savedSheet("meeting-planner", before);
  expect(saved.tool).toBe("meeting");
  expect(JSON.stringify(saved.sections)).not.toMatch(/Amira|Patel/);
  await page.waitForTimeout(500);

  await page.getByTestId("jo-input").fill("Give more time to progress");
  await page.getByTestId("jo-send").click();
  await expect.poll(() => bodies.length, NAV).toBe(2);
  for (const b of bodies) expect(b).not.toMatch(/Amira|Patel|pupilName/);
  expect(bodies[0]).toContain("[PUPIL]");

  // The notes switch off so the agenda can be sent alone.
  await page.getByRole("button", { name: /^design$/i }).click();
  await page.getByRole("checkbox", { name: "Facilitator notes" }).uncheck();
  await expect(titles(page).filter({ hasText: "Facilitator notes" })).toHaveCount(0);
});

test("LIVE meeting", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("meeting-planner")).length;
  await page.goto("/tools/meeting-planner", NAV);
  await page.getByLabel(/purpose/i).first().fill("Half-termly staff meeting on reading for pleasure");
  await page.getByLabel(/participants/i).first().fill("All teaching staff and TAs");
  await page.getByLabel("Start time (optional)").fill("15:40");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("meeting-planner", before);
  const agenda = saved.sections.find((s) => s.title === "Agenda")!.blocks[0];
  expect(agenda.rows![0][0].startsWith("15:40 to ")).toBe(true);
  expect(agenda.rows![agenda.rows!.length - 1][0].endsWith(" to 16:40")).toBe(true);
  noDashes(saved);
});

// ── Step 4: Staff Slides on the main engine, with speaker notes ─────────────

/** A deck stream as /api/generate-slideshow sends it, built with the real
 *  renderer, so the editor sees exactly what it would. */
function deckStream(title: string, specs: Partial<SlideSpec>[]): string {
  const theme = getTheme("paper");
  const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const slides = specs.map((s, i) => {
    const spec = { colorScheme: "light", accentColor: theme.palette.accent, ...s } as SlideSpec;
    const slide = { ...renderSlide(spec, theme), skeleton: { ...spec } } as Record<string, unknown>;
    if (i === 0) slide.themeId = "paper";
    return slide;
  });
  return (
    ev("meta", { title, total: slides.length, slideTitles: specs.map((s) => s.title) }) +
    slides.map((slide, index) => ev("slide", { index, total: slides.length, contentTotal: slides.length, slide, title: specs[index].title })).join("") +
    ev("complete", { title })
  );
}

const STAFF_DECK = [
  { layout: "title-hero" as const, title: "Retrieval that sticks", subtitle: "Staff training", speakerNotes: "Welcome everyone. Today is about retrieval practice." },
  { layout: "paper-image-right" as const, title: "Why it works", bullets: ["**Recall** strengthens memory"], speakerNotes: "Ask staff when they last had to recall something." },
  { layout: "activity-question" as const, title: "Talk it through", activityKind: "question" as const, body: "In pairs, 3 minutes: where could you add a quiz?", speakerNotes: "Give pairs three minutes, then take two answers." },
];

test("staff slides: opens the editor with speaker notes, saved under Staff Slides, notes in the PowerPoint", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("cpd-slideshow")).length;
  let sent: Record<string, unknown> = {};
  await page.route("**/api/generate-slideshow", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: deckStream("Retrieval that sticks", STAFF_DECK) });
  });
  await page.goto("/tools/cpd-slideshow", NAV);
  await expect(page.getByText("Include image suggestions")).toHaveCount(0);
  await page.getByLabel(/topic/i).first().fill("Retrieval practice");
  await page.getByLabel("Research and theory").check();
  await generate(page).click();
  await page.waitForURL(/\/editor\//, NAV);
  await expect(page.getByTestId("slide-editor")).toBeVisible(NAV);

  expect(sent).toMatchObject({ topic: "Retrieval practice", deckKind: "staff", staffFocus: "research", imageSource: "web" });
  // The editor ends on the last slide it revealed: the discussion task.
  const notes = page.getByTestId("speaker-notes");
  await expect(notes).toHaveValue("Give pairs three minutes, then take two answers.", NAV);

  // Saved under Staff Slides, pointing at the presentation.
  await expect.poll(async () => (await runs("cpd-slideshow")).length, NAV).toBe(before + 1);
  const run = (await runs("cpd-slideshow"))[0];
  const presentationId = (run.input as { presentationId: string }).presentationId;
  const editorId = page.url().split("/editor/")[1].split(/[?#]/)[0];
  expect(presentationId).toBe(editorId);

  // Edit the notes; they are saved with the deck, the others kept.
  await notes.fill("Two minutes in pairs, then share.");
  await expect
    .poll(async () => {
      const { data } = await admin.from("presentations").select("slides").eq("id", presentationId).single();
      return (data?.slides as { notes?: string }[] | undefined)?.map((s) => s.notes);
    }, NAV)
    .toEqual(["Welcome everyone. Today is about retrieval practice.", "Ask staff when they last had to recall something.", "Two minutes in pairs, then share."]);

  // The PowerPoint carries the notes.
  const download = page.waitForEvent("download", NAV);
  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("menuitem", { name: "Download PowerPoint (PPTX)" }).click();
  const file = await (await download).path();
  const zip = await JSZip.loadAsync(readFileSync(file!));
  const notesXml = await Promise.all(Object.keys(zip.files).filter((n) => /notesSlide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")));
  expect(notesXml.join(" ")).toContain("Two minutes in pairs, then share.");
  expect(notesXml.join(" ")).toContain("Welcome everyone. Today is about retrieval practice.");

  // The history on Staff Slides reopens it in the editor.
  await page.goto(`/tools/cpd-slideshow?run=${run.id}`, NAV);
  await page.waitForURL(new RegExp(`/editor/${presentationId}`), NAV);
});

test("staff slides: an old deck opens read-only with its own downloads", async ({ page }) => {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({
      user_id: teacher.id,
      tool_slug: "cpd-slideshow",
      title: "Feedback",
      input: { topic: "Feedback that works", slideCount: 2 },
      output: JSON.stringify([
        { type: "title", title: "Feedback that works", presentationTitle: "Feedback that works", subtitle: "INSET day" },
        { type: "content", title: "Why feedback matters", presentationTitle: "Feedback that works", body: "It closes the gap." },
      ]),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/cpd-slideshow?run=${data.id}`, NAV);
  const legacy = page.getByTestId("legacy-staff-slides");
  await expect(legacy).toBeVisible(NAV);
  await expect(legacy.getByText("Why feedback matters")).toBeVisible();
  await expect(legacy.getByRole("button", { name: "Download options" })).toBeVisible();
  await expect(page.getByLabel(/topic/i).first()).toHaveValue("Feedback that works");
});

test("pupil slides: a pupil deck shows no notes panel", async ({ page }) => {
  await signIn(page, teacher);
  await page.route("**/api/generate-slideshow", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: deckStream("Volcanoes", [{ layout: "title-hero", title: "Volcanoes", subtitle: "Year 4" }]) }),
  );
  const { data } = await admin.from("presentations").insert({ user_id: teacher.id, title: "Generating…", slides: [], generation_params: { topic: "Volcanoes" } }).select("id").single();
  await page.goto("/tools/slideshow", NAV);
  await page.evaluate((id) => sessionStorage.setItem(`jooma:generation-params:${id}`, JSON.stringify({ topic: "Volcanoes" })), data!.id);
  await page.goto(`/editor/${data!.id}`, NAV);
  await expect(page.getByTestId("slide-editor")).toBeVisible(NAV);
  await expect(page.getByText("Deck ready", { exact: false })).toBeVisible(NAV);
  await expect(page.getByTestId("speaker-notes")).toHaveCount(0);
});

test("LIVE staff slides", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  await page.goto("/tools/cpd-slideshow", NAV);
  await page.getByLabel(/topic/i).first().fill("Using mini whiteboards to check understanding");
  await generate(page).click();
  await page.waitForURL(/\/editor\//, NAV);
  await expect(page.getByText("Deck ready", { exact: false })).toBeVisible(LIVE);
  const id = page.url().split("/editor/")[1].split(/[?#]/)[0];
  const { data } = await admin.from("presentations").select("slides").eq("id", id).single();
  const slides = data!.slides as { notes?: string; skeleton?: { layout?: string } }[];
  expect(slides.length).toBe(7);
  for (const s of slides) expect((s.notes ?? "").split(/\s+/).length).toBeGreaterThan(20);
  expect(slides.some((s) => s.skeleton?.layout === "activity-question")).toBe(true);
  expect(slides.every((s) => !["paper-vocab-grid", "activity-ordering", "paper-quote"].includes(s.skeleton?.layout ?? ""))).toBe(true);
  noDashes(slides.map((s) => s.notes));
});

// ── Step 5: Assembly ────────────────────────────────────────────────────────

const ASSEMBLY = {
  title: "Small acts, big difference",
  message: "Kindness changes a day.",
  parts: [
    { part: "intro", title: "Welcome", minutes: 2, say: ["Good morning, everyone."], delivery: ["Wait for quiet"] },
    { part: "story", title: "The lost glove", minutes: 8, say: ["Tell the story of the glove."], delivery: ["Pause at the twist"] },
    { part: "questions", title: "Let us think", minutes: 4, say: ["Ask the questions"], delivery: [] },
    { part: "reflection", title: "Quiet", minutes: 3, say: ["Close your eyes."], delivery: [] },
  ],
  questions: ["When did someone help you?"],
  resources: ["A glove"],
  preparation: ["Practise the story"],
};

test("assembly: running order fits the length, closing follows the picker, then slides with notes from the script", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await runs("assembly-planner")).length;
  let sent: Record<string, unknown> = {};
  let deck: Record<string, unknown> = {};
  await page.route("**/api/assembly-planner", (route) => { sent = route.request().postDataJSON(); return route.fulfill(json(ASSEMBLY)); });
  await page.route("**/api/generate-slideshow", (route) => {
    deck = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: deckStream("Small acts, big difference", [
        { layout: "title-hero", title: "Small acts, big difference", subtitle: "Kindness changes a day", speakerNotes: "Good morning, everyone." },
        { layout: "paper-image-right", title: "The lost glove", speakerNotes: "Tell the story of the glove." },
      ]),
    });
  });
  await page.goto("/tools/assembly-planner", NAV);
  await page.getByLabel(/theme/i).first().fill("Kindness");
  await page.getByLabel("Closing").selectOption("faith");
  await expect(generate(page)).toBeDisabled();
  await page.getByLabel("Your school's faith").fill("Catholic");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  expect(sent).toMatchObject({ theme: "Kindness", reflection: "faith", faith: "Catholic" });
  await expect(titles(page)).toContainText(["Key message", "Running order", "Welcome", "The lost glove", "Prayer and reflection", "Resources"]);
  await expect(pages(page).locator("td", { hasText: /^Prayer and reflection \(Catholic\)$/ })).toHaveCount(1);
  const saved = await savedSheet("assembly-planner", before);
  expect(saved.tool).toBe("assembly");
  const order = saved.sections.find((s) => s.title === "Running order")!.blocks[0];
  expect(order.rows!.reduce((n, r) => n + Number(r[0]), 0)).toBe(20);

  await page.getByRole("link", { name: "Make assembly slides" }).click();
  await page.waitForURL(/\/editor\//, NAV);
  await expect(page.getByTestId("speaker-notes")).toHaveValue("Tell the story of the glove.", NAV);
  expect(deck).toMatchObject({ deckKind: "assembly", topic: "Small acts, big difference", slideCount: 5, imageSource: "web" });
  expect(String(deck.resourceText)).toContain("Tell the story of the glove.");
});

test("LIVE assembly", async ({ page }) => {
  live();
  test.setTimeout(480_000);
  await signIn(page, teacher);
  const before = (await runs("assembly-planner")).length;
  await page.goto("/tools/assembly-planner", NAV);
  await page.getByLabel(/theme/i).first().fill("Remembrance");
  await page.getByLabel("Closing").selectOption("worship");
  await generate(page).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", LIVE);
  const saved = await savedSheet("assembly-planner", before);
  const order = saved.sections.find((s) => s.title === "Running order")!.blocks[0];
  expect(order.rows!.reduce((n, r) => n + Number(r[0]), 0)).toBe(20);
  expect(saved.sections.some((s) => s.title === "Collective worship")).toBe(true);
  noDashes(saved);
});
