import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { BEHAVIOUR_LIST_FIELDS } from "@/app/lib/sheets/behaviour";

/*
 * Behaviour Support Plan as a designed, editable plan, with the child's name
 * kept away from every model: the form sends "[PUPIL]", the page puts the
 * name back, and neither the plan request nor Ask Jo ever carries it.
 *
 * The screen tests answer /api/behaviour-support-plan and /api/jo with
 * page.route: NOTHING IS SPENT. The LIVE test really generates on staging and
 * is skipped unless LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

/** A name nothing else on the page could contain. */
const NAME = "Zephyr";
const STAFF = "Mrs Okonkwo";
const word = (w: string) => new RegExp(`\\b${w}\\b`, "i");

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What the model would stream: [PUPIL] throughout, as it is told to. */
const MODEL_PLAN: Record<string, unknown> = {
  ...Object.fromEntries(BEHAVIOUR_LIST_FIELDS.map((f) => [f, [`${f}: [PUPIL] point`]])),
  escalation: "Tell the head of year if [PUPIL] leaves the room.",
};

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Behaviourplan");
  await setPlan(teacher, "pro", "comped");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const pages = (page: Page) => sheet(page).locator(".js-pages");

async function planRuns() {
  const { data } = await admin.from("tool_runs").select("id, output, title").eq("user_id", teacher.id).eq("tool_slug", "behaviour-support-plan").order("created_at", { ascending: false });
  return data ?? [];
}

async function fillForm(page: Page) {
  await page.goto(`/tools/behaviour-support-plan?prefill=${encodePrefill({ slug: "behaviour-support-plan", fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 7", studentClass: "7R", supportNeeds: "ADHD" } })}`);
  await expect(page.getByLabel("Name (first name only)")).toBeVisible(NAV);
  await page.getByLabel("Curriculum").selectOption("2014 National Curriculum");
  await page.getByLabel("Year group").selectOption("Year 7");
  await page.getByLabel("Name (first name only)").fill(NAME);
  await page.getByLabel("Pronouns").selectOption("he");
  await page.getByLabel(/Key staff working with/).fill(STAFF);
  await page.getByLabel("Challenging behaviour description").fill(`${NAME} leaves the room when ${NAME.toUpperCase()}'s work is hard`);
  await page.getByLabel("Behavioural triggers").fill(`Loud noise; being asked to read aloud. ${NAME} hates surprises.`);
}

test("a plan is written without the name reaching the model, drawn with it, and saved once", async ({ page }) => {
  await signIn(page, teacher);
  const before = (await planRuns()).length;
  const sent: string[] = [];
  await page.route("**/api/behaviour-support-plan", (route) => {
    sent.push(route.request().postData() ?? "");
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_PLAN) });
  });

  await fillForm(page);
  await expect(page.getByTestId("pupil-privacy-note")).toBeVisible();
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  // What went to the model: no name, no staff, no class; [PUPIL] in its place.
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toMatch(word(NAME));
  expect(sent[0]).not.toContain(STAFF);
  expect(sent[0]).not.toContain("7R");
  const body = JSON.parse(sent[0]);
  expect(body).toMatchObject({ pronouns: "he", yearGroup: "Year 7" });
  expect(body.behaviourDescription).toBe("[PUPIL] leaves the room when [PUPIL]'s work is hard");

  // The page: the name back, the details and staff from the form, the boxes.
  await expect(pages(page).locator(".js-title")).toHaveText(`Behaviour Support Plan: ${NAME}`);
  await expect(pages(page).locator(".js-section-title").first()).toHaveText("Pupil details");
  await expect(pages(page).locator(".js-table").first()).toContainText(STAFF);
  await expect(pages(page).locator(".js-twocol").first()).toContainText(`behaviours: ${NAME} point`);
  await expect(pages(page).locator(".js-section-title").filter({ hasText: "Log of incidents" })).toHaveCount(1);
  await expect(pages(page).getByText("[PUPIL]")).toHaveCount(0);

  // Saved once; the name is on the plan's pupil field only, never in its text.
  await expect.poll(async () => (await planRuns()).length, NAV).toBe(before + 1);
  const saved = JSON.parse((await planRuns())[0].output as string);
  expect(saved).toMatchObject({ kind: "jooma-sheet", tool: "behaviourPlan", pupil: { name: NAME, pronouns: "he" } });
  expect(JSON.stringify({ ...saved, pupil: null })).not.toMatch(word(NAME));

  await page.screenshot({ path: "test-results/behaviour-plan-sheet.png", fullPage: true });
});

