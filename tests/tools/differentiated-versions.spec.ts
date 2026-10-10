import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Differentiated versions: picking WBS, WTS, EXS or GDS makes one whole
 * resource per band, each in its own tab above the result, instead of one
 * resource with a blended "Differentiation" note.
 *
 * One press of Generate sends one request per band, side by side. The model
 * is never called: each route is answered by page.route, with a different
 * resource per band. NOTHING IS SPENT. The saved runs are real, in staging,
 * for a throwaway teacher.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TITLES: Record<string, string> = {
  WBS: "Fractions step by step",
  WTS: "Fractions with a helping hand",
  EXS: "Adding fractions",
  GDS: "Fractions in depth",
};

/** A sheet the model might stream for one band. */
function modelSheet(band: string) {
  return {
    title: TITLES[band],
    objective: "I am learning to add fractions with the same denominator.",
    intro: { variant: "fact", label: "Did you know?", text: "A pizza cut into 8 slices shows eighths.", emoji: "🍕" },
    sections: [
      {
        title: "Warm up",
        emoji: "🔥",
        instructions: "Circle the right answer.",
        blocks: [{ type: "mcq", prompt: "What is 1/4 + 2/4?", options: ["3/4", "3/8", "1/2"], answers: [0], marks: 1 }],
      },
    ],
    teacherNotes: [{ title: `How this version is pitched: ${band}`, points: ["Adapted for these pupils."] }],
  };
}

const WORKSHEET_FIELDS = {
  curriculum: "2014 National Curriculum",
  yearGroup: "Year 4",
  subject: "Maths",
  learningObjective: "Add fractions with the same denominator",
};

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Bands");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

const sheet = (page: Page) => page.getByTestId("sheet-document");
const tabs = (page: Page) => page.getByRole("tablist", { name: "Differentiated versions" });
const tab = (page: Page, band: string) => tabs(page).getByRole("tab", { name: new RegExp(`^${band}`) });
const generate = (page: Page) => page.locator("button[data-jo-generate]");

async function latestRun(slug: string): Promise<{ id: string; output: string } | null> {
  const { data } = await admin
    .from("tool_runs")
    .select("id, output")
    .eq("user_id", teacher.id)
    .eq("tool_slug", slug)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { id: string; output: string } | undefined) ?? null;
}

/** The stored set's bands, each with its output parsed when it is a sheet. */
async function storedBands(runId: string): Promise<{ band: string; title?: string; output: string }[]> {
  const { data } = await admin.from("tool_runs").select("output").eq("id", runId).single();
  const set = JSON.parse(data!.output as string) as { bands: { band: string; output: string }[] };
  return set.bands.map((b) => ({
    band: b.band,
    output: b.output,
    title: b.output.startsWith("{") ? (JSON.parse(b.output) as { title: string }).title : undefined,
  }));
}

test("switching differentiation on starts with EXS, the standard version, ticked", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/tools/worksheet-generator");

  const exs = page.getByRole("button", { name: /^EXS/ });
  await page.getByRole("radio", { name: "Yes", exact: true }).check(NAV);
  await expect(exs).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("EXS is the standard version.")).toBeVisible();

  // The teacher can still untick it.
  await exs.click();
  await expect(exs).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Select at least one band.")).toBeVisible();
});

test("a worksheet for WBS and GDS makes two sheets in two tabs, saved as one run", async ({ page }) => {
  await signIn(page, teacher);

  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/worksheet-generator", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify(modelSheet(body.band as string)),
    });
  });

  const fields = { ...WORKSHEET_FIELDS, differentiate: "yes", differentiationLevels: ["GDS", "WBS"] };
  await page.goto(`/tools/worksheet-generator?prefill=${encodePrefill({ slug: "worksheet-generator", fields })}`);
  await generate(page).click(NAV);

  // One request per band, in band order, the first counting as the generation.
  await expect(tabs(page)).toBeVisible(NAV);
  await expect(tabs(page).getByRole("tab")).toHaveCount(2);
  expect(sent.map((b) => [b.band, b.bandIndex]).sort()).toEqual([["GDS", 1], ["WBS", 0]]);

  // The first tab is open, and each tab is its own sheet.
  await expect(tab(page, "WBS")).toHaveAttribute("aria-selected", "true");
  await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveText(TITLES.WBS);
  await tab(page, "GDS").click();
  await expect(tab(page, "GDS")).toHaveAttribute("aria-selected", "true");
  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveText(TITLES.GDS);

  // Saved once, as both versions together.
  await expect.poll(async () => (await latestRun("worksheet-generator"))?.output.slice(0, 21), NAV).toBe('{"kind":"jooma-bands"');
  const run = (await latestRun("worksheet-generator"))!;
  expect((await storedBands(run.id)).map((b) => [b.band, b.title])).toEqual([
    ["WBS", TITLES.WBS],
    ["GDS", TITLES.GDS],
  ]);

  // An edit to the GDS sheet autosaves into the GDS version only.
  const title = sheet(page).locator(".js-pages h1.js-title");
  await title.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Fractions, deeper still");
  await page.keyboard.press("Enter");
  await expect(title).toHaveText("Fractions, deeper still");
  await expect
    .poll(async () => (await storedBands(run.id)).map((b) => b.title), NAV)
    .toEqual([TITLES.WBS, "Fractions, deeper still"]);

  // Reopened from the library: both tabs come back.
  await page.goto(`/tools/worksheet-generator?run=${run.id}`);
  await expect(tabs(page).getByRole("tab")).toHaveCount(2, NAV);
  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveText(TITLES.WBS, NAV);
  await tab(page, "GDS").click();
  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveText("Fractions, deeper still");

  await page.screenshot({ path: "test-results/differentiated-worksheet.png", fullPage: true });
});

