import { test, expect, type Page, type Route } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Ask Jo beside a generated worksheet: the teacher asks for a change and
 * watches Jo make it on the page, then gets a summary and a one click undo.
 *
 * The model is never called: /api/jo and /api/jo/speak are answered by
 * page.route. NOTHING IS SPENT. The run is real, in staging, for a throwaway
 * teacher, so Jo's edit is checked all the way to the autosaved row.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const MODEL_SHEET = {
  title: "Adding fractions",
  objective: "I am learning to add fractions with the same denominator.",
  intro: { variant: "fact", label: "Did you know?", text: "A pizza cut into 8 slices shows eighths.", emoji: "🍕" },
  sections: [
    {
      title: "Warm up",
      emoji: "🔥",
      instructions: "Circle the right answer.",
      blocks: [
        { type: "mcq", prompt: "What is 1/4 + 2/4?", options: ["3/4", "3/8", "1/2"], answers: [0], marks: 1 },
        { type: "short", prompt: "Explain how you added them.", lines: 2, answer: "Add the numerators.", marks: 1 },
      ],
    },
  ],
  teacherNotes: [],
};

const NEW_PROMPT = "What do you get when you add one quarter and two quarters?";

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Joedit");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

async function seedSheetRun(): Promise<string> {
  const doc = normalizeDraft(MODEL_SHEET, sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths" }));
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "worksheet-generator", title: "Adding fractions", input: {}, output: serializeSheet(doc) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function storedSheet(runId: string) {
  const { data } = await admin.from("tool_runs").select("output").eq("id", runId).single();
  return JSON.parse(data!.output as string);
}

/** Jo's answer, as the route streams it: reply, question, edits, summary. */
function answer(body: Record<string, unknown>) {
  return (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({ reply: "", clarify: null, ops: [], summary: "", ...body }),
    });
}

async function openRun(page: Page, runId: string) {
  await signIn(page, teacher);
  await page.goto(`/tools/worksheet-generator?run=${runId}`);
  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", NAV);
}

test("Jo sits beside the sheet, folds to a strip and comes back", async ({ page }) => {
  const runId = await seedSheetRun();
  await openRun(page, runId);

  const panel = page.getByTestId("jo-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Hi, I'm Jo.");
  await expect(panel.getByRole("button", { name: "Add a challenge question at the end" })).toBeVisible();

  await page.getByTestId("jo-minimise").click();
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(page.getByTestId("jo-input")).toBeHidden();
  await page.getByTestId("jo-rail").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(page.getByTestId("jo-input")).toBeVisible();
});

test("a request is played onto the page, summarised, saved, and undone in one click", async ({ page }) => {
  const runId = await seedSheetRun();

  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/jo", (route) => {
    sent = route.request().postDataJSON();
    return answer({
      reply: "I'll make question 1 easier to read and add a tip.",
      ops: [
        { op: "setText", label: "Rewording question 1", target: "s0b0.prompt", text: NEW_PROMPT },
        { op: "insertBlock", label: "Adding a tip", sectionId: "s0", afterBlockId: "", block: { type: "callout", variant: "tip", label: "Top tip", text: "Only add the top numbers.", emoji: "💡" } },
        { op: "replaceBlock", label: "Fixing a block that is gone", blockId: "s9b9", block: { type: "text", text: "x" } },
      ],
      summary: "Question 1 is in words now, and there is a tip at the top.",
    })(route);
  });

  await openRun(page, runId);
  await page.getByTestId("jo-input").fill("Make question 1 easier to read and add a tip");
  await page.getByTestId("jo-send").click();

  // Jo points at the question it is changing, with what it is doing.
  const label = page.getByTestId("sheet-document").locator(".js-jo-label");
  await expect(label).toContainText("Rewording question 1");
  await expect(page.getByTestId("sheet-document").locator("[data-jo-active]")).toHaveCount(1);

  // Then the page holds the edit, and the panel says what changed.
  const pages = page.getByTestId("sheet-document").locator(".js-pages");
  await expect(pages).toContainText(NEW_PROMPT, NAV);
  await expect(pages).toContainText("Only add the top numbers.");
  const changes = page.getByTestId("jo-changes");
  await expect(changes).toContainText("2 changes", NAV);
  await expect(changes).toContainText("Rewording question 1");
  await expect(changes).toContainText("Adding a tip");
  await expect(page.getByTestId("jo-reply")).toContainText("Question 1 is in words now");
  await expect(page.getByTestId("sheet-document").locator("[data-jo-active]")).toHaveCount(0);

  // What Jo was sent: the sheet by id, and the teacher's words.
  expect(sent).toMatchObject({ kind: "sheet", askCount: 0, messages: [{ role: "user", content: "Make question 1 easier to read and add a tip" }] });
  expect(JSON.stringify((sent as unknown as { snapshot: unknown }).snapshot)).toContain('"id":"s0b0"');

  // One autosave of the whole turn.
  await expect.poll(async () => (await storedSheet(runId)).sections[0].blocks.map((b: { type: string }) => b.type), NAV).toEqual(["callout", "mcq", "short"]);

  // "Show me" brings the change back into view and points at it.
  await changes.getByRole("button", { name: /Rewording question 1/ }).click();
  await expect(page.getByTestId("sheet-document").locator("[data-jo-active]")).toHaveCount(1);

  // Undo puts the sheet back as it was before the turn, and that saves too.
  await page.getByTestId("jo-undo").click();
  await expect(pages).not.toContainText(NEW_PROMPT);
  await expect(pages).not.toContainText("Only add the top numbers.");
  // The fraction is drawn stacked, so its text reads "14 + 24".
  await expect(pages.locator('.js-q[data-type="mcq"]')).toContainText("What is");
  await expect(changes).toContainText("Undone");
  await expect.poll(async () => (await storedSheet(runId)).sections[0].blocks.map((b: { type: string }) => b.type), NAV).toEqual(["mcq", "short"]);
});

