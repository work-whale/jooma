import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Ask Jo on a text tool's document (here the Lesson Planner, which shares the
 * result panel with the other text tools): Jo rings the section it changes,
 * types the new text in, saves the turn to the run, and undoes it in one click.
 *
 * The model is never called: /api/jo is answered by page.route. NOTHING IS
 * SPENT. The run is real, in staging, for a throwaway teacher.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const PLAN = `## Learning objective

Identify how animals are suited to where they live.

## Starter (10 minutes)

Show pictures of a desert, an ocean and a forest. Ask pupils to sort the animals.

## Plenary

Exit ticket: name one adaptation.`;

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Jotext");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

async function seedPlan(): Promise<string> {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "lesson-planner", title: "Habitats", input: {}, output: PLAN })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function stored(id: string): Promise<string> {
  const { data } = await admin.from("tool_runs").select("output").eq("id", id).single();
  return data!.output as string;
}

async function openPlan(page: Page, id: string) {
  await signIn(page, teacher);
  await page.goto(`/tools/lesson-planner?run=${id}`);
  await expect(page.locator(".ProseMirror")).toContainText("Exit ticket", NAV);
  await expect(page.getByTestId("jo-panel")).toBeVisible();
}

test("Jo rewrites a section and adds one, watched on the page, saved to the run, undone in one click", async ({ page }) => {
  const id = await seedPlan();
  let sent: { kind?: string; snapshot?: { toolName?: string; sections: { id: string; heading: string }[] } } | null = null;
  await page.route("**/api/jo", (route) => {
    sent = route.request().postDataJSON();
    const sections = (sent as unknown as { snapshot: { sections: { id: string; heading: string }[] } }).snapshot.sections;
    const starter = sections.find((s) => s.heading.startsWith("Starter"))!.id;
    const plenary = sections.find((s) => s.heading === "Plenary")!.id;
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({
        reply: "I'll shorten the starter and add differentiation.",
        clarify: null,
        ops: [
          { op: "replaceSection", label: "Shortening the starter", sectionId: starter, heading: "Starter (5 minutes)", markdown: "Show one picture of a desert. Ask: who could live here?" },
          { op: "insertSection", label: "Adding differentiation", afterSectionId: starter, level: 2, heading: "Differentiation", markdown: "- Word bank for lower ability\n- Extension: compare two habitats" },
          { op: "editText", label: "Changing the exit ticket", sectionId: plenary, find: "name one adaptation", replace: "draw one adaptation" },
        ],
        summary: "The starter is shorter, and there is a differentiation section.",
      }),
    });
  });

  await openPlan(page, id);
  await page.getByTestId("jo-input").fill("Shorten the starter and add differentiation");
  await page.getByTestId("jo-send").click();

  // Jo rings the section it is changing and says what it is doing.
  await expect(page.getByTestId("jo-section-focus")).toContainText("Shortening the starter", NAV);

  const doc = page.locator(".ProseMirror");
  await expect(doc).toContainText("Show one picture of a desert. Ask: who could live here?", NAV);
  await expect(doc).toContainText("Starter (5 minutes)");
  await expect(doc.locator("h2", { hasText: "Differentiation" })).toBeVisible();
  await expect(doc).toContainText("draw one adaptation");
  await expect(page.getByTestId("jo-changes")).toContainText("3 changes", NAV);

  expect(sent).toMatchObject({ kind: "markdown", snapshot: { toolName: expect.any(String) } });

  // Saved to the run, though the text tools do not autosave hand edits.
  await expect.poll(() => stored(id), NAV).toContain("## Differentiation");
  expect(await stored(id)).toContain("draw one adaptation");

  // Undo puts the document back, and that is saved too.
  await page.getByTestId("jo-undo").click();
  await expect(doc).toContainText("name one adaptation");
  await expect(doc.locator("h2", { hasText: "Differentiation" })).toHaveCount(0);
  await expect.poll(() => stored(id), NAV).not.toContain("Differentiation");
});
