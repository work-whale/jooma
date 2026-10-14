import { createHash, randomBytes } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import {
  admin,
  createAdmin,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Becoming an ambassador: the admin makes a one-person link, the person opens
 * it, signs in, applies in four steps (choosing bank or PayPal, and the code
 * they want, which is permanent), waits under review, and is approved or
 * declined.
 *
 * Needs supabase/migrations/20261014000000_ambassador_programme_v2.sql on the
 * target database. The approval test creates real coupons in Stripe and is
 * skipped unless the key is a TEST key.
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** An invite, made the way the admin route makes it. Returns the raw token. */
async function makeInvite(name: string): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await admin
    .from("ambassador_invites")
    .insert({
      full_name: name,
      source: "instagram",
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`Could not create the invite: ${error.message}`);
  return { id: data.id, token };
}

/** An application, as the apply route submits it (service role). */
async function submitApplication(teacher: TestTeacher, token: string, code: string): Promise<string> {
  const { data, error } = await admin.rpc("submit_ambassador_application", {
    p_user_id: teacher.id,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    payload: {
      first_name: teacher.firstName,
      last_name: teacher.surname,
      email: teacher.email,
      mobile: "07700 900412",
      date_of_birth: "1990-04-18",
      address_line: "42 Hartley Road",
      town: "Leeds",
      postcode: "LS6 2JT",
      instagram: "zzteaches",
      reach: "5k_25k",
      payout_method: "paypal",
      account_holder: `${teacher.firstName} ${teacher.surname}`,
      paypal_email: `pp-${tag()}@example.com`,
      tax_status: "self_assessment",
      requested_code: code,
      agreement_version: "e2e",
      signature_name: `${teacher.firstName} ${teacher.surname}`,
      signed_ip: "127.0.0.1",
      declarations: { read: true, tax: true, disclosure: true },
    },
  });
  if (error) throw new Error(`Could not submit the application: ${error.message}`);
  return data as string;
}

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
}

