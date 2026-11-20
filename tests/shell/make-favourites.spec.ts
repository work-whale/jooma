import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Favourites on the Make page (stars replaced pins), and the categories A to Z.
 *
 * The main path: a teacher who never starred anything sees Slides, Worksheets
 * and Comprehension in Favourites, above the categories, and in the sidebar.
 * Unstarring a default is saved to the ACCOUNT, not the browser: it stays gone
 * in a fresh browser context. Starring another tool adds it to both places.
 * An old browser pin is carried across into the account on first visit.
 *
 * The rules themselves (null vs empty, junk, order) are unit tested in
 * tests/unit/favourites.spec.ts; this proves the screens and the save.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
const NAV = { timeout: 90_000 };

let teacher: TestTeacher | null = null;
let pinner: TestTeacher | null = null;
test.afterAll(async () => {
  await deleteTeacher(teacher);
  await deleteTeacher(pinner);
});

async function savedStars(id: string): Promise<string[] | null> {
  const { data } = await admin.from("profiles").select("favourite_tools").eq("id", id).single();
  return (data?.favourite_tools as string[] | null) ?? null;
}

test("defaults on top, A to Z below, and a change survives another browser", async ({ page, browser }) => {
  teacher = await createTeacher("Stars");
  await signIn(page, teacher);
  await page.goto("/tools", NAV);

  const favourites = page.getByTestId("favourites");
  await expect(favourites.getByRole("heading", { name: "Favourites" })).toBeVisible(NAV);
  for (const name of ["Slides", "Worksheets", "Comprehension"]) {
    await expect(favourites.getByRole("heading", { name, exact: true })).toBeVisible();
  }

  // Favourites first, then every category A to Z.
  const headings = await page.locator("section h2").allTextContents();
  expect(headings).toEqual([
    "Favourites",
    "Assessment",
    "Behaviour and SEND",
    "Classroom resources",
    "Communication",
    "Leadership",
    "Planning",
    "Slides",
  ]);
  // The chips match, after Everything.
  const chips = await page.getByTestId("tool-filters").getByRole("button").allTextContents();
  expect(chips).toEqual(["Everything", ...headings.slice(1)]);

  const nav = page.getByTestId("nav-favourites");
  await expect(nav.getByText("Favourites")).toBeVisible();
  await expect(nav.getByRole("link", { name: /Slides/ })).toBeVisible();

  // Nothing written for a teacher who has only looked.
  expect(await savedStars(teacher.id)).toBeNull();

  // Unstar Slides, star Quizzes.
  await favourites.getByRole("button", { name: "Remove Slides from favourites" }).click();
  await expect(favourites.getByRole("heading", { name: "Slides", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /^Slides$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Quizzes to favourites" }).click();
  await expect(favourites.getByRole("heading", { name: "Quizzes", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Quizzes/ })).toBeVisible();

  await expect
    .poll(() => savedStars(teacher!.id), { timeout: 15_000 })
    .toEqual(["/tools/worksheet-generator", "/tools/comprehension-generator", "/tools/quiz-generator"]);

  // A fresh browser (no local cache): the account's stars, not the defaults.
  const other = await browser.newContext({ storageState: "tests/support/consent-state.json" });
  const p2 = await other.newPage();
  await signIn(p2, teacher);
  await p2.goto("/tools", NAV);
  const fav2 = p2.getByTestId("favourites");
  await expect(fav2.getByRole("heading", { name: "Quizzes", exact: true })).toBeVisible(NAV);
  await expect(fav2.getByRole("heading", { name: "Slides", exact: true })).toHaveCount(0);
  await other.close();
});

test("an old browser pin carries across into the account", async ({ page }) => {
  pinner = await createTeacher("Pinner");
  await page.addInitScript(() => {
    localStorage.setItem("jooma:pinned-tools", JSON.stringify(["/tools/letter-writer"]));
  });
  await signIn(page, pinner);
  await page.goto("/tools", NAV);
  await expect(page.getByTestId("favourites").getByRole("heading", { name: "Letters", exact: true })).toBeVisible(NAV);
  await expect
    .poll(() => savedStars(pinner!.id), { timeout: 15_000 })
    .toEqual([
      "/tools/slideshow",
      "/tools/worksheet-generator",
      "/tools/comprehension-generator",
      "/tools/letter-writer",
    ]);
});
