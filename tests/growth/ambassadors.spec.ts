import { test, expect } from "@playwright/test";
import {
  admin,
  createAdmin,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";
import { addMonths, periodLabel, periodOf } from "@/app/lib/ambassador-commission";

/*
 * The admin's ambassador programme page: live ambassadors, and under each one a
 * dropdown of the teachers they brought in with a payout toggle per MONTH.
 *
 * THE RULE THESE TESTS EXIST TO PROTECT
 *
 * Only a payment earns. Each commission row is one teacher's payment in one
 * month (written by the Stripe webhook); a month with nothing billed shows N/A
 * and offers no way to pay out. That includes a teacher who never paid, and a
 * teacher an admin COMPED onto Pro, whose plan reads 'pro' with no money ever
 * having moved.
 *
 * Needs supabase/migrations/20261014000000_ambassador_programme_v2.sql on the
 * target database. The security half (RLS, the RPC guards) is checked one
 * layer down in scripts/verify-ambassadors.mjs.
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

interface Fixture {
  ambassadorId: string;
  codeId: string;
  code: string;
  name: string;
}

const THIS_MONTH = periodOf(new Date());
const LAST_MONTH = addMonths(THIS_MONTH, -1);

/** A live ambassador, approved two months ago, with one code. */
async function createAmbassador(): Promise<Fixture> {
  const t = tag();
  const name = `ZZ Amb ${t}`;
  const code = `ZZAMB${t}`.toUpperCase();
  const approved = new Date(Date.now() - 60 * 86_400_000);

  const { data: ambassador, error } = await admin
    .from("ambassadors")
    .insert({
      full_name: name,
      email: `zz-${t}@example.com`,
      source: "instagram",
      approved_at: approved.toISOString(),
      agreement_ends_at: new Date(approved.getTime() + 365 * 86_400_000).toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`Could not create the ambassador: ${error.message}`);

  const { data: codeRow, error: codeError } = await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: ambassador.id, promotion_code_id: `promo_zz${t}`, code })
    .select()
    .single();
  if (codeError) throw new Error(`Could not create the code: ${codeError.message}`);

  return { ambassadorId: ambassador.id, codeId: codeRow.id, code, name };
}

async function seedReferral(fixture: Fixture, teacher: TestTeacher, paid = false): Promise<string> {
  const { data, error } = await admin
    .from("ambassador_referrals")
    .insert({
      ambassador_id: fixture.ambassadorId,
      code_id: fixture.codeId,
      user_id: teacher.id,
      ...(paid ? { first_paid_at: new Date().toISOString(), first_paid_plan: "pro" } : {}),
    })
    .select()
    .single();
  if (error) throw new Error(`Could not seed the referral: ${error.message}`);
  return data.id as string;
}

/** What the webhook writes when a referred teacher pays in `period`. */
async function seedCommission(
  fixture: Fixture,
  referralId: string,
  period: string,
  amountPence = 200,
): Promise<string> {
  const { data, error } = await admin
    .from("ambassador_commissions")
    .insert({
      ambassador_id: fixture.ambassadorId,
      referral_id: referralId,
      stripe_invoice_id: `in_zz${tag()}`,
      period,
      kind: "recurring",
      plan: "pro",
      billing_interval: "month",
      amount_pence: amountPence,
      invoice_amount_pence: 799,
    })
    .select()
    .single();
  if (error) throw new Error(`Could not seed the commission: ${error.message}`);
  return data.id as string;
}

async function deleteAmbassador(fixture: Fixture | null) {
  if (!fixture) return;
  // Codes, referrals and commission cascade from the ambassador.
  await admin.from("ambassadors").delete().eq("id", fixture.ambassadorId);
}

