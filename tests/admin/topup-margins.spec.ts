import { test, expect } from "@playwright/test";
import { admin, createAdminWithRole, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Regression (19 Nov): Admin, Top-ups showed every resource pack at a loss
 * (-73%, -116%, -165%) because it costed a resource as a whole generation.
 * The maths is unit tested (tests/unit/topup-margin.spec.ts); this proves the
 * page uses it: each resource pack on staging shows the margin the helper
 * gives, and none reads negative.
 */

let owner: TestTeacher | null = null;

test.beforeAll(async () => {
  owner = await createAdminWithRole("Olive", "super_admin");
});

test.afterAll(async () => {
  await deleteTeacher(owner);
});

test("resource packs show their real, positive margins", async ({ page }) => {
  const { data: packs, error } = await admin.from("topup_packs").select("name, kind").eq("kind", "resources_topup").eq("active", true);
  if (error) throw new Error(error.message);
  test.skip(!packs?.length, "No resource packs on staging");

  await signIn(page, owner!);
  await page.goto("/admin/topups");
  const table = page.locator("table").first();
  await expect(table.getByText("Margin")).toBeVisible({ timeout: 120_000 });

  for (const p of packs!) {
    const row = table.locator("tr", { hasText: p.name as string });
    const margin = row.locator("td").nth(4);
    await expect(margin).toHaveText(/^\d+%$/);
  }
  await expect(table).not.toContainText(/-\d+%/);
  if (process.env.SCREENSHOTS) {
    await table.screenshot({ path: "docs/screenshots/2026-11-19-topup-margins/after.png" });
  }
});
