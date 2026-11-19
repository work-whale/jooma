import { test, expect } from "@playwright/test";
import { admin, createAdminWithRole, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Phase 3 (spec Step 9): the weekly list of schools with 3 or more teachers,
 * at /admin/school-leads. The grouping rules are unit tested
 * (tests/unit/school-groups.spec.ts); this proves the page reads real
 * profiles on staging and shows them to the right admins.
 *
 * Cases: three teachers who typed the same school (spelt differently) show as
 * one school, marked new this week, with the senior leader counted; their
 * sign-in addresses never appear on the page; the link is in the People nav;
 * an admin without see_people (marketing) cannot open the page.
 *
 * Fixtures are on @jooma.test (no school domain), so they group on the typed
 * name alone; the name carries a run tag so other runs never join the group.
 */

const tag = Date.now().toString(36);
const SCHOOL = `Leadsville ${tag} Primary`;
let teachers: TestTeacher[] = [];
let owner: TestTeacher | null = null;
let marketing: TestTeacher | null = null;

test.beforeAll(async () => {
  owner = await createAdminWithRole("Olive", "super_admin");
  marketing = await createAdminWithRole("Mira", "marketing");
  const spellings = [SCHOOL, `The ${SCHOOL} School`, SCHOOL.toUpperCase()];
  for (const [i, name] of spellings.entries()) {
    const t = await createTeacher(["Ana", "Ben", "Cal"][i]);
    const { error } = await admin
      .from("profiles")
      .update({ school_name: name, job_role: i === 0 ? "senior_leader" : "class_teacher" })
      .eq("id", t.id);
    if (error) throw new Error(error.message);
    teachers.push(t);
  }
});

test.afterAll(async () => {
  for (const t of teachers) await deleteTeacher(t);
  teachers = [];
  await deleteTeacher(owner);
  await deleteTeacher(marketing);
});

test("an owner sees the school once, with its teachers and no addresses", async ({ page }) => {
  await signIn(page, owner!);
  await page.goto("/admin/school-leads");
  await expect(page.getByRole("heading", { name: "Schools with 3+ teachers" })).toBeVisible();
  await expect(page.locator("aside").getByRole("link", { name: "Schools with 3+" })).toBeVisible();

  const card = page.locator("div.rounded-2xl", { has: page.getByRole("heading", { name: SCHOOL, exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("3 teachers")).toBeVisible();
  await expect(card.getByText("New this week")).toBeVisible();
  await expect(card.getByText("1 senior leader")).toBeVisible();
  for (const name of ["Ana", "Ben", "Cal"]) await expect(card.getByRole("cell", { name, exact: true })).toBeVisible();

  const text = await page.locator("main").innerText();
  for (const t of teachers) expect(text).not.toContain(t.email);
});

test("marketing, without see_people, cannot open it", async ({ page }) => {
  await signIn(page, marketing!);
  await page.goto("/admin/school-leads");
  await expect(page).not.toHaveURL(/\/admin\/school-leads/);
  await expect(page.getByRole("heading", { name: "Schools with 3+ teachers" })).toHaveCount(0);
});
