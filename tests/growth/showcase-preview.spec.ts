import { test, expect } from "@playwright/test";
import { admin, createAdmin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * "Made with Jooma" cards for a Worksheet or Comprehension show the top of the
 * real first page, as Slides cards show their first slide. They used to show a
 * drawn placeholder of grey bars whatever the resource said.
 *
 * Needs 20261005000000_guest_trial_and_showcase.sql on the database these tests
 * hit; skipped until then.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const stamp = Date.now().toString(36);
const title = `Preview sheet ${stamp}`;
const objective = `I am learning to preview ${stamp}.`;

let migrated = false;
let teacher: TestTeacher;
let reviewer: TestTeacher;

test.beforeAll(async () => {
  const { error } = await admin.from("showcase_items").select("id").limit(1);
  migrated = !error;
  if (!migrated) return;

  teacher = await createTeacher("Previewer");
  reviewer = await createAdmin("PreviewReviewer");
  const doc = normalizeDraft(
    {
      title,
      objective,
      sections: [
        {
          title: "Warm up",
          emoji: "ðŸ”¥",
          instructions: "Circle the right answer.",
          blocks: [{ type: "mcq", prompt: "Which planet is closest to the Sun?", options: ["Mercury", "Venus"], answers: [0], marks: 1 }],
        },
      ],
    },
    sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths" }),
  );
  const { data: run, error: runErr } = await admin
    .from("tool_runs")
    .insert({ user_id: teacher.id, tool_slug: "worksheet-generator", title, input: {}, output: serializeSheet(doc) })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message);

  // Approved and first in the row, as an admin would leave it. Seeded straight
  // in: the review console is covered by showcase.spec.ts.
  const { error: itemErr } = await admin.from("showcase_items").insert({
    user_id: teacher.id,
    kind: "worksheet",
    tool_run_id: run.id,
    slug: `preview-sheet-${stamp}`,
    title,
    subject: "Maths",
    year_label: "Year 4",
    consent: true,
    status: "approved",
    position: -1000,
    reviewed_by: reviewer.id,
    reviewed_at: new Date().toISOString(),
  });
  if (itemErr) throw new Error(itemErr.message);
});

test.afterAll(async () => {
  if (!migrated) return;
  // Cascades to the run and the showcase row.
  await deleteTeacher(teacher);
  await deleteTeacher(reviewer);
});

test("a worksheet card shows its own first page, not a placeholder", async ({ page }) => {
  test.skip(!migrated, "showcase migration not pushed yet");

  // The row is cached; an admin's revalidate is what approving sends.
  await signIn(page, reviewer);
  const res = await page.request.post("/api/admin/showcase/revalidate");
  expect(res.ok()).toBe(true);
  await page.context().clearCookies();

  await page.goto("/");
  const card = page.getByRole("link", { name: new RegExp(title) });
  await expect(card).toBeVisible(NAV);

  const preview = card.getByTestId("made-preview");
  await expect(preview).toContainText(objective, NAV);
  await expect(preview).toContainText("Which planet is closest to the Sun?");
  // Only page one: the answers page never shows in the crop, so is not drawn.
  await expect(preview).not.toContainText("For the teacher");
  await expect(preview.locator('[data-testid="sheet-document"][data-ready="true"]')).toHaveCount(1, NAV);

  // Shown once it has fitted itself: faded in, and the A4 page zoomed down to
  // the card rather than spilling past it.
  await expect.poll(() => preview.evaluate((el) => getComputedStyle(el).opacity), NAV).toBe("1");
  const cardBox = (await card.boundingBox())!;
  const pageBox = (await preview.locator(".js-page").first().boundingBox())!;
  expect(pageBox.width).toBeGreaterThan(cardBox.width * 0.6);
  expect(pageBox.width).toBeLessThanOrEqual(cardBox.width);

  // Decorative: the link is still named by its heading, not the sheet's text.
  await expect(card).not.toHaveAccessibleName(new RegExp(objective.replace(/[.]/g, "\\.")));
});