test("a vague request gets a follow up question, and the answer goes back as the next message", async ({ page }) => {
  const runId = await seedSheetRun();

  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/jo", (route) => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? answer({ reply: "Happy to help with that.", clarify: { question: "What would you like me to improve?", options: ["Easier wording", "More questions", "Clearer layout"], multi: true } })(route)
      : answer({ reply: "Done.", ops: [{ op: "setText", label: "Adding a sentence", target: "s0.instructions", text: "Circle the right answer, then check it." }], summary: "Simpler wording." })(route);
  });

  await openRun(page, runId);
  await page.getByTestId("jo-input").fill("make it better");
  await page.getByTestId("jo-send").click();

  const question = page.getByTestId("jo-question");
  await expect(question).toContainText("What would you like me to improve?", NAV);
  await question.getByRole("button", { name: "Easier wording" }).click();
  await question.getByRole("button", { name: "Clearer layout" }).click();
  await question.getByRole("button", { name: "Send" }).click();

  await expect(page.getByTestId("jo-changes")).toContainText("1 change", NAV);
  expect(bodies[1]).toMatchObject({ askCount: 1 });
  const messages = (bodies[1] as { messages: { role: string; content: string }[] }).messages;
  expect(messages.at(-1)).toEqual({ role: "user", content: "Easier wording, Clearer layout" });
  expect(messages[1].content).toContain("What would you like me to improve?");
});

test("a reply can be read aloud", async ({ page }) => {
  const runId = await seedSheetRun();
  await page.route("**/api/jo", answer({ reply: "Here is what I changed.", summary: "Nothing else needed." }));
  let spoken: string | null = null;
  await page.route("**/api/jo/speak", (route) => {
    spoken = (route.request().postDataJSON() as { text: string }).text;
    return route.fulfill({ status: 200, headers: { "content-type": "audio/mpeg" }, body: Buffer.alloc(0) });
  });

  await openRun(page, runId);
  await page.getByTestId("jo-input").fill("Is the sheet ready?");
  await page.getByTestId("jo-send").click();
  await page.getByTestId("jo-speak").click();
  await expect.poll(() => spoken, NAV).toBe("Here is what I changed. Nothing else needed.");
});

test("the conversation is kept with the worksheet and comes back on reload", async ({ page }) => {
  const runId = await seedSheetRun();
  await page.route("**/api/jo", answer({
    reply: "I'll reword question 1.",
    ops: [{ op: "setText", label: "Rewording question 1", target: "s0b0.prompt", text: NEW_PROMPT }],
    summary: "Question 1 is in words now.",
  }));

  await openRun(page, runId);
  await page.getByTestId("jo-input").fill("Put question 1 in words");
  await page.getByTestId("jo-send").click();
  await expect(page.getByTestId("jo-changes")).toContainText("1 change", NAV);

  // Saved against this run, in the teacher's own thread.
  await expect
    .poll(async () => {
      const { data } = await admin.from("jo_threads").select("id, jo_messages(role, content, summary)").eq("doc_id", runId).maybeSingle();
      return ((data?.jo_messages as { role: string }[] | undefined) ?? []).map((m) => m.role).sort();
    }, NAV)
    .toEqual(["assistant", "user"]);

  await page.reload();
  await expect(page.getByTestId("sheet-document")).toHaveAttribute("data-ready", "true", NAV);
  await expect(page.getByTestId("jo-user-message")).toHaveText("Put question 1 in words", NAV);
  await expect(page.getByTestId("jo-reply")).toContainText("Question 1 is in words now.");
  await expect(page.getByTestId("jo-changes")).toContainText("Rewording question 1");
  // Undo belongs to the visit that made the change.
  await expect(page.getByTestId("jo-undo")).toHaveCount(0);
});
