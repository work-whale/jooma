import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Reports: a class grid in, one report and next step per pupil out, written
 * five pupils a request, saved into ONE run. The one thing that must never
 * happen: a pupil's name in a request body.
 *
 * The screen tests answer /api/report-writer with page.route: NOTHING IS
 * SPENT. The last test is the live run, skipped unless LIVE_MODEL=1.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const CLASS = ["Amira", "Ben", "Chloe", "Daniyal", "Eve", "Freya"];

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("Reports");
  await setPlan(teacher, "pro", "comped");
});
test.afterAll(async () => deleteTeacher(teacher));

async function reportRuns() {
  const { data } = await admin.from("tool_runs").select("id, output").eq("user_id", teacher.id).eq("tool_slug", "report-writer").order("created_at", { ascending: false });
  return data ?? [];
}

/** Answers every request with one report per pupil reference it was sent. */
async function mockReports(page: Page, raw: string[]) {
  await page.route("**/api/report-writer", (route) => {
    const text = route.request().postData() ?? "";
    raw.push(text);
    const body = JSON.parse(text) as { pupils: { ref: string; pronouns: string }[]; redo?: boolean };
    const reports = body.pupils.map((p, i) => ({
      ref: p.ref,
      comment: `${body.redo ? "Rewritten: " : ""}[PUPIL] has worked hard this term and [PUPIL]'s number work is secure (${i}).`,
      nextStep: "[PUPIL] should practise times tables daily.",
    }));
    return route.fulfill({ contentType: "text/plain; charset=utf-8", body: JSON.stringify({ reports }) });
  });
}

async function fillClass(page: Page) {
  await page.goto("/tools/report-writer");
  await page.getByLabel("Year group").selectOption("Year 4", NAV);
  // Maths only: English and Science start ticked for a primary class.
  const subjects = page.getByRole("group", { name: "Subjects to report on" });
  await subjects.getByText("English", { exact: true }).click();
  await subjects.getByText("Science", { exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "English" })).toHaveCount(0);
  await page.getByRole("button", { name: "Paste names" }).click();
  await page.getByLabel(/One first name a line/).fill(CLASS.join("\n"));
  await page.getByRole("button", { name: "Add these pupils" }).click();
  await expect(page.getByLabel(/Pupil \d+ first name/)).toHaveCount(CLASS.length);
  // Notes that name the pupil and a classmate: both must be gone before sending.
  await page.getByLabel("Pupil 1 note").fill("Amira helped Ben with fractions. AMIRA's reading is strong.");
  await page.getByLabel("Pupil 1 Maths").selectOption("Greater depth");
  await page.getByLabel("Pupil 2 note").fill("Ben's times tables improved after working with Chloe.");
}

