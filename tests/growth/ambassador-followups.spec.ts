import { createHash, randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  admin,
  createAdmin,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";
import { lastCompletedTaxYear, taxYearBounds } from "@/app/lib/ambassador-commission";

/*
 * Ambassador follow-ups: channel verification, the gold trim on Today, the
 * month-before-the-end reminder and the yearly tax summary.
 *
 * Needs supabase/migrations/20261014000200_ambassador_followups.sql.
 *
 * The two emails are checked through what the cron RECORDS (the reminder stamp
 * and the summary row), not a mailbox. The fixtures live on @jooma.test, which
 * the cron never sends to, so a run bounces nothing off SendGrid.
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** A live, approved ambassador for `teacher`, with an application on file. */
async function makeAmbassador(
  teacher: TestTeacher,
  opts: { endsInDays?: number } = {},
): Promise<{ ambassadorId: string; applicationId: string; referralCodeId: string; code: string }> {
  const t = tag();
  const code = `ZZF${t}`.toUpperCase().slice(0, 20);
  const token = randomBytes(16).toString("hex");
  const { data: invite } = await admin
    .from("ambassador_invites")
    .insert({
      full_name: teacher.firstName,
      source: "instagram",
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select()
    .single();

  const { data: applicationId, error } = await admin.rpc("submit_ambassador_application", {
    p_user_id: teacher.id,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    payload: {
      first_name: teacher.firstName,
      last_name: teacher.surname,
      email: teacher.email,
      mobile: "07700 900412",
      date_of_birth: "1990-04-18",
      address_line: "1 Test Road",
      town: "Leeds",
      postcode: "LS1 1AA",
      instagram: `zzig${t}`,
      tiktok: `zztt${t}`,
      reach: "1k_5k",
      payout_method: "paypal",
      account_holder: `${teacher.firstName} ${teacher.surname}`,
      paypal_email: `pp-${t}@example.com`,
      tax_status: "self_assessment",
      requested_code: code,
      agreement_version: "e2e",
      signature_name: `${teacher.firstName} ${teacher.surname}`,
      declarations: { read: true, tax: true, disclosure: true },
    },
  });
  if (error) throw new Error(`Could not submit: ${error.message}`);

  const approved = new Date(Date.now() - 300 * 86_400_000);
  const ends = new Date(Date.now() + (opts.endsInDays ?? 200) * 86_400_000);
  const { data: amb } = await admin
    .from("ambassadors")
    .insert({
      full_name: `${teacher.firstName} ${teacher.surname}`,
      email: teacher.email,
      user_id: teacher.id,
      application_id: applicationId,
      approved_at: approved.toISOString(),
      agreement_ends_at: ends.toISOString(),
    })
    .select()
    .single();
  await admin
    .from("ambassador_applications")
    .update({ status: "approved", ambassador_id: amb!.id })
    .eq("id", applicationId);
  await admin.from("ambassador_invites").delete().eq("id", invite!.id);
  const { data: codeRow } = await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: amb!.id, promotion_code_id: `promo_zz${t}`, code })
    .select()
    .single();

  return { ambassadorId: amb!.id, applicationId: applicationId as string, referralCodeId: codeRow!.id, code };
}

test.describe("Ambassador follow-ups", () => {
  const people: TestTeacher[] = [];
  const ambassadors: string[] = [];

  test.afterEach(async () => {
    for (const id of ambassadors.splice(0)) await admin.from("ambassadors").delete().eq("id", id);
    for (const p of people.splice(0)) {
      await admin.from("ambassador_applications").delete().eq("user_id", p.id);
      await deleteTeacher(p);
    }
  });

  test("an admin verifies a channel, the ambassador sees it, and a new handle resets it", async ({
    page,
    browser,
  }) => {
    const boss = await createAdmin("Vera");
    const amb = await createTeacher("Wren");
    people.push(boss, amb);
    const fx = await makeAmbassador(amb);
    ambassadors.push(fx.ambassadorId);

    await signIn(page, boss);
    await page.goto("/admin/ambassadors");
    await page.getByText(`${amb.firstName} ${amb.surname}`).click();
    await page.getByRole("button", { name: "Payout and channels" }).click();

    const checks = page.getByTestId("referrals-panel").getByTestId("channel-checks");
    // The admin kit's Row is a <div> of <dt>/<dd>, not a table row: find the
    // label, then its row.
    const instagram = checks.getByText("Instagram", { exact: true }).locator("..");
    await expect(instagram.getByText("Unverified")).toBeVisible();
    await instagram.getByRole("button", { name: "Verify" }).click();
    await expect(instagram.getByText("Verified", { exact: true })).toBeVisible();

    const { data: app } = await admin
      .from("ambassador_applications")
      .select("verified_channels")
      .eq("id", fx.applicationId)
      .single();
    expect(app!.verified_channels).toEqual(["instagram"]);

    // The ambassador's own Payout details tab.
    const ctx = await browser.newContext();
    const mine = await ctx.newPage();
    await signIn(mine, amb);
    await mine.goto("/ambassador/payout");
    await expect(mine.getByRole("main").getByTestId("channel-instagram")).toContainText("Verified");
    await expect(mine.getByRole("main").getByTestId("channel-tiktok")).toContainText("Unverified");

    // Changing the handle sends it back to unverified.
    const res = await mine.request.patch("/api/ambassadors/details", {
      data: {
        section: "channels",
        values: { instagram: "a-new-handle", tiktok: "", x_handle: "", facebook: "", youtube: "", linkedin: "", reach: "1k_5k", note: "" },
      },
    });
    expect(res.ok(), await res.text()).toBe(true);
    const { data: after } = await admin
      .from("ambassador_applications")
      .select("verified_channels")
      .eq("id", fx.applicationId)
      .single();
    expect(after!.verified_channels).toEqual([]);
    await ctx.close();
  });

  test("a teacher cannot verify a channel through the API", async ({ page }) => {
    const amb = await createTeacher("Xan");
    people.push(amb);
    const fx = await makeAmbassador(amb);
    ambassadors.push(fx.ambassadorId);

    await signIn(page, amb);
    const res = await page.request.patch("/api/admin/ambassadors", {
      data: { applicationId: fx.applicationId, channel: "instagram", verified: true },
    });
    expect(res.ok()).toBe(false);
  });

  test("an ambassador's Today has the gold trim; an ordinary teacher's does not", async ({ page, browser }) => {
    const amb = await createTeacher("Yara");
    const plain = await createTeacher("Zed");
    people.push(amb, plain);
    const fx = await makeAmbassador(amb);
    ambassadors.push(fx.ambassadorId);

    await signIn(page, amb);
    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByTestId("today-ambassador-strip")).toContainText("Verified Jooma Ambassador");

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await signIn(other, plain);
    await other.goto("/dashboard");
    await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(other.getByTestId("today-ambassador-strip")).toHaveCount(0);
    await ctx.close();
  });

  test("the cron sends the end reminder once, a month out, and records last year's tax summary", async ({
    request,
  }) => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET is not set in .env.local");

    const ending = await createTeacher("Ada");
    const later = await createTeacher("Bram");
    const earner = await createTeacher("Cass");
    people.push(ending, later, earner);
    const endingFx = await makeAmbassador(ending, { endsInDays: 20 });
    const laterFx = await makeAmbassador(later, { endsInDays: 90 });
    const earnerFx = await makeAmbassador(earner);
    ambassadors.push(endingFx.ambassadorId, laterFx.ambassadorId, earnerFx.ambassadorId);

    // Two payouts in the tax year that has just ended, one in this one.
    const taxYear = lastCompletedTaxYear(new Date());
    const { from } = taxYearBounds(taxYear);
    const inYear = new Date(from.getTime() + 40 * 86_400_000).toISOString();
    for (const [paidAt, pence] of [
      [inYear, 2400],
      [inYear, 200],
      [new Date().toISOString(), 999],
    ] as const) {
      const { error } = await admin.from("ambassador_commissions").insert({
        ambassador_id: earnerFx.ambassadorId,
        stripe_invoice_id: `in_zz${tag()}`,
        period: paidAt.slice(0, 8) + "01",
        kind: "recurring",
        plan: "pro",
        billing_interval: "month",
        amount_pence: pence,
        status: "paid",
        paid_at: paidAt,
      });
      if (error) throw new Error(error.message);
    }

    const call = () =>
      request.get("/api/cron/ambassador-terms", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
    const res = await call();
    expect(res.ok(), await res.text()).toBe(true);

    const { data: stamps } = await admin
      .from("ambassadors")
      .select("id, end_reminder_sent_at")
      .in("id", [endingFx.ambassadorId, laterFx.ambassadorId]);
    const byId = Object.fromEntries((stamps ?? []).map((s) => [s.id, s.end_reminder_sent_at]));
    expect(byId[endingFx.ambassadorId]).not.toBeNull(); // ends in 20 days: reminded
    expect(byId[laterFx.ambassadorId]).toBeNull(); // ends in 90: not yet

    const { data: summary } = await admin
      .from("ambassador_tax_summaries")
      .select("tax_year, paid_pence, payments")
      .eq("ambassador_id", earnerFx.ambassadorId);
    expect(summary).toEqual([{ tax_year: taxYear, paid_pence: 2600, payments: 2 }]);

    // A second run changes nothing: once each.
    const firstStamp = byId[endingFx.ambassadorId];
    expect((await call()).ok()).toBe(true);
    const { data: again } = await admin
      .from("ambassadors")
      .select("end_reminder_sent_at")
      .eq("id", endingFx.ambassadorId)
      .single();
    expect(again!.end_reminder_sent_at).toBe(firstStamp);
    const { count } = await admin
      .from("ambassador_tax_summaries")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_id", earnerFx.ambassadorId);
    expect(count).toBe(1);
  });
});
