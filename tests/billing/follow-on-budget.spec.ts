import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { FOLLOW_ON_KINDS } from "@/app/lib/follow-on";

/*
 * The server, not the browser, decides which follow-up requests are let off
 * the generation count (app/lib/follow-on.ts). These go straight at the real
 * routes with hand-made bodies, the way someone dodging the hourly limit
 * would, and read back the token_usage rows the server wrote.
 *
 * LIVE: every request really calls the model, so the whole file is skipped
 * unless LIVE_MODEL=1 (a few pence on staging). The rule itself is covered for
 * free by tests/unit/follow-on.spec.ts; this proves the routes use it.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.skip(process.env.LIVE_MODEL !== "1", "Live model run: set LIVE_MODEL=1 (costs a few pence on staging).");
test.setTimeout(300_000);

let teacher: TestTeacher;
test.beforeAll(async () => {
  teacher = await createTeacher("FollowOn");
  await setPlan(teacher, "pro", "comped");
});
test.afterAll(async () => {
  await admin.from("token_usage").delete().eq("user_id", teacher.id);
  await deleteTeacher(teacher);
});

async function stepsFor(tool: string): Promise<(string | null)[]> {
  const { data } = await admin
    .from("token_usage")
    .select("step")
    .eq("user_id", teacher.id)
    .eq("tool_slug", tool)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => r.step as string | null);
}

const count = (steps: (string | null)[], step: string | null) => steps.filter((s) => s === step).length;

/** One pupil, no name: the smallest request the route accepts. */
function reportBody(chunkIndex: number) {
  return {
    yearGroup: "Year 4",
    subjects: ["Maths"],
    scale: "working",
    length: "short",
    tone: "concise",
    nextSteps: false,
    pupils: [{ ref: "p1", pronouns: "they", attainment: { Maths: "Expected" }, effort: "Good", note: "Steady in number work.", nextStep: "" }],
    chunkIndex,
  };
}

test("forged report chunks with no class behind them are let off one class's worth, then count", async ({ page }) => {
  await signIn(page, teacher);
  const budget = FOLLOW_ON_KINDS.reportBatch.cap;

  // One after another, so each row is on record before the next request.
  for (let i = 0; i <= budget; i++) {
    const res = await page.request.post("/api/report-writer", { data: reportBody(1) });
    expect(res.ok(), await res.text()).toBe(true);
  }

  await expect.poll(async () => (await stepsFor("report-writer")).length, { timeout: 30_000 }).toBe(budget + 1);
  const steps = await stepsFor("report-writer");
  expect(count(steps, "Report batch")).toBe(budget);
  expect(count(steps, null)).toBe(1);
});

test("four bands sent at once count as one generation", async ({ page }) => {
  await signIn(page, teacher);
  const bands = ["WBS", "WTS", "EXS", "GDS"];
  const base = {
    curriculum: "England",
    yearGroup: "Year 5",
    subject: "Maths",
    learningObjective: "Add fractions with the same denominator",
    questionCount: 3,
    outputDetail: "brief",
    differentiate: "yes",
    differentiationLevels: bands,
  };

  const results = await Promise.all(
    bands.map((band, bandIndex) => page.request.post("/api/worksheet-generator", { data: { ...base, band, bandIndex } })),
  );
  for (const res of results) expect(res.ok(), await res.text()).toBe(true);

  await expect.poll(async () => (await stepsFor("worksheet-generator")).length, { timeout: 30_000 }).toBe(4);
  const steps = await stepsFor("worksheet-generator");
  expect(count(steps, null)).toBe(1);
  expect(count(steps, "Band version")).toBe(3);
});
