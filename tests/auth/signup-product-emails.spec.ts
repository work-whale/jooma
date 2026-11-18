import { test, expect } from "@playwright/test";
import {
  admin,
  createProfilelessTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Consent at signup, and the signup lead. Jooma 4.5 (spec Step 6, rule 3):
 * OPT-IN. One unticked "Send me ideas and offers" box; left unticked, product
 * email is off and marketing_consent is false; ticked, both are on.
 *
 * /signup shows the box under the Terms box, and
 * remembers the typed address as a signup lead the moment Continue is pressed,
 * before any account exists. /complete-profile records the answer against the
 * new account, and asks again only when /signup never did (a new Google account
 * started from /login).
 *
 * Runs the real email signup on staging with a @jooma.test address: "Confirm
 * email" is off there, so no email is sent.
 *
 * Needs supabase/migrations/20261023000000_email_consent_and_delivery.sql.
 */

const TAG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const EMAIL = `e2e-signup-${TAG}@jooma.test`;
const PASSWORD = `Pw-${TAG}-Aa1!`;

let googleLike: TestTeacher | null = null;

test.afterAll(async () => {
  const emails = [EMAIL, googleLike?.email].filter(Boolean) as string[];
  await admin.from("email_opt_outs").delete().in("email", emails);
  await admin.from("signup_leads").delete().in("email", emails);

  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const created = data?.users.find((u) => u.email === EMAIL);
  if (created) await admin.auth.admin.deleteUser(created.id).catch(() => {});
  await deleteTeacher(googleLike);
});

test("leaving the box unticked at signup is remembered through to the account", async ({ page }) => {
  await page.goto("/signup");
  const cont = page.getByRole("button", { name: "Continue", exact: true });
  await cont.waitFor({ state: "visible" });

  const email = page.getByRole("textbox", { name: "Email" });
  await email.fill(EMAIL);
  await expect(email).toHaveValue(EMAIL);
  await page.getByRole("checkbox", { name: /Terms of Service/ }).check();
  // Unticked to start: consent is never assumed.
  await expect(page.getByTestId("signup-marketing-consent")).not.toBeChecked();
  await cont.click();
  await expect(page).toHaveURL(/\/create-password$/);

  // The lead was stored without waiting for it, and carries the answer.
  await expect
    .poll(async () => {
      const { data } = await admin.from("signup_leads").select("opted_out").eq("email", EMAIL).maybeSingle();
      return data?.opted_out ?? null;
    })
    .toBe(true);

  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/complete-profile$/);

  // Already answered on /signup, so not asked twice.
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByTestId("profile-marketing-consent")).toHaveCount(0);

  await page.getByLabel("First name").fill("Signup");
  await page.getByLabel("Surname").fill("Testcase");
  await page.getByRole("textbox", { name: "Phone number" }).fill("7700900123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/complete-profile"), { timeout: 30_000 });

  const { data: optOut } = await admin.from("email_opt_outs").select("source").eq("email", EMAIL).single();
  expect(optOut?.source).toBe("signup");
  expect(await page.evaluate(() => sessionStorage.getItem("jooma:product-emails"))).toBeNull();
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const id = users?.users.find((u) => u.email === EMAIL)?.id;
  const { data: profile } = await admin.from("profiles").select("marketing_consent").eq("id", id!).single();
  expect(profile?.marketing_consent).toBe(false);
});

test("a new account that never saw /signup is asked on /complete-profile", async ({ page }) => {
  // A Google signup started from /login: an account with no profile, and no
  // answer in sessionStorage.
  googleLike = await createProfilelessTeacher("Googly");
  await signIn(page, googleLike);
  await page.goto("/complete-profile");

  const box = page.getByTestId("profile-marketing-consent");
  await expect(box).toBeVisible();
  await expect(box).not.toBeChecked();
  await box.check();

  await page.getByLabel("First name").fill("Googly");
  await page.getByLabel("Surname").fill("Testcase");
  await page.getByRole("textbox", { name: "Phone number" }).fill("7700900124");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/complete-profile"), { timeout: 30_000 });

  // Ticked: consent given, so no opt-out row and marketing_consent on.
  const { data } = await admin.from("email_opt_outs").select("source").eq("email", googleLike.email).maybeSingle();
  expect(data).toBeNull();
  const { data: profile } = await admin.from("profiles").select("marketing_consent, marketing_consent_at").eq("id", googleLike.id).single();
  expect(profile?.marketing_consent).toBe(true);
  expect(profile?.marketing_consent_at).not.toBeNull();
});
