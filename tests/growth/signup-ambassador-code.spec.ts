import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  createProfilelessTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * The ambassador code on the profile step (/complete-profile), recorded before
 * the no-card trial starts.
 *
 * Why it is here: most teachers subscribe after the trial, and the recorded
 * code is what credits the ambassador whichever discount they pay with. It used
 * to be offered only on /welcome, where a code from the ambassador's link sat
 * pre-filled until the teacher pressed Apply; skipping it lost the referral.
 *
 * Edge cases this is written against:
 *   - a link code is filled in, checked, and recorded with no extra press
 *   - recorded BEFORE the trial starts, not after
 *   - a typed code works the same way
 *   - an unknown code is said so, and signing up still goes through, with
 *     nothing attributed and the trial started
 *   - clearing a link's code is respected: nothing attributed
 *   - no code: nothing changes for the majority
 *   - /welcome then names the recorded code instead of offering a box
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

let ambassadorId: string | null = null;
const people: TestTeacher[] = [];

test.afterEach(async () => {
  if (ambassadorId) await admin.from("ambassadors").delete().eq("id", ambassadorId);
  ambassadorId = null;
  for (const p of people.splice(0)) await deleteTeacher(p);
});

/** An ambassador with a code. The Stripe id is a placeholder: the check route
 *  still calls the code valid (it only loses the "20% off" wording). */
async function ambassadorCode(): Promise<string> {
  const t = tag();
  const { data: amb, error } = await admin
    .from("ambassadors")
    .insert({ full_name: `ZZ Signup ${t}`, email: `zz-signup-${t}@example.com` })
    .select()
    .single();
  if (error) throw error;
  ambassadorId = amb.id;
  const code = `ZZSIGN${t}`.toUpperCase();
  const { error: codeErr } = await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: amb.id, promotion_code_id: `promo_zzsg${t}`, code });
  if (codeErr) throw codeErr;
  return code;
}

async function newTeacher(name: string) {
  const t = await createProfilelessTeacher(name);
  people.push(t);
  return t;
}

async function fillProfile(page: Page) {
  await page.getByLabel("First name").fill("Sam");
  await page.getByLabel("Surname").fill("Testcase");
  await page.getByLabel("Phone number").fill("7700900123");
}

async function referralOf(t: TestTeacher) {
  const { data } = await admin
    .from("ambassador_referrals")
    .select("ambassador_id, redeemed_at")
    .eq("user_id", t.id)
    .maybeSingle();
  return data;
}

async function trialStartedAt(t: TestTeacher) {
  const { data } = await admin.from("profiles").select("free_trial_started_at").eq("id", t.id).single();
  return data?.free_trial_started_at as string | null;
}

const field = (page: Page) => page.getByTestId("signup-ambassador-code");
const result = (page: Page) => page.getByTestId("signup-ambassador-code-result");

test("a code from the ambassador's link is filled in and recorded before the trial starts", async ({ page }) => {
  const code = await ambassadorCode();
  const t = await newTeacher("Lin");

  // Arrive through the link signed out, as a new teacher does.
  await page.goto(`/signup?code=${code}`);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("jooma:ambassador-code")))
    .toBe(code);

  await signIn(page, t);
  await page.goto("/complete-profile");
  await expect(field(page)).toHaveValue(code);
  await expect(result(page)).toContainText(code);
  await expect(result(page)).not.toContainText(/recognised/i);

  await fillProfile(page);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/welcome/);

  const ref = await referralOf(t);
  expect(ref?.ambassador_id).toBe(ambassadorId);
  const started = await trialStartedAt(t);
  expect(started).not.toBeNull();
  // Recorded first, then the trial.
  expect(new Date(ref!.redeemed_at).getTime()).toBeLessThanOrEqual(new Date(started!).getTime());

  // /welcome names it rather than offering a box that would refuse another.
  await expect(page.getByTestId("welcome-code-claimed")).toContainText(code);
  await expect(page.getByLabel("Your code")).toHaveCount(0);
});

test("a typed code is checked and recorded the same way", async ({ page }) => {
  const code = await ambassadorCode();
  const t = await newTeacher("Max");
  await signIn(page, t);
  await page.goto("/complete-profile");

  await expect(field(page)).toHaveValue("");
  await field(page).fill(code.toLowerCase());
  // Upper-cased as typed.
  await expect(field(page)).toHaveValue(code);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(result(page)).toContainText(code);

  await fillProfile(page);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/welcome/);
  expect((await referralOf(t))?.ambassador_id).toBe(ambassadorId);
});

test("an unknown code is said so, and signing up still goes through", async ({ page }) => {
  const t = await newTeacher("Nia");
  await signIn(page, t);
  await page.goto("/complete-profile");

  await field(page).fill(`NOSUCH${tag()}`);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(result(page)).toContainText(/isn't recognised/i);

  await fillProfile(page);
  // Not blocked by the bad code.
  await expect(page.getByRole("button", { name: /create account/i })).toBeEnabled();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/welcome/);

  expect(await referralOf(t)).toBeNull();
  expect(await trialStartedAt(t)).not.toBeNull();
});

test("clearing a link's code is respected: nothing is attributed", async ({ page }) => {
  const code = await ambassadorCode();
  const t = await newTeacher("Oz");
  await page.goto(`/signup?code=${code}`);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("jooma:ambassador-code")))
    .toBe(code);
  await signIn(page, t);
  await page.goto("/complete-profile");
  await expect(field(page)).toHaveValue(code);

  await field(page).fill("");
  await fillProfile(page);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/welcome/);

  expect(await referralOf(t)).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("jooma:ambassador-code"))).toBeNull();
});

test("no code: signing up is unchanged", async ({ page }) => {
  const t = await newTeacher("Pia");
  await signIn(page, t);
  await page.goto("/complete-profile");
  await fillProfile(page);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/welcome/);
  expect(await referralOf(t)).toBeNull();
  expect(await trialStartedAt(t)).not.toBeNull();
  await expect(page.getByTestId("welcome-code-claimed")).toHaveCount(0);
});
