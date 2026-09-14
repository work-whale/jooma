import { test, expect } from "@playwright/test";
import {
  createAdmin,
  createProfilelessTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * An abandoned signup has to be visible to someone.
 *
 * It was not. The Teachers table starts FROM profiles (20260812000100, so that
 * invite-created auth users stop showing as blank-named rows) and Pending
 * invites reads the real invites table (20260812000200, which replaced the
 * older "auth user with no profile" inference). Between those two deliberate
 * changes, a self-signup who never finished onboarding stopped appearing on
 * either list — which is how info@jooma.ai ran a generation while being
 * invisible in the console.
 *
 * admin_incomplete_signups() owns that state now. These tests also cover the
 * page itself: /admin/users awaits three RPCs, and one of them failing would
 * take the whole Teachers screen down rather than just hiding a section.
 */
test.describe("incomplete signups", () => {
  let admin: TestTeacher;
  let stranded: TestTeacher;

  test.beforeEach(async () => {
    admin = await createAdmin("Auditor");
    stranded = await createProfilelessTeacher("Abandoned");
  });

  test.afterEach(async () => {
    await deleteTeacher(admin);
    await deleteTeacher(stranded);
  });

  test("the Teachers page still renders with the third RPC wired in", async ({ page }) => {
    await signIn(page, admin);

    await page.goto("/admin/users");

    // The page's own heading, not the section's — if admin_incomplete_signups()
    // errored, the whole server component would fail and neither would render.
    await expect(page.getByRole("heading", { name: /^teachers$/i })).toBeVisible();
  });

  test("lists a teacher who never finished the profile form", async ({ page }) => {
    await signIn(page, admin);

    await page.goto("/admin/users");

    const section = page.getByText(/incomplete signups/i);
    await expect(section).toBeVisible();
    await expect(page.getByText(stranded.email)).toBeVisible();
  });

  test("does not list a teacher who did finish it", async ({ page }) => {
    // The admin fixture is a complete account, so it belongs in the Teachers
    // table and must not be double-reported here. Catches a query that forgets
    // its `where p.id is null`.
    await signIn(page, admin);

    await page.goto("/admin/users");

    const incomplete = page.locator("table", {
      has: page.getByText(stranded.email),
    });
    await expect(incomplete).not.toContainText(admin.email);
  });
});
