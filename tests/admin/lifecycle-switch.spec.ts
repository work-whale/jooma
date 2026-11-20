import { test, expect } from "@playwright/test";
import { admin, asTeacher, createAdminWithRole, deleteTeacher, signIn, type TestTeacher } from "../support/users";

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
 *
 * The database (security review, 20 Nov): the save is its own function,
 * admin_set_lifecycle_emails, needing see_content like the card. Every call
 * below goes through the ANON key as a signed-in throwaway admin, since the
 * service role would skip the checks. Marketing (an admin without
 * see_content) is refused; nobody can write the key through the generic
 * admin_set_setting; an unknown email id is refused; the owner's valid save
 * lands as sent.
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
  await page.route("**/rest/v1/rpc/admin_set_lifecycle_emails", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 204, body: "" });
  });
  await master.click();
  await page.getByRole("button", { name: "Start sending" }).click();
  await expect.poll(() => sent).toEqual({ p_enabled: true, p_off: ["E8"] });
  const { data: after } = await admin.from("app_settings").select("value").eq("key", "lifecycle_emails").single();
  expect((after!.value as { enabled: boolean }).enabled).toBe(false);
});

test("marketing, without see_content, does not see the switch", async ({ page }) => {
  await signIn(page, marketing!);
  await page.goto("/admin/emails?tab=templates");
  await expect(page.getByRole("heading", { name: /Templates|Emails/ }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("lifecycle-emails")).toHaveCount(0);
});

test.describe("the database refuses what the screen hides", () => {
  const read = async () => (await admin.from("app_settings").select("value").eq("key", "lifecycle_emails").single()).data!.value;

  test("marketing cannot switch emails on, by either route", async () => {
    const db = await asTeacher(marketing!);
    const a = await db.rpc("admin_set_lifecycle_emails", { p_enabled: true, p_off: [] });
    expect(a.error?.message).toMatch(/see_content|not authorized/);
    const b = await db.rpc("admin_set_setting", { p_key: "lifecycle_emails", p_value: { enabled: true, off: [] } });
    expect(b.error).not.toBeNull();
    expect((await read()) as { enabled: boolean }).toMatchObject({ enabled: false });
  });

  test("not even the owner can write it through the generic settings save", async () => {
    const db = await asTeacher(owner!);
    const { error } = await db.rpc("admin_set_setting", { p_key: "lifecycle_emails", p_value: { enabled: true, off: [] } });
    expect(error?.message).toMatch(/Emails & templates/);
    expect((await read()) as { enabled: boolean }).toMatchObject({ enabled: false });
  });

  test("an unknown email id is refused; a valid save lands", async () => {
    const db = await asTeacher(owner!);
    const bad = await db.rpc("admin_set_lifecycle_emails", { p_enabled: false, p_off: ["E8", "E99"] });
    expect(bad.error?.message).toMatch(/E99/);
    const good = await db.rpc("admin_set_lifecycle_emails", { p_enabled: false, p_off: ["E8", "E10"] });
    expect(good.error).toBeNull();
    // A set: the database keeps each id once, in its own order.
    const saved = (await read()) as { enabled: boolean; off: string[] };
    expect(saved.enabled).toBe(false);
    expect([...saved.off].sort()).toEqual(["E10", "E8"]);
  });
});