test("a band that fails is marked in its tab, and the others are still saved", async ({ page }) => {
  await signIn(page, teacher);

  await page.route("**/api/worksheet-generator", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.band === "GDS") {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The model is busy." }) });
    }
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(modelSheet(body.band as string)) });
  });

  const fields = { ...WORKSHEET_FIELDS, learningObjective: "Add fractions, with one band failing", differentiate: "yes", differentiationLevels: ["WTS", "GDS"] };
  await page.goto(`/tools/worksheet-generator?prefill=${encodePrefill({ slug: "worksheet-generator", fields })}`);
  await generate(page).click(NAV);

  await expect(sheet(page).locator(".js-pages h1.js-title")).toHaveText(TITLES.WTS, NAV);
  await tab(page, "GDS").click();
  await expect(page.getByText("The GDS version could not be made.")).toBeVisible();
  await expect(page.getByText("The model is busy.")).toBeVisible();

  await expect
    .poll(async () => {
      const run = await latestRun("worksheet-generator");
      return run?.output.startsWith('{"kind":"jooma-bands"') ? (await storedBands(run.id)).map((b) => b.band) : null;
    }, NAV)
    .toEqual(["WTS"]);
});

test("every band failing shows the error, as a single failed generation does", async ({ page }) => {
  await signIn(page, teacher);
  await page.route("**/api/worksheet-generator", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Nothing came back." }) }),
  );

  const fields = { ...WORKSHEET_FIELDS, learningObjective: "Every band fails", differentiate: "yes", differentiationLevels: ["WBS", "EXS"] };
  await page.goto(`/tools/worksheet-generator?prefill=${encodePrefill({ slug: "worksheet-generator", fields })}`);
  await generate(page).click(NAV);

  await expect(page.getByText("Nothing came back.")).toBeVisible(NAV);
  await expect(tabs(page)).toHaveCount(0);
});

test("homework for WTS and EXS: two documents in tabs, and Refine changes only the one on screen", async ({ page }) => {
  await signIn(page, teacher);

  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/homework-generator", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: `# ${TITLES[body.band as string]}\n\n## Task\n\nAnswer the questions.`,
    });
  });
  let refinedFrom: string | null = null;
  await page.route("**/api/modify", (route) => {
    refinedFrom = (route.request().postDataJSON() as { currentContent: string }).currentContent;
    return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: "# Shorter homework\n\n## Task\n\nOne question." });
  });

  const fields = { ...WORKSHEET_FIELDS, differentiate: "yes", differentiationLevels: ["WTS", "EXS"] };
  await page.goto(`/tools/homework-generator?prefill=${encodePrefill({ slug: "homework-generator", fields })}`);
  // The two choices Jo leaves to the teacher.
  await page.locator("select").filter({ has: page.locator('option[value="Short written task"]') }).selectOption("Short written task", NAV);
  await page.locator("select").filter({ has: page.locator('option[value="Quick task (10 minutes)"]') }).selectOption("Quick task (10 minutes)");
  await generate(page).click();

  await expect(tabs(page).getByRole("tab")).toHaveCount(2, NAV);
  expect(sent.map((b) => b.band).sort()).toEqual(["EXS", "WTS"]);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toContainText(TITLES.WTS, NAV);
  await tab(page, "EXS").click();
  await expect(editor).toContainText(TITLES.EXS);
  await expect(editor).not.toContainText(TITLES.WTS);

  // Refine the EXS version: only its text is sent, and only it changes.
  await page.getByRole("button", { name: "Make more concise" }).click();
  await page.getByRole("button", { name: "Refine", exact: true }).click();
  await expect(editor).toContainText("Shorter homework", NAV);
  expect(refinedFrom).toContain(TITLES.EXS);
  expect(refinedFrom).not.toContain(TITLES.WTS);
  await tab(page, "WTS").click();
  await expect(editor).toContainText(TITLES.WTS);

  // Saved with both versions; the refine is saved too.
  await expect
    .poll(async () => {
      const run = await latestRun("homework-generator");
      if (!run?.output.startsWith('{"kind":"jooma-bands"')) return null;
      return (await storedBands(run.id)).map((b) => [b.band, b.output.split("\n")[0]]);
    }, NAV)
    .toEqual([
      ["WTS", `# ${TITLES.WTS}`],
      ["EXS", "# Shorter homework"],
    ]);
});