test("a class is written in batches, never sends a name, and is saved once then updated in place", async ({ page }) => {
  const raw: string[] = [];
  await mockReports(page, raw);
  await signIn(page, teacher);
  const before = (await reportRuns()).length;
  await fillClass(page);

  await page.getByRole("button", { name: /generate/i }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(CLASS.length, NAV);
  await expect(page.getByTestId("report-card").filter({ hasText: "Rewritten" })).toHaveCount(0);

  // Six pupils: one request of five and one of one, only the first counted.
  expect(raw).toHaveLength(2);
  const bodies = raw.map((r) => JSON.parse(r) as { pupils: { ref: string; note: string }[]; chunkIndex: number });
  expect(bodies.map((b) => b.pupils.length).sort()).toEqual([1, 5]);
  expect(bodies.map((b) => b.chunkIndex).sort()).toEqual([0, 1]);
  for (const r of raw) for (const name of CLASS) expect(r.toLowerCase(), `${name} was sent`).not.toContain(name.toLowerCase());
  const first = bodies.find((b) => b.chunkIndex === 0)!;
  expect(first.pupils[0].note).toBe("[PUPIL] helped a classmate with fractions. [PUPIL]'s reading is strong.");

  // The names are back on screen.
  const amira = page.getByTestId("report-card").filter({ has: page.getByRole("heading", { name: "Amira" }) });
  await expect(amira.getByLabel("Report for Amira")).toHaveValue(/^Amira has worked hard this term and Amira's number work/);

  // Saved once, with the placeholder rather than the name in what was written.
  await expect.poll(async () => (await reportRuns()).length, NAV).toBe(before + 1);
  const runId = (await reportRuns())[0].id;
  const saved = JSON.parse((await reportRuns())[0].output as string);
  expect(saved.kind).toBe("jooma-reports");
  expect(saved.pupils[0].comment).toContain("[PUPIL]");

  // An edit by hand goes into the same run.
  await amira.getByLabel("Report for Amira").fill("Amira is a joy to teach.");
  await expect(page.getByTestId("report-save-state")).toHaveText(/Saved/, NAV);
  await expect.poll(async () => JSON.parse((await reportRuns())[0].output as string).pupils[0].comment, NAV).toBe("[PUPIL] is a joy to teach.");

  // Rewriting one sends that pupil alone, as a redo, still with no name.
  await amira.getByRole("button", { name: "Rewrite this one" }).click();
  await expect(amira.getByLabel("Report for Amira")).toHaveValue(/^Rewritten: Amira/, NAV);
  expect(raw).toHaveLength(3);
  const redo = JSON.parse(raw[2]) as { pupils: unknown[]; redo: boolean };
  expect(redo.redo).toBe(true);
  expect(redo.pupils).toHaveLength(1);
  for (const name of CLASS) expect(raw[2].toLowerCase()).not.toContain(name.toLowerCase());

  await expect.poll(async () => JSON.parse((await reportRuns())[0].output as string).pupils[0].comment, NAV).toMatch(/^Rewritten/);
  const runs = await reportRuns();
  expect(runs).toHaveLength(before + 1);
  expect(runs[0].id).toBe(runId);
});

test("a report saved before the class grid still opens as it was", async ({ page }) => {
  const { data, error } = await admin
    .from("tool_runs")
    .insert({
      user_id: teacher.id,
      tool_slug: "report-writer",
      title: "Sam",
      input: { name: "Sam", gender: "Male", wordCount: "150", includeTargets: true, tone: "formal", subjects: [{ subject: "Maths", strengths: "Quick with mental maths", areasForDevelopment: "", targets: "" }] },
      output: "# Report for Sam\n\nSam has made excellent progress in mathematics this year.",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await signIn(page, teacher);
  await page.goto(`/tools/report-writer?run=${data.id}`);
  await expect(page.getByText("Sam has made excellent progress in mathematics this year.")).toBeVisible(NAV);
  await expect(page.getByTestId("report-cards")).toHaveCount(0);
  // The grid is seeded with that pupil once a year group is chosen.
  await page.getByLabel("Year group").selectOption("Year 8");
  await expect(page.getByLabel("Pupil 1 first name")).toHaveValue("Sam");
  await expect(page.getByLabel("Pupil 1 pronouns")).toHaveValue("he");
  await expect(page.getByLabel("Pupil 1 note")).toHaveValue("Maths: Quick with mental maths");
});

// ── The live run ────────────────────────────────────────────────────────────

test("LIVE: the real model writes a report for every pupil, with no names and nothing invented", async ({ page }) => {
  test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
  test.setTimeout(300_000);
  await signIn(page, teacher);
  const before = (await reportRuns()).length;
  await fillClass(page);
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(CLASS.length, { timeout: 240_000 });
  await expect(page.getByTestId("report-card").and(page.locator('[data-status="writing"]'))).toHaveCount(0, { timeout: 240_000 });

  await expect.poll(async () => (await reportRuns()).length, { timeout: 60_000 }).toBe(before + 1);
  const saved = JSON.parse((await reportRuns())[0].output as string) as { pupils: { name: string; comment: string; target: string; status: string }[] };
  for (const p of saved.pupils) {
    expect(p.status, p.name).toBe("done");
    expect(p.comment.split(/\s+/).length, p.name).toBeGreaterThan(40);
    expect(p.comment).toContain("[PUPIL]");
    expect(p.target.trim().length, p.name).toBeGreaterThan(0);
    for (const name of CLASS) expect(p.comment, `${name} in ${p.name}'s report`).not.toContain(name);
    expect(p.comment).not.toMatch(/[–—]/);
  }
  // Only Amira was given a judgement; nobody else may be called greater depth.
  for (const p of saved.pupils.slice(1)) expect(p.comment.toLowerCase()).not.toContain("greater depth");
});
