import { test, expect } from "@playwright/test";
import { admin, createAdminWithRole, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The automatic teacher emails switch, in Admin, Emails & templates (moved
 * from the Vercel variable LIFECYCLE_EMAILS, 20 Nov). The rules are unit
 * tested (tests/unit/lifecycle-switch.spec.ts); this proves the screen.
 *
 * Cases: the card lists every email and previews one from sample values;
 * turning one email off saves it to app_settings; turning the main switch on
 * asks first, Cancel leaves it off, and Start sending saves enabled: true. That
 * last save is caught and answered here, never written: staging must not start
 * sending, even for a moment. An admin without see_content (marketing) never
 * sees the card. The setting is put back as it was afterwards.
 */

let owner: TestTeacher | null = null;
let marketing: TestTeacher | null = null;
let before: unknown = null;

test.beforeAll(async () => {
  const { data } = await admin.from("app_settings").select("value").eq("key", "lifecycle_emails").single();
  before = data!.value;
  await admin.from("app_settings").update({ value: { enabled: false, off: [] } }).eq("key", "lifecycle_emails");
  owner = await createAdminWithRole("Olive", "super_admin");
  marketing = await createAdminWithRole("Mira", "marketing");
});

test.afterAll(async () => {
  await admin.from("app_settings").update({ value: before }).eq("key", "lifecycle_emails");
  await deleteTeacher(owner);
  await deleteTeacher(marketing);
});

test("an owner previews, turns one email off, and is asked before sending starts", async ({ page }) => {
  await signIn(page, owner!);
  await page.goto("/admin/emails?tab=templates");
  const table = page.getByTestId("lifecycle-emails");
  await expect(table).toBeVisible({ timeout: 120_000 });
  await expect(table.locator("tr[data-email]")).toHaveCount(16);

  // Preview: the real wording, from sample values.
  await table.locator('tr[data-email="E6"]').getByRole("button", { name: "Preview" }).click();
  const preview = page.getByTestId("lifecycle-preview");
  await expect(preview).toContainText("Your Pro trial ends tonight");
  await page.keyboard.press("Escape");

  // One email off: saved.
  await table.getByRole("switch", { name: "Send E8" }).click();
  await expect
    .poll(async () => (await admin.from("app_settings").select("value").eq("key", "lifecycle_emails").single()).data!.value)
    .toEqual({ enabled: false, off: ["E8"] });

  // The main switch asks first; Cancel leaves it off.
  const master = page.getByRole("switch", { name: "Send automatic teacher emails" });
  await master.click();
  await expect(page.getByText("Start sending to teachers?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  const { data: still } = await admin.from("app_settings").select("value").eq("key", "lifecycle_emails").single();
  expect(still!.value).toEqual({ enabled: false, off: ["E8"] });

  // Start sending: the save is caught here and never reaches staging.
  let sent: unknown = null;
  await page.route("**/rest/v1/rpc/admin_set_setting", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 204, body: "" });
  });
  await master.click();
  await page.getByRole("button", { name: "Start sending" }).click();
  await expect.poll(() => sent).toEqual({ p_key: "lifecycle_emails", p_value: { enabled: true, off: ["E8"] } });
  const { data: after } = await admin.from("app_settings").select("value").eq("key", "lifecycle_emails").single();
  expect((after!.value as { enabled: boolean }).enabled).toBe(false);
});

test("marketing, without see_content, does not see the switch", async ({ page }) => {
  await signIn(page, marketing!);
  await page.goto("/admin/emails?tab=templates");
  await expect(page.getByRole("heading", { name: /Templates|Emails/ }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("lifecycle-emails")).toHaveCount(0);
});