test("Ask Jo edits the plan without the name or the staff reaching it, and voice is not offered", async ({ page }) => {
  await signIn(page, teacher);
  await page.route("**/api/behaviour-support-plan", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_PLAN) }),
  );
  const joBodies: string[] = [];
  await page.route("**/api/jo", (route) => {
    joBodies.push(route.request().postData() ?? "");
    const snap = JSON.parse(route.request().postData() ?? "{}").snapshot as { sections: { title: string; blocks: { id: string; type: string }[] }[] };
    const box = snap.sections.find((s) => s.title === "Behaviours and targets")!.blocks[0];
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({
        reply: "I'll make the targets measurable.",
        clarify: null,
        ops: [{ op: "replaceBlock", label: "Measurable targets", blockId: box.id, block: { type: "twocol", left: { title: "What does the behaviour look like?", items: ["[PUPIL] leaves the room"] }, right: { title: "What are we working towards?", items: ["[PUPIL] asks for a break card, 4 days out of 5"] } } }],
        summary: "The targets are measurable.",
      }),
    });
  });

  await fillForm(page);
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

  await page.getByTestId("jo-input").fill(`Make ${NAME}'s targets measurable`);
  await page.getByTestId("jo-send").click();
  await expect(pages(page).locator(".js-twocol").first()).toContainText(`${NAME} asks for a break card, 4 days out of 5`, NAV);

  expect(joBodies).toHaveLength(1);
  expect(joBodies[0]).not.toMatch(word(NAME));
  expect(joBodies[0]).not.toContain(STAFF);
  expect(joBodies[0]).not.toContain("Log of incidents");
  const jo = JSON.parse(joBodies[0]) as { messages: { content: string }[] };
  expect(jo.messages.at(-1)!.content).toBe("Make [PUPIL]'s targets measurable");
  // A spoken name would reach the speech model, so there is no voice here.
  await expect(page.getByRole("button", { name: /live|talk|voice|microphone/i })).toHaveCount(0);

  // The change is saved with the placeholder kept.
  await expect
    .poll(async () => {
      const saved = JSON.parse((await planRuns())[0].output as string);
      return JSON.stringify(saved.sections);
    }, NAV)
    .toContain("[PUPIL] asks for a break card");
});

test("a plan saved before the uplift still opens as the document it was, with pronouns from its gender", async ({ page }) => {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({
      user_id: teacher.id,
      tool_slug: "behaviour-support-plan",
      title: "Old plan",
      input: { curriculum: "2014 National Curriculum", yearGroup: "Year 7", studentName: "Old", studentGender: "Female", behaviourDescription: "x", behaviouralTriggers: "y" },
      output: "| Behaviour Support Plan | |\n|---|---|\n| **Pupil name:** Old | |",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/behaviour-support-plan?run=${data.id}`);
  await expect(page.getByText("Pupil name:").first()).toBeVisible(NAV);
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByLabel("Pronouns")).toHaveValue("she");
});

// ── The live run ────────────────────────────────────────────────────────────

test("LIVE: the real model writes a plan with [PUPIL], never a name, that fits the schema", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(420_000);
  await signIn(page, teacher);
  const before = (await planRuns()).length;
  await fillForm(page);
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", { timeout: 360_000 });

  await expect.poll(async () => (await planRuns()).length, { timeout: 60_000 }).toBe(before + 1);
  const saved = JSON.parse((await planRuns())[0].output as string);
  const text = JSON.stringify({ ...saved, pupil: null });
  expect(text).not.toMatch(word(NAME));
  expect(text).toContain("[PUPIL]");
  expect(text).not.toMatch(/[–—]/);
  const boxes = saved.sections.flatMap((s: { blocks: { type: string }[] }) => s.blocks).filter((b: { type: string }) => b.type === "twocol");
  expect(boxes.length).toBeGreaterThanOrEqual(10);
  await expect(pages(page).locator(".js-title")).toHaveText(`Behaviour Support Plan: ${NAME}`);
  await page.screenshot({ path: "test-results/behaviour-plan-live.png", fullPage: true });
});