test.describe("Ambassador programme (admin)", () => {
  let adminUser: TestTeacher;
  let fixture: Fixture | null = null;
  const people: TestTeacher[] = [];

  test.beforeEach(async () => {
    adminUser = await createAdmin("Avery");
  });

  test.afterEach(async () => {
    await deleteAmbassador(fixture);
    fixture = null;
    for (const p of people.splice(0)) await deleteTeacher(p);
    await deleteTeacher(adminUser);
  });

  test("a teacher cannot reach the page at all", async ({ page }) => {
    const teacher = await createTeacher("Blake");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/admin/ambassadors");
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("the v4 layout: KPIs, invite maker with name and source only, review and live tables", async ({
    page,
  }) => {
    await signIn(page, adminUser);
    await page.goto("/admin/ambassadors");

    await expect(page.getByRole("heading", { name: "Ambassador programme" })).toBeVisible();
    await expect(page.getByTestId("programme-kpis")).toBeVisible();

    const box = page.getByTestId("invite-box");
    await expect(box.getByText("Their name")).toBeVisible();
    await expect(box.getByText("Where you found them")).toBeVisible();
    // Asked for: no email and no "Invited by" when onboarding.
    await expect(box.getByText(/email/i)).toHaveCount(0);
    await expect(box.getByText(/invited by/i)).toHaveCount(0);

    // Headings, since "Awaiting review" and "Active ambassadors" are KPI labels too.
    for (const name of [
      "Commission rates",
      "Awaiting review",
      "Active ambassadors",
      "Invite links issued",
      "What the programme costs",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
  });

  test("this month's teachers: billed is payable, unbilled is N/A with no control", async ({
    page,
  }) => {
    fixture = await createAmbassador();
    const unbilled = await createTeacher("Casey");
    const billed = await createTeacher("Devon");
    people.push(unbilled, billed);

    await seedReferral(fixture, unbilled);
    const billedRef = await seedReferral(fixture, billed, true);
    await seedCommission(fixture, billedRef, THIS_MONTH);

    await signIn(page, adminUser);
    await page.goto("/admin/ambassadors");
    await page.getByText(fixture.name).click();

    const panel = page.getByTestId("referrals-panel");
    await expect(panel.getByText(unbilled.email)).toBeVisible();
    await expect(panel.getByText(billed.email)).toBeVisible();

    // The expanded table is nested inside the ambassador's own row, so scope to
    // the LAST matching row (the teacher's), not the outer one containing it.
    const unbilledRow = panel.getByRole("row").filter({ hasText: unbilled.email }).last();
    await expect(unbilledRow.getByText("N/A")).toBeVisible();
    await expect(unbilledRow.getByRole("button")).toHaveCount(0);

    const billedRow = panel.getByRole("row").filter({ hasText: billed.email }).last();
    await expect(billedRow.getByText("Unpaid")).toBeVisible();
    await expect(billedRow.getByText("£2.00")).toBeVisible();
    await expect(billedRow.getByRole("button", { name: "Mark paid" })).toBeVisible();
  });

  test("a comped teacher is never payable", async ({ page }) => {
    fixture = await createAmbassador();
    const comped = await createTeacher("Ellis");
    people.push(comped);

    // Referred, then comped onto Pro by an admin: plan and status say a paying
    // subscriber, and no money ever moved, so the webhook wrote no commission.
    await seedReferral(fixture, comped);
    await admin
      .from("profiles")
      .update({ plan: "pro", subscription_status: "active", stripe_subscription_id: null })
      .eq("id", comped.id);

    await signIn(page, adminUser);
    await page.goto("/admin/ambassadors");
    await page.getByText(fixture.name).click();

    const row = page.getByTestId("referrals-panel").getByRole("row").filter({ hasText: comped.email }).last();
    await expect(row.getByText("Pro", { exact: true })).toBeVisible();
    await expect(row.getByText("N/A")).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  test("marking a month paid sticks, and only that month", async ({ page }) => {
    fixture = await createAmbassador();
    const subscriber = await createTeacher("Frankie");
    people.push(subscriber);
    const ref = await seedReferral(fixture, subscriber, true);
    const thisMonth = await seedCommission(fixture, ref, THIS_MONTH);
    const lastMonth = await seedCommission(fixture, ref, LAST_MONTH);

    await signIn(page, adminUser);
    await page.goto("/admin/ambassadors");
    await page.getByText(fixture.name).click();

    const row = () =>
      page.getByTestId("referrals-panel").getByRole("row").filter({ hasText: subscriber.email }).last();
    await row().getByRole("button", { name: "Mark paid" }).click();
    await expect(row().getByText(/^Paid/)).toBeVisible();

    const { data } = await admin
      .from("ambassador_commissions")
      .select("id, status, paid_at")
      .in("id", [thisMonth, lastMonth]);
    const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r]));
    expect(byId[thisMonth].status).toBe("paid");
    expect(byId[thisMonth].paid_at).not.toBeNull();
    // Last month's is a separate payout, still owed.
    expect(byId[lastMonth].status).toBe("unpaid");

    // Switch the dropdown to last month: still owed there.
    await page.getByTestId("referrals-panel").getByLabel("Month").selectOption(LAST_MONTH);
    await expect(row().getByText("Unpaid")).toBeVisible();

    // And it survives a reload.
    await page.reload();
    await page.getByText(fixture.name).click();
    await expect(row().getByText(/^Paid/)).toBeVisible();
  });

  test("a month with nothing billed for a teacher reads N/A once switched to", async ({ page }) => {
    fixture = await createAmbassador();
    const teacher = await createTeacher("Gray");
    people.push(teacher);
    const ref = await seedReferral(fixture, teacher, true);
    await seedCommission(fixture, ref, THIS_MONTH);

    await signIn(page, adminUser);
    await page.goto("/admin/ambassadors");
    await page.getByText(fixture.name).click();

    const panel = page.getByTestId("referrals-panel");
    await panel.getByLabel("Month").selectOption(LAST_MONTH);
    const row = panel.getByRole("row").filter({ hasText: teacher.email }).last();
    await expect(row.getByText("N/A")).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  test("mark all paid for the month settles every teacher in it", async ({ page }) => {
    fixture = await createAmbassador();
    const a = await createTeacher("Harper");
    const b = await createTeacher("Indigo");
    people.push(a, b);
    const refA = await seedReferral(fixture, a, true);
    const refB = await seedReferral(fixture, b, true);
    const c1 = await seedCommission(fixture, refA, THIS_MONTH, 200);
    const c2 = await seedCommission(fixture, refB, THIS_MONTH, 400);

    await signIn(page, adminUser);
    await page.goto("/admin/ambassadors");
    await page.getByText(fixture.name).click();

    const panel = page.getByTestId("referrals-panel");
    await expect(panel.getByText("Below £25.00, rolls forward")).toBeVisible();
    await panel
      .getByRole("button", { name: `Mark all paid for ${periodLabel(THIS_MONTH, false)}` })
      .click();
    await expect(panel.getByRole("row").filter({ hasText: a.email }).last().getByText(/^Paid/)).toBeVisible();

    const { data } = await admin.from("ambassador_commissions").select("status").in("id", [c1, c2]);
    expect((data ?? []).every((r) => r.status === "paid")).toBe(true);
  });

  test("the header row counts current subscribers and money in pounds", async ({ page }) => {
    fixture = await createAmbassador();
    const paying = await createTeacher("Jules");
    const free = await createTeacher("Kit");
    people.push(paying, free);

    const ref = await seedReferral(fixture, paying, true);
    await seedReferral(fixture, free);
    await admin
      .from("profiles")
      .update({ plan: "pro", subscription_status: "active", stripe_subscription_id: `sub_zz${tag()}` })
      .eq("id", paying.id);
    await seedCommission(fixture, ref, THIS_MONTH, 200);
    await seedCommission(fixture, ref, LAST_MONTH, 200);

    await signIn(page, adminUser);
    await page.goto("/admin/ambassadors");

    // Chevron, Ambassador, Code, Subscribers, This month, All time, Owed, Ends, Status.
    const cells = page.getByRole("row").filter({ hasText: fixture.name }).first().getByRole("cell");
    await expect(cells.nth(3)).toHaveText("1"); // only the one paying through Stripe
    await expect(cells.nth(4)).toHaveText("£2.00");
    await expect(cells.nth(5)).toHaveText("£4.00");
    await expect(cells.nth(6)).toHaveText("£4.00");
    await expect(cells.nth(8)).toContainText("Live");
  });
});
