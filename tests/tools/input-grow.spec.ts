import { test, expect, type Locator } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The two prompt boxes a teacher types a sentence into, on a phone: the Ask Jo
 * panel and the landing hero. Both used to be a single line, so a long prompt
 * scrolled out of sight. Now they wrap and grow, up to a ceiling, past which
 * they scroll.
 *
 * Nothing is sent: no model is called. The Jo run is seeded for a throwaway
 * teacher in staging.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(180_000);
const NAV = { timeout: 120_000 };

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const LONG =
  "Make every question easier for a Year 3 class who are new to multiplication, keep the same number of questions, and add a short worked example before the first one so they can see the method";

const height = (el: Locator) => el.evaluate((n) => n.getBoundingClientRect().height);

/** Grows past one line to show all of a long prompt, and shrinks back. */
async function expectGrows(box: Locator) {
  const oneLine = await height(box);
  await box.fill(LONG);
  await expect.poll(() => height(box)).toBeGreaterThan(oneLine * 1.8);
  // Every line visible: nothing hidden behind a scroll.
  expect(await box.evaluate((n) => n.scrollHeight - n.clientHeight)).toBeLessThanOrEqual(1);

  await box.fill("Short");
  await expect.poll(() => height(box)).toBeLessThan(oneLine + 2);
}

test.describe("Ask Jo", () => {
  let teacher: TestTeacher;

  test.beforeAll(async () => {
    teacher = await createTeacher("Jogrow");
  });

  test.afterAll(async () => {
    await deleteTeacher(teacher);
  });

  test("the message box wraps and grows on a phone, with a touch-sized send button", async ({ page }) => {
    const { data, error } = await admin
      .from("tool_runs")
      .insert({
        user_id: teacher.id,
        tool_slug: "quiz-generator",
        title: "Seeded",
        input: { topic: "Seeded" },
        output: JSON.stringify([{ question: "What is 2 + 2?", options: ["3", "4", "5", "6"], correctIndex: 1 }]),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await signIn(page, teacher);
    await page.goto(`/tools/quiz-generator?run=${data.id}`);
    await page.getByTestId("jo-fab").click(NAV);

    const box = page.getByTestId("jo-input");
    await expect(box).toBeVisible();
    await expectGrows(box);

    // A very long message stops growing and scrolls, so the conversation
    // stays in view above it.
    await box.fill(Array(12).fill(LONG).join(" "));
    expect(await height(box)).toBeLessThanOrEqual(151);
    expect(await box.evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);

    const send = await page.getByTestId("jo-send").boundingBox();
    expect(send?.width).toBeGreaterThanOrEqual(44);
  });
});

test.describe("the landing hero", () => {
  test("the topic box wraps and grows on a phone, and Enter still creates", async ({ page }) => {
    await page.goto("/");
    const box = page.getByLabel("What are you teaching?");
    await expect(box).toBeEnabled(NAV);
    await expectGrows(box);

    // A pasted line break is folded into a space rather than sent in the URL.
    await box.fill("Volcanoes\nYear 3");
    await expect(box).toHaveValue("Volcanoes Year 3");
    await box.press("Enter");
    await page.waitForURL(/\/create\?tool=slides&topic=Volcanoes/, NAV);
  });
});
