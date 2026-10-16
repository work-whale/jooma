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
 * Becoming an ambassador: one short link (jooma.ai/ambassador) for everyone.
 * The person opens it, signs in, applies in three steps (Social, Payout with
 * the details signup does not collect, Agreement), gets Standard free while we
 * review, and is approved or declined. Name, email and mobile come from their
 * account, so there is no Personal step and no tax section.
 *
 * Needs supabase/migrations/20261016000000_ambassador_open_link.sql on the
 * target database (no invite token, the review trial). The approval test
 * creates real coupons in Stripe and is skipped unless the key is a TEST key.
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** An application, as the apply route submits it (service role). */
async function submitApplication(teacher: TestTeacher, code: string): Promise<string> {
  const { data, error } = await admin.rpc("submit_ambassador_application", {
    p_user_id: teacher.id,
    payload: {
      first_name: teacher.firstName,
      last_name: teacher.surname,
      email: teacher.email,
      mobile: "+447700900412",
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
  const ambassadors: string[] = [];

  test.afterEach(async () => {
    for (const id of ambassadors.splice(0)) await admin.from("ambassadors").delete().eq("id", id);
    for (const p of people.splice(0)) {
      await admin.from("ambassador_applications").delete().eq("user_id", p.id);
      await deleteTeacher(p);
    }
  });

  test("the short link shows the programme signed out, and keeps its URL", async ({ page }) => {
    await page.goto("/ambassador");
    await expect(page).toHaveURL(/\/ambassador$/);
    await expect(page.getByTestId("ambassador-landing")).toBeVisible();
    await expect(page.getByText("Teach with Jooma.")).toBeVisible();
    await expect(page.getByTestId("invite-cta")).toHaveAttribute(
      "href",
      "/signup?next=%2Fambassador%2Fapply",
    );

    // An old single-use invite link still lands somewhere useful.
    await page.goto("/ambassador/invite/an-old-token-from-before");
    await expect(page).toHaveURL(/\/ambassador$/);
    await expect(page.getByTestId("ambassador-landing")).toBeVisible();
  });

  test("a signed out visitor to the application signs in and comes straight back", async ({ page }) => {
    const teacher = await createTeacher("Rowan");
    people.push(teacher);

    await page.goto("/ambassador/apply");
    await expect(page).toHaveURL(/\/login\?next=%2Fambassador%2Fapply$/);

    const submit = page.getByRole("button", { name: /^sign in$/i });
    await submit.waitFor({ state: "visible" });
    await page.locator("#email").fill(teacher.email);
    await expect(page.locator("#email")).toHaveValue(teacher.email);
    await page.locator("#password").fill(teacher.password);
    await expect(page.locator("#password")).toHaveValue(teacher.password);
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL((u) => u.pathname === "/ambassador/apply", { timeout: 30_000 });
    await expect(page.getByTestId("apply-flow")).toBeVisible();
  });

  test("three steps from the short link, a review trial, and Back says it is sent", async ({ page }) => {
    const teacher = await createTeacher("Sasha");
    people.push(teacher);
    // Signup stores the country, not the prefix. Once glued on as "GB 0893...",
    // which the form then refused as not a number.
    await admin.from("profiles").update({ dial_code: "GB", phone: "07700 900412" }).eq("id", teacher.id);
    const code = `ZZ-${tag()}`.toUpperCase().slice(0, 20);

    await signIn(page, teacher);
    // The way an applicant arrives: the short link, then its button.
    await page.goto("/ambassador");
    await expect(page.getByTestId("ambassador-landing")).toBeVisible();
    await page.getByTestId("invite-cta").click();
    await page.waitForURL((u) => u.pathname === "/ambassador/apply");
    const flow = page.getByTestId("apply-flow");

    // No Personal step: their details come from the account.
    await expect(flow.getByText("Social", { exact: true })).toBeVisible();
    await expect(flow.getByText("Personal", { exact: true })).toHaveCount(0);
    await expect(flow.getByLabel("First name")).toHaveCount(0);
    await expect(flow.getByTestId("applying-as")).toContainText(`${teacher.firstName} ${teacher.surname}`);
    await expect(flow.getByTestId("applying-as")).toContainText("+447700900412");

    // 1. Social. At least one account is required.
    await flow.getByRole("button", { name: "Continue" }).click();
    await expect(flow.getByText("Add at least one account you post from.")).toBeVisible();
    await flow.getByLabel(/Instagram/).fill("@zzteaches");
    await flow.getByLabel(/how many followers/i).selectOption("5k_25k");
    await flow.getByRole("button", { name: "Continue" }).click();

    // 2. Payout: PayPal, About you (what signup does not ask), the code. No
    // tax section, no UTR, and no mobile field since the account has one.
    await expect(flow.getByTestId("tax-status")).toHaveCount(0);
    await expect(flow.getByLabel(/UTR/)).toHaveCount(0);
    await expect(flow.getByLabel("Mobile")).toHaveCount(0);
    await flow.getByRole("radio", { name: /PayPal/ }).click();
    await flow.getByLabel("PayPal email").fill(`pp-${tag()}@example.com`);
    await flow.getByRole("button", { name: "Continue to the agreement" }).click();
    await expect(flow.getByText("Enter your date of birth.")).toBeVisible();
    await flow.getByLabel("Date of birth").fill("1990-04-18");
    await flow.getByLabel("Address", { exact: true }).fill("42 Hartley Road");
    await flow.getByLabel("Town or city").fill("Leeds");
    await flow.getByLabel("Postcode").fill("LS6 2JT");
    await expect(flow.getByTestId("code-permanent")).toContainText("This code is permanent");
    await flow.getByLabel("The code you want").fill(code.toLowerCase());
    await expect(flow.getByLabel("The code you want")).toHaveValue(code);
    await expect(flow.getByTestId("code-free")).toBeVisible();
    await flow.getByRole("button", { name: "Continue to the agreement" }).click();

    // 3. Agreement: read to the end, three declarations, a typed signature.
    await expect(flow.getByTestId("contract")).toContainText("There is no minimum");
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
    await expect(page.getByText("Leave it with us.")).toBeVisible();
    await expect(page.getByTestId("review-trial-note")).toContainText("Jooma Standard free until");

    const { data: app } = await admin
      .from("ambassador_applications")
      .select("status, first_name, email, mobile, payout_method, requested_code, invite_id, utr, tax_status, trial_granted_at")
      .eq("user_id", teacher.id)
      .single();
    expect(app).toMatchObject({
      status: "pending",
      first_name: teacher.firstName,
      email: teacher.email,
      mobile: "+447700900412",
      payout_method: "paypal",
      requested_code: code,
      invite_id: null,
      utr: null,
      tax_status: "self_assessment",
    });
    expect(app!.trial_granted_at).not.toBeNull();

    // Standard for three days, no card, no Stripe subscription.
    const { data: profile } = await admin
      .from("profiles")
      .select("plan, subscription_status, stripe_subscription_id, current_period_end")
      .eq("id", teacher.id)
      .single();
    expect(profile).toMatchObject({ plan: "standard", subscription_status: "trialing", stripe_subscription_id: null });
    const days = (new Date(profile!.current_period_end!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);

    // Back (the mouse's back button, in the report) used to reopen step one.
    await page.goBack();
    await expect(page.getByTestId("already-applied")).toBeVisible();
    await expect(page.getByText("You have already applied.")).toBeVisible();
    await expect(page.getByTestId("apply-flow")).toHaveCount(0);
    await page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 15_000 });

    // Opening the application again, fresh from the server, says the same.
    await page.goto("/ambassador/apply");
    await expect(page.getByTestId("already-applied")).toBeVisible();

    // The billing page says it is a free review trial, not a card trial.
    await page.goto("/profile?section=subscription");
    await expect(page.getByTestId("review-trial")).toContainText("while we review your ambassador application");

    // In the app, the account menu says where they stand.
    await page.goto("/dashboard");
    await openAccountMenu(page);
    const entry = page.getByRole("menuitem", { name: /Ambassador Programme/ });
    await expect(entry).toContainText("Under review");
    await entry.click();
    await expect(page.getByRole("main").getByTestId("application-under-review")).toBeVisible();
  });

  test("an account without a mobile is asked for one in About you", async ({ page }) => {
    const teacher = await createTeacher("Noor");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/ambassador/apply");
    const flow = page.getByTestId("apply-flow");
    await flow.getByLabel(/Instagram/).fill("@zznoor");
    await flow.getByLabel(/how many followers/i).selectOption("under_1k");
    await flow.getByRole("button", { name: "Continue" }).click();
    await expect(flow.getByLabel("Mobile")).toBeVisible();
    await flow.getByLabel("Mobile").fill("GB 0893 123456");
    await flow.getByRole("button", { name: "Continue to the agreement" }).click();
    await expect(flow.getByText(/Enter a mobile number/)).toBeVisible();
  });

  test("an admin reviews an application and declines it", async ({ page, browser }) => {
    const boss = await createAdmin("Bea");
    const applicant = await createTeacher("Theo");
    people.push(boss, applicant);
    const code = `ZZD${tag()}`.toUpperCase().slice(0, 20);
    await submitApplication(applicant, code);

    await signIn(page, boss);
    await page.goto("/admin/ambassadors");
    const row = page.getByRole("row").filter({ hasText: `${applicant.firstName} ${applicant.surname}` });
    await expect(row.getByText(code)).toBeVisible();
    await row.getByRole("button", { name: "Review" }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("PayPal", { exact: true })).toBeVisible();
    await expect(drawer.getByText(code).first()).toBeVisible();
    // Starts on 50% off; another amount is one change away.
    await expect(drawer.getByLabel("Discount")).toHaveValue("percent");
    await expect(drawer.getByLabel("Percent off")).toHaveValue("50");
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
    const code = `ZZA${tag()}`.toUpperCase().slice(0, 20);
    await submitApplication(applicant, code);

    await signIn(page, boss);
    await page.goto("/admin/ambassadors");
    await page
      .getByRole("row")
      .filter({ hasText: `${applicant.firstName} ${applicant.surname}` })
      .getByRole("button", { name: "Review" })
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText(/50% off your first month/)).toBeVisible();
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
    expect(yearly.percent_off).toBeCloseTo(50 / 12, 2);

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
