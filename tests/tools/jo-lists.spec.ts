import { test, expect, type Page, type Route } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Ask Jo on the list tools (Quiz here): Jo rings the card it
 * changes, the list updates, and the turn is saved as a new run (the way their
 * refine step always has). Undo puts the list back.
 *
 * The model is never called: /api/jo is answered by page.route. NOTHING IS
 * SPENT. The runs are real, in staging, for a throwaway teacher.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Jolists");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

async function seed(toolSlug: string, output: unknown): Promise<string> {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: toolSlug, title: "Seeded", input: { topic: "Seeded" }, output: JSON.stringify(output) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

function jo(body: Record<string, unknown>, seen: Record<string, unknown>[]) {
  return (route: Route) => {
    seen.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({ reply: "", clarify: null, ops: [], summary: "", ...body }),
    });
  };
}

async function ask(page: Page, text: string) {
  await page.getByTestId("jo-input").fill(text);
  await page.getByTestId("jo-send").click();
}

// The seeded quiz is in the shape saved before question types (a bare array),
// so this also checks that an old quiz opens, and is saved back into the SAME
// run in the new shape once it is changed.
test("Quiz: Jo rewrites a question and adds one, saved into the same run, undone in one click", async ({ page }) => {
  const id = await seed("quiz-generator", [
    { question: "What is 2 + 2?", options: ["3", "4", "5", "6"], correctIndex: 1 },
    { question: "What is 3 x 3?", options: ["6", "8", "9", "12"], correctIndex: 2 },
  ]);
  const seen: Record<string, unknown>[] = [];
  await page.route(
    "**/api/jo",
    jo(
      {
        reply: "I'll make question 2 easier and add one.",
        ops: [
          { op: "replaceItem", label: "Simplifying question 2", itemId: "q2", item: { type: "single", question: "What is 3 + 3?", options: ["5", "6", "7", "8"], answers: [1], explanation: "" } },
          { op: "insertItem", label: "Adding question 3", afterItemId: "q2", item: { type: "single", question: "What is 10 - 4?", options: ["4", "5", "6", "7"], answers: [2], explanation: "" } },
        ],
        summary: "Question 2 is easier and there is a third question.",
      },
      seen,
    ),
  );

  await signIn(page, teacher);
  await page.goto(`/tools/quiz-generator?run=${id}`);
  const cards = page.locator("[data-jo-item]");
  await expect(cards).toHaveCount(2, NAV);
  await ask(page, "Make question 2 easier and add another");

  await expect(page.getByTestId("jo-item-focus")).toContainText("Simplifying question 2", NAV);
  await expect(cards).toHaveCount(3, NAV);
  await expect(cards.nth(1).locator("input").first()).toHaveValue("What is 3 + 3?");
  await expect(cards.nth(2).locator("input").first()).toHaveValue("What is 10 - 4?");
  await expect(page.getByTestId("jo-changes")).toContainText("2 changes");
  expect(seen[0]).toMatchObject({ kind: "quiz", snapshot: { tool: "quiz", items: [{ id: "q1", number: 1 }, { id: "q2", number: 2 }] } });

  await expect
    .poll(async () => {
      const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "quiz-generator");
      const row = data?.find((r) => r.id === id);
      const out = row ? JSON.parse(row.output as string) : null;
      return { runs: data?.length, kind: out?.kind, questions: out?.questions?.length };
    }, NAV)
    .toEqual({ runs: 1, kind: "jooma-quiz", questions: 3 });

  await page.getByTestId("jo-undo").click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator("input").first()).toHaveValue("What is 3 x 3?");
});

// Staff Slides left this list engine in batch 6: new decks are made and
// edited with Jo in the slide editor, and old runs open read-only
// (tests/tools/tool-uplift-batch6.spec.ts).