test.describe("Ambassador onboarding", () => {
  const people: TestTeacher[] = [];
  const invites: string[] = [];
  const ambassadors: string[] = [];

  test.afterEach(async () => {
    for (const id of ambassadors.splice(0)) await admin.from("ambassadors").delete().eq("id", id);
    for (const p of people.splice(0)) {
      await admin.from("ambassador_applications").delete().eq("user_id", p.id);
      await deleteTeacher(p);
    }
    for (const id of invites.splice(0)) await admin.from("ambassador_invites").delete().eq("id", id);
  });

  test("an admin makes a link from a name and a source, and it opens the invite page signed out", async ({
    page,
    browser,
  }) => {
    const boss = await createAdmin("Ash");
    people.push(boss);
    const name = `Priya Zz${tag()}`;

    await signIn(page, boss);
    await page.goto("/admin/ambassadors");
    const box = page.getByTestId("invite-box");
    await box.getByPlaceholder("Priya Raman").fill(name);
    await box.getByRole("combobox").selectOption("tiktok");
    await box.getByRole("button", { name: "Generate link" }).click();

    const link = (await box.getByTestId("invite-link").textContent())!.trim();
    expect(link).toMatch(/\/ambassador\/invite\/[A-Za-z0-9_-]{20,}$/);

    const { data: row } = await admin.from("ambassador_invites").select("id, source").eq("full_name", name).single();
    invites.push(row!.id);
    expect(row!.source).toBe("tiktok");

    // Signed out, in a fresh context.
    const ctx = await browser.newContext();
    const visitor = await ctx.newPage();
    await visitor.goto(new URL(link).pathname);
    await expect(visitor.getByTestId("ambassador-invite")).toBeVisible();
    await expect(visitor.getByText("Teach with Jooma.")).toBeVisible();
    await expect(visitor.getByText(name.split(" ")[0]).first()).toBeVisible();
    await expect(visitor.getByTestId("invite-cta")).toHaveAttribute("href", /\/signup\?next=%2Fambassador%2Fapply%2F/);
    await ctx.close();

    // Opening it is recorded once.
    const { data: opened } = await admin.from("ambassador_invites").select("opened_at").eq("id", row!.id).single();
    expect(opened!.opened_at).not.toBeNull();
  });

  test("a signed out visitor to the application signs in and comes straight back", async ({ page }) => {
    const teacher = await createTeacher("Rowan");
    people.push(teacher);
    const invite = await makeInvite("Rowan Zz");
    invites.push(invite.id);
    const apply = `/ambassador/apply/${invite.token}`;

    await page.goto(apply);
    await expect(page).toHaveURL(/\/login\?next=%2Fambassador%2Fapply%2F/);

    const submit = page.getByRole("button", { name: /^sign in$/i });
    await submit.waitFor({ state: "visible" });
    await page.locator("#email").fill(teacher.email);
    await expect(page.locator("#email")).toHaveValue(teacher.email);
    await page.locator("#password").fill(teacher.password);
    await expect(page.locator("#password")).toHaveValue(teacher.password);
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL((u) => u.pathname === apply, { timeout: 30_000 });
    await expect(page.getByTestId("apply-flow")).toBeVisible();
  });

  test("the four steps, with PayPal and a permanent code, end under review", async ({ page }) => {
    const teacher = await createTeacher("Sasha");
    people.push(teacher);
    const invite = await makeInvite("Sasha Zz");
    invites.push(invite.id);
    const code = `ZZ-${tag()}`.toUpperCase().slice(0, 20);

    await signIn(page, teacher);
    await page.goto(`/ambassador/apply/${invite.token}`);
    const flow = page.getByTestId("apply-flow");

    // 1. Personal. Name and email arrive from their account.
    await expect(flow.getByLabel("First name")).toHaveValue(teacher.firstName);
    await flow.getByLabel("Mobile").fill("07700 900412");
    await flow.getByLabel("Date of birth").fill("1990-04-18");
    await flow.getByLabel("Address", { exact: true }).fill("42 Hartley Road");
    await flow.getByLabel("Town or city").fill("Leeds");
    await flow.getByLabel("Postcode").fill("LS6 2JT");
    await flow.getByRole("button", { name: "Continue" }).click();

    // 2. Social. At least one account is required.
    await flow.getByRole("button", { name: "Continue" }).click();
    await expect(flow.getByText("Add at least one account you post from.")).toBeVisible();
    await flow.getByLabel(/Instagram/).fill("@zzteaches");
    await flow.getByLabel(/how many followers/i).selectOption("5k_25k");
    await flow.getByRole("button", { name: "Continue" }).click();

    // 3. Payout: PayPal, and the code, which is permanent.
    await flow.getByRole("radio", { name: /PayPal/ }).click();
    await flow.getByLabel("PayPal email").fill(`pp-${tag()}@example.com`);
    await expect(flow.getByTestId("code-permanent")).toContainText("This code is permanent");
    await expect(flow.getByRole("button", { name: "MRSJONES" })).toBeVisible();
    await flow.getByLabel("The code you want").fill(code.toLowerCase());
    await expect(flow.getByLabel("The code you want")).toHaveValue(code);
    await expect(flow.getByTestId("code-free")).toBeVisible();
    await flow.getByRole("button", { name: "Continue to the agreement" }).click();

    // 4. Agreement: read to the end, three declarations, a typed signature.
    const sign = flow.getByRole("button", { name: /Sign and send for review/ });
    await expect(sign).toBeDisabled();
    await flow.getByTestId("contract").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll"));
    });
    for (const name of [/I have read the agreement/, /paid gross/, /disclose that I am paid/]) {
      await flow.getByRole("checkbox", { name }).click();
    }
    await flow.getByLabel("Type your full name to sign").fill(`${teacher.firstName} ${teacher.surname}`);
    await expect(sign).toBeEnabled();
    await sign.click();

    await expect(page.getByTestId("application-under-review")).toBeVisible();
    await expect(page.getByText("That is with us.")).toBeVisible();

    const { data: app } = await admin
      .from("ambassador_applications")
      .select("status, payout_method, paypal_email, sort_code, requested_code, signed_ip, invite_id")
      .eq("user_id", teacher.id)
      .single();
    expect(app).toMatchObject({ status: "pending", payout_method: "paypal", sort_code: null, requested_code: code });
    expect(app!.invite_id).toBe(invite.id);

    const { data: used } = await admin.from("ambassador_invites").select("used_at").eq("id", invite.id).single();
    expect(used!.used_at).not.toBeNull();

    // In the app, the account menu says where they stand.
    await page.goto("/dashboard");
    await openAccountMenu(page);
    const entry = page.getByRole("menuitem", { name: /Ambassador Programme/ });
    await expect(entry).toContainText("Under review");
    await entry.click();
    await expect(page.getByRole("main").getByTestId("application-under-review")).toBeVisible();
  });

  test("an admin reviews an application and declines it", async ({ page, browser }) => {
    const boss = await createAdmin("Bea");
    const applicant = await createTeacher("Theo");
    people.push(boss, applicant);
    const invite = await makeInvite("Theo Zz");
    invites.push(invite.id);
    const code = `ZZD${tag()}`.toUpperCase().slice(0, 20);
    await submitApplication(applicant, invite.token, code);

    await signIn(page, boss);
    await page.goto("/admin/ambassadors");
    const row = page.getByRole("row").filter({ hasText: `${applicant.firstName} ${applicant.surname}` });
    await expect(row.getByText(code)).toBeVisible();
    await row.getByRole("button", { name: "Review" }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("PayPal", { exact: true })).toBeVisible();
    await expect(drawer.getByText(code).first()).toBeVisible();
    await drawer.getByRole("button", { name: "Decline", exact: true }).click();
    await drawer.getByRole("textbox").fill("Keeping it small for now.");
    await drawer.getByRole("button", { name: "Decline application" }).click();
    await expect(page.getByText("Application declined.")).toBeVisible();

    const { data: app } = await admin
      .from("ambassador_applications")
      .select("status, decline_reason")
      .eq("user_id", applicant.id)
      .single();
    expect(app).toEqual({ status: "declined", decline_reason: "Keeping it small for now." });

    const ctx = await browser.newContext();
    const mine = await ctx.newPage();
    await signIn(mine, applicant);
    await mine.goto("/ambassador");
    await expect(mine.getByRole("main").getByTestId("application-declined")).toBeVisible();
    await ctx.close();
  });

  test("approving mints the code they asked for, starts the agreement and the free Pro", async ({
    page,
    browser,
  }) => {
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    test.skip(!key.startsWith("sk_test_"), "Creates coupons in Stripe; only against a test key.");

    const boss = await createAdmin("Cleo");
    const applicant = await createTeacher("Umar");
    people.push(boss, applicant);
    const invite = await makeInvite("Umar Zz");
    invites.push(invite.id);
    const code = `ZZA${tag()}`.toUpperCase().slice(0, 20);
    await submitApplication(applicant, invite.token, code);

    await signIn(page, boss);
    await page.goto("/admin/ambassadors");
    await page
      .getByRole("row")
      .filter({ hasText: `${applicant.firstName} ${applicant.surname}` })
      .getByRole("button", { name: "Review" })
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText(/50% off your first month|20% off your first month/)).toBeVisible();
    await drawer.getByRole("button", { name: "Approve and issue code" }).click();
    await expect(page.getByText(new RegExp(`is live with code ${code}`))).toBeVisible({ timeout: 30_000 });

    const { data: amb } = await admin
      .from("ambassadors")
      .select("id, status, user_id, agreement_ends_at, pro_until, ambassador_codes(code, promotion_code_id, yearly_coupon_id)")
      .eq("user_id", applicant.id)
      .single();
    ambassadors.push(amb!.id);
    const codes = amb!.ambassador_codes as unknown as {
      code: string;
      promotion_code_id: string;
      yearly_coupon_id: string | null;
    }[];
    expect(amb!.status).toBe("active");
    expect(codes[0].code).toBe(code);
    expect(codes[0].yearly_coupon_id).toBeTruthy();
    const months = (new Date(amb!.agreement_ends_at).getTime() - Date.now()) / (30.4 * 86_400_000);
    expect(months).toBeGreaterThan(11.5);
    expect(months).toBeLessThan(12.5);

    const { data: profile } = await admin.from("profiles").select("plan").eq("id", applicant.id).single();
    expect(profile!.plan).toBe("pro");

    // The yearly coupon is a twelfth of the monthly percentage.
    const stripe = new Stripe(key);
    const yearly = await stripe.coupons.retrieve(codes[0].yearly_coupon_id!);
    expect(yearly.percent_off).toBeCloseTo(20 / 12, 2);

    // The ambassador's own view.
    const ctx = await browser.newContext();
    const mine = await ctx.newPage();
    await signIn(mine, applicant);
    await mine.goto("/ambassador");
    await expect(mine.getByTestId("ambassador-code")).toHaveText(code);
    await ctx.close();

    // Leave nothing usable behind in the Stripe test account.
    await stripe.promotionCodes.update(codes[0].promotion_code_id, { active: false });
  });
});
