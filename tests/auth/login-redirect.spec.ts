import { test, expect } from "@playwright/test";
import { createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Where signing in lands: the dashboard, never the landing page. The password
 * form, /auth/callback (Google) and the proxy's already-signed-in redirect all
 * share SIGNED_IN_HOME (app/lib/safe-next.ts). Google itself cannot be driven
 * from a test, so the callback is covered by sharing the constant.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

const NAV = { timeout: 60_000 };

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Loginhome");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test("signing in with a password lands on the dashboard", async ({ page }) => {
  await signIn(page, teacher);
  await page.waitForURL("**/dashboard", NAV);
});

test("visiting /login or /signup while signed in goes to the dashboard", async ({ page }) => {
  await signIn(page, teacher);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/, NAV);
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/dashboard$/, NAV);
});
