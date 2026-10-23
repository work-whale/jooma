import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The Emails section of /profile: one switch over product email.
 *
 * Off writes the teacher's address to email_opt_outs (source 'profile'), the
 * same list the unsubscribe link in every bulk email writes to; on removes it,
 * whatever put it there.
 *
 * Needs supabase/migrations/20261023000000_email_consent_and_delivery.sql.
 */

let teacher: TestTeacher | null = null;

test.beforeAll(async () => {
  teacher = await createTeacher("Prefs");
});

test.afterAll(async () => {
  if (teacher) await admin.from("email_opt_outs").delete().eq("email", teacher.email);
  await deleteTeacher(teacher);
});

async function optOutRow(email: string) {
  const { data } = await admin.from("email_opt_outs").select("source").eq("email", email).maybeSingle();
  return data;
}

test("product email can be turned off and back on, and it sticks", async ({ page }) => {
  await signIn(page, teacher!);
  await page.goto("/profile?section=emails");

  await expect(page.getByRole("link", { name: "Emails" })).toHaveAttribute("aria-current", "page");
  const toggle = page.getByRole("switch", { name: "Product news and updates" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("always reach you")).toBeVisible();

  await toggle.click();
  await expect(page.getByTestId("product-emails-status")).toContainText("You will not get product news");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect((await optOutRow(teacher!.email))?.source).toBe("profile");

  await page.reload();
  await expect(page.getByRole("switch", { name: "Product news and updates" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await page.getByRole("switch", { name: "Product news and updates" }).click();
  await expect(page.getByTestId("product-emails-status")).toContainText("You will get product news");
  expect(await optOutRow(teacher!.email)).toBeNull();
});

test("turning it on clears an opt-out from an unsubscribe link too", async ({ page }) => {
  await admin.from("email_opt_outs").insert({ email: teacher!.email, source: "link" });

  await signIn(page, teacher!);
  await page.goto("/profile?section=emails");
  const toggle = page.getByRole("switch", { name: "Product news and updates" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("product-emails-status")).toContainText("You will get product news");
  expect(await optOutRow(teacher!.email)).toBeNull();
});
