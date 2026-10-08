import { test, expect, type Page } from "@playwright/test";
import primary from "@/app/lib/national-curriculum/data/primary.json";

/*
 * "Align to curriculum" on the slides wizard, as a guest on /create.
 *
 * The old card offered GCSE strands for every year and no statements. This
 * one lists the National Curriculum's own statements for the chosen year,
 * pre-ticks the best matches for the topic, and sends the ticked statements to
 * the deck prompt word for word.
 *
 * Every /api call is stubbed, and the deck request is refused by the stub
 * once its body has been read: NOTHING REACHES A MODEL AND NOTHING IS SPENT.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const FRACTIONS = "Number: fractions (including decimals)";
const PICKS = ["y4-maths-number-fractions-01", "y4-maths-number-fractions-04", "y4-maths-number-fractions-06"];
const textOf = (id: string) => (primary as { statements: { id: string; text: string }[] }).statements.find((s) => s.id === id)!.text;

async function stub(page: Page, year: string) {
  const calls = { suggest: [] as Record<string, unknown>[], deck: [] as Record<string, unknown>[] };
  await page.route("**/api/try/prefill", (route) =>
    route.fulfill({ json: { prefill: encodePrefill({ slug: "slideshow", fields: { topic: "Fractions", year } }) } }),
  );
  await page.route("**/api/suggest-subject", (route) => {
    calls.suggest.push(route.request().postDataJSON());
    return route.fulfill({ json: { subject: "Maths", strand: FRACTIONS, statementIds: PICKS } });
  });
  await page.route("**/api/try/slideshow", (route) => {
    calls.deck.push(route.request().postDataJSON());
    return route.fulfill({ status: 429, json: { error: "You have used today's three free tries.", reason: "used" } });
  });
  return calls;
}

async function openStepTwo(page: Page, year: string) {
  await page.goto(`/create?tool=slides&topic=${encodeURIComponent(`Fractions, ${year}`)}`);
  await expect(page.locator('input[name="lesson-topic"]')).toHaveValue("Fractions", NAV);
  await page.getByRole("button", { name: /^Continue/ }).click();
  const card = page.getByTestId("curriculum-alignment");
  await card.getByRole("button", { name: /Align to curriculum/ }).click();
  return card;
}

test("Year 4 fractions: the year's statements, the best matches ticked, and the ticks sent word for word", async ({ page }) => {
  const calls = await stub(page, "Year 4");
  const card = await openStepTwo(page, "Year 4");

  // The year from step one, under its stage.
  const year = card.getByLabel("Year");
  await expect(year).toHaveValue("Year 4");
  await expect(year.locator("option:checked")).toHaveText("Key Stage 2 · Year 4");
  await expect(card).toContainText("National Curriculum in England");

  // The auto pick: asked once, for this topic and year, and applied.
  await expect(card.getByLabel("Subject")).toHaveValue("Maths", NAV);
  expect(calls.suggest).toEqual([{ topic: "Fractions", year: "Year 4" }]);
  await expect(card.getByLabel("Strand")).toHaveValue(FRACTIONS);
  await expect(card).toContainText("3 selected statements");

  // The strand lists the curriculum's own ten Year 4 fraction statements.
  const boxes = card.getByRole("checkbox");
  await expect(boxes).toHaveCount(10);
  await expect(card.locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(3);

  // Never a GCSE strand on a primary year.
  const strands = await card.getByLabel("Strand").locator("option").allTextContents();
  expect(strands.join(" | ")).not.toMatch(/Cell biology|Atomic structure|Algebra and functions/);

  // The teacher has the last word: untick one.
  await card.getByRole("checkbox", { name: `${FRACTIONS} ${textOf(PICKS[2])}`, exact: true }).click();
  await expect(card).toContainText("2 selected statements");

  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: /Generate slideshow/ }).click();
  await expect.poll(() => calls.deck.length, NAV).toBe(1);

  expect(calls.deck[0].curriculum).toMatchObject({
    countryId: "england",
    curriculumName: "National Curriculum in England",
    year: "Year 4",
    stage: "Key Stage 2",
    subject: "Maths",
    statements: [
      { id: PICKS[0], text: textOf(PICKS[0]) },
      { id: PICKS[1], text: textOf(PICKS[1]) },
    ],
  });
});

test("the years are grouped as the brief asks: Nursery and Reception, then Years 1 to 3, then 4 to 6", async ({ page }) => {
  await stub(page, "Year 3");
  const card = await openStepTwo(page, "Year 3");

  const year = card.getByLabel("Year");
  await expect(year.locator("option:checked")).toHaveText("Key Stage 1 · Year 3");
  const options = await year.locator("option").allTextContents();
  expect(options).toEqual([
    "Select year",
    "Pre Key Stage · Nursery",
    "Pre Key Stage · Reception",
    "Key Stage 1 · Year 1",
    "Key Stage 1 · Year 2",
    "Key Stage 1 · Year 3",
    "Key Stage 2 · Year 4",
    "Key Stage 2 · Year 5",
    "Key Stage 2 · Year 6",
  ]);

  // Nursery and Reception come from the early years documents.
  await year.selectOption("Reception");
  await expect(card).toContainText("EYFS: Early Learning Goals");
  await year.selectOption("Nursery");
  await expect(card).toContainText("EYFS: Development Matters");
});

test("a year the curriculum data does not cover says so instead of showing a wrong list", async ({ page }) => {
  await stub(page, "Year 8");
  const card = await openStepTwo(page, "Year 8");
  await expect(card.getByTestId("curriculum-not-covered")).toContainText("Year 8 is not covered yet");
  await expect(card.getByLabel("Subject")).toHaveCount(0);
});
