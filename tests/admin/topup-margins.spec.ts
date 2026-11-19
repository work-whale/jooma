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

test("a 4.5 resource pack can be saved from admin (regression)", async ({ page }) => {
  // Saving used to fail with "Unknown pack type resources_topup", so the
  // page could never give a 4.5 pack its Stripe price. Same name, price and
  // units: the route skips Stripe when the price is unchanged and set.
  const { data: pack, error } = await admin
    .from("topup_packs")
    .select("id, name, price_gbp, unit, stripe_price_id, available_to")
    .eq("kind", "resources_topup")
    .not("stripe_price_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  test.skip(!pack, "No priced resource pack on staging");

  await signIn(page, owner!);
  const res = await page.request.post("/api/admin/topups/pack", {
    data: { id: pack!.id, name: pack!.name, priceGbp: Number(pack!.price_gbp), unit: pack!.unit, availableTo: pack!.available_to },
  });
  expect(res.status(), await res.text()).toBe(200);
  const { data: after } = await admin.from("topup_packs").select("stripe_price_id").eq("id", pack!.id).single();
  expect(after!.stripe_price_id).toBe(pack!.stripe_price_id);
});
