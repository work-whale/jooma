import { test, expect } from "@playwright/test";
import { createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The Comprehension tool's designed sheet: the passage in a tinted panel with
 * numbered paragraphs, a section per reading domain, answers on their own
 * page. For a signed in teacher on the tool page, and for a visitor's free try
 * on /create.
 *
 * Both generation routes are answered by page.route with a fixed sheet:
 * NOTHING REACHES A MODEL AND NOTHING IS SPENT.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const questions = [
  { title: "Retrieval", emoji: "🔎", instructions: "Find the answers in the text.", blocks: [
    { type: "short", prompt: "What do bees carry from flower to flower?", quote: "", lines: 2, answer: "Pollen.", marks: 1, domain: "2b" },
    { type: "mcq", prompt: "Where do honeybees live?", options: ["A hive", "A burrow", "A nest of sticks"], answers: [0], marks: 1, domain: "2b" },
  ] },
  { title: "Vocabulary", emoji: "📚", instructions: "", blocks: [
    { type: "short", prompt: "What does this word mean?", quote: "pollinate", lines: 2, answer: "To carry pollen so plants can make seeds.", marks: 1, domain: "2a" },
  ] },
];

const GENERATED = {
  title: "Why bees matter",
  objective: "",
  intro: { variant: "fact", label: "", text: "", emoji: "" },
  sections: [
    { title: "Read the text", emoji: "📖", instructions: "Read carefully.", blocks: [
      { type: "passage", title: "Busy bees", paragraphs: ["Bees carry pollen from flower to flower.", "Without them, many crops would not grow."] },
      { type: "wordbank", title: "Key words", words: ["pollen", "pollinate", "hive"] },
    ] },
    ...questions,
  ],
  teacherNotes: [],
};

test.describe("signed in", () => {
  let teacher: TestTeacher;
  test.beforeAll(async () => {
    teacher = await createTeacher("Compsheet");
  });
  test.afterAll(async () => {
    await deleteTeacher(teacher);
  });

  test("the teacher's own text leads the sheet word for word, never rewritten by the model", async ({ page }) => {
    await signIn(page, teacher);

    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/comprehension-generator", (route) => {
      sent = route.request().postDataJSON();
      // An own text comprehension: the model writes questions only.
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: JSON.stringify({ title: "My bees text", objective: "", intro: { variant: "fact", label: "", text: "", emoji: "" }, sections: questions, teacherNotes: [] }),
      });
    });

    // Jo fills a generated-text form; the teacher declines, then switches to
    // their own text.
    const fields = { curriculum: "2014 National Curriculum", yearGroup: "Year 4", topic: "Bees" };
    await page.goto(`/tools/comprehension-generator?prefill=${encodePrefill({ slug: "comprehension-generator", fields })}`);
    await page.getByRole("button", { name: /check the inputs first/i }).click(NAV);

    const own = "Honeybees live in hives.\nThey make honey from nectar.\n\nA hive can hold 50,000 bees!";
    await page.getByRole("button", { name: "Use my own text" }).click();
    await page.getByPlaceholder("Paste your text here...").fill(own);
    await page.locator("[data-jo-generate]").click();

    const sheet = page.getByTestId("sheet-document");
    await expect(sheet).toHaveAttribute("data-ready", "true", NAV);
    expect(sent).toMatchObject({ textSource: "own", ownText: own });

    // The passage, as the teacher wrote it, in numbered paragraphs.
    const paras = sheet.locator(".js-pages .js-passage .js-para");
    await expect(paras).toHaveCount(2);
    await expect(paras.nth(0)).toContainText("Honeybees live in hives. They make honey from nectar.");
    await expect(paras.nth(1)).toContainText("A hive can hold 50,000 bees!");
    await expect(sheet.locator(".js-pages .js-para-num")).toHaveText(["1", "2"]);

    // Sections and domains, numbered questions, a vocabulary quote.
    await expect(sheet.locator(".js-pages .js-section-title")).toHaveText(["Read the text", "Retrieval", "Vocabulary"]);
    await expect(sheet.locator(".js-pages .js-domain").first()).toHaveText("2b");
    await expect(sheet.locator(".js-pages .js-quote")).toContainText("pollinate");

    // The outline rail follows the sheet's sections.
    await page.getByRole("button", { name: "Jump to section" }).first().click();
    await expect(page.locator("#outline-hover-panel")).toContainText("Vocabulary");
  });
});

test.describe("a visitor's free try", () => {
  test("streams in as a designed sheet they can edit, and copying asks them to sign up", async ({ page }) => {
    await page.route("**/api/try/prefill", (route) =>
      route.fulfill({
        json: {
          prefill: encodePrefill({
            slug: "comprehension-generator",
            fields: { topic: "Why bees matter", yearGroup: "Year 4", curriculum: "2014 National Curriculum" },
          }),
        },
      }),
    );
    await page.route("**/api/try/comprehension", (route) =>
      route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8", "x-trial-id": "abc" }, body: JSON.stringify(GENERATED) }),
    );
    await page.goto("/create?tool=comp&topic=Why%20bees%20matter");

    const generate = page.locator("[data-jo-generate]");
    await expect(generate).toBeEnabled(NAV);
    await generate.click();

    const result = page.getByTestId("guest-result");
    const sheet = result.getByTestId("sheet-document");
    await expect(sheet).toHaveAttribute("data-ready", "true", NAV);
    await expect(sheet.locator(".js-pages .js-passage")).toContainText("Bees carry pollen from flower to flower.");
    await expect(sheet.locator(".js-pages .js-wordbank .js-tile")).toHaveText(["pollen", "pollinate", "hive"]);
    await expect(sheet.locator(".js-pages .js-answers-title")).toBeVisible();

    // Editable for the visit.
    const title = sheet.locator(".js-pages h1.js-title");
    await title.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Bees and us");
    await page.keyboard.press("Enter");
    await expect(title).toHaveText("Bees and us");

    await result.getByRole("button", { name: /Copy/ }).click();
    await expect(page.getByTestId("auth-gate").getByRole("heading")).toHaveText("Sign up for free to copy your comprehension");

    await page.screenshot({ path: "test-results/comprehension-guest.png", fullPage: true });
  });
});
