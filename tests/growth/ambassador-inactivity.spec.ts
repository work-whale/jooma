import { test, expect } from "@playwright/test";
import { admin, createAdmin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Keeping your place: agreement v0.4, clauses 5 and 6.
 *
 * The cron moves a quiet v0.4 ambassador to Under review and leaves v0.3
 * signers alone; a new subscriber closes a review; an admin ends an expired
 * review, which takes the crown off, keeps the dashboard, moves free Pro to the
 * end of the month and leaves the agreement end date (and so commission) alone.
 *
 * Needs supabase/migrations/20261021000000_ambassador_inactivity.sql. Fixtures
 * are on @jooma.test, which the cron and the admin route never send to.
 */

const DAY = 86_400_000;
const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** An approved ambassador for `teacher`, 150 days in (at least three full months bar August), signed under `version`. */
async function makeAmbassador(teacher: TestTeacher, version: string) {
  const t = tag();
  const code = `ZZI${t}`.toUpperCase().slice(0, 20);
  const { data: applicationId, error } = await admin.rpc("submit_ambassador_application", {
    p_user_id: teacher.id,
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
      reach: "1k_5k",
      payout_method: "paypal",
      account_holder: `${teacher.firstName} ${teacher.surname}`,
      paypal_email: `pp-${t}@example.com`,
      tax_status: "self_assessment",
      requested_code: code,
      agreement_version: version,
      signature_name: `${teacher.firstName} ${teacher.surname}`,
      declarations: { read: true, tax: true, disclosure: true },
    },
  });
  if (error) throw new Error(`Could not submit: ${error.message}`);

  const ends = new Date(Date.now() + 215 * DAY).toISOString();
  const { data: amb, error: ambError } = await admin
    .from("ambassadors")
    .insert({
      full_name: `${teacher.firstName} ${teacher.surname}`,
      email: teacher.email,
      user_id: teacher.id,
      application_id: applicationId,
      approved_at: new Date(Date.now() - 150 * DAY).toISOString(),
      agreement_ends_at: ends,
      pro_until: ends,
      pro_granted_at: new Date(Date.now() - 150 * DAY).toISOString(),
    })
    .select()
    .single();
  if (ambError) throw new Error(`Could not create the ambassador: ${ambError.message}`);
  await admin
    .from("ambassador_applications")
    .update({ status: "approved", ambassador_id: amb!.id })
    .eq("id", applicationId);
  const { data: codeRow } = await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: amb!.id, promotion_code_id: `promo_zz${t}`, code })
    .select()
    .single();
  return { ambassadorId: amb!.id as string, codeId: codeRow!.id as string, agreementEndsAt: ends };
}

async function runCron(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/cron/ambassador-terms", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
}

async function row(id: string) {
  const { data } = await admin
    .from("ambassadors")
    .select("status, review_started_at, review_deadline, quiet_notice_sent_at, pro_until, agreement_ends_at, end_reason")
    .eq("id", id)
    .single();
  return data!;
}

test.describe("Ambassador inactivity (clauses 5 and 6)", () => {
  const people: TestTeacher[] = [];
  const ambassadors: string[] = [];

  test.afterEach(async () => {
    for (const id of ambassadors.splice(0)) await admin.from("ambassadors").delete().eq("id", id);
    for (const p of people.splice(0)) {
      await admin.from("ambassador_applications").delete().eq("user_id", p.id);
      await deleteTeacher(p);
    }
  });

  test("a quiet v0.4 ambassador goes under review, a v0.3 one does not, and a new subscriber closes it", async ({
    page,
    request,
  }) => {
    // Months, not days, drive the clock, so this cannot run in August.
    test.skip(new Date().getUTCMonth() === 7, "the clock stops in August");

    const quiet = await createTeacher("Quinn");
    const old = await createTeacher("Otto");
    const referred = await createTeacher("Rhea");
    people.push(quiet, old, referred);
    const q = await makeAmbassador(quiet, "0.4");
    const o = await makeAmbassador(old, "0.3");
    ambassadors.push(q.ambassadorId, o.ambassadorId);

    await runCron(request);

    const underReview = await row(q.ambassadorId);
    expect(underReview.review_started_at).not.toBeNull();
    expect(underReview.quiet_notice_sent_at).not.toBeNull();
    const days = (new Date(underReview.review_deadline!).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(13);
    expect((await row(o.ambassadorId)).review_started_at).toBeNull();

    await signIn(page, quiet);
    await page.goto("/ambassador");
    await expect(page.getByTestId("ambassador-under-review")).toBeVisible();

    // A first cleared payment on the code: the review closes, nothing changes.
    await admin.from("ambassador_referrals").insert({
      ambassador_id: q.ambassadorId,
      code_id: q.codeId,
      user_id: referred.id,
      first_paid_at: new Date().toISOString(),
      payout_status: "unpaid",
    });
    await runCron(request);
    const closed = await row(q.ambassadorId);
    expect(closed.review_started_at).toBeNull();
    expect(closed.status).toBe("active");
  });

  test("an admin ends an expired review: crown off, dashboard kept, Pro to month end, term kept", async ({
    page,
    browser,
  }) => {
    const boss = await createAdmin("Bea");
    const amb = await createTeacher("Ezra");
    people.push(boss, amb);
    const fx = await makeAmbassador(amb, "0.4");
    ambassadors.push(fx.ambassadorId);
    await admin
      .from("ambassadors")
      .update({
        review_started_at: new Date(Date.now() - 20 * DAY).toISOString(),
        review_deadline: new Date(Date.now() - 6 * DAY).toISOString(),
      })
      .eq("id", fx.ambassadorId);

    await signIn(page, boss);
    await page.goto("/admin/ambassadors");
    await page.getByText(`${amb.firstName} ${amb.surname}`).click();
    const panel = page.getByTestId("referrals-panel");
    await expect(panel.getByTestId("review-state")).toContainText("has passed");
    await panel.getByRole("button", { name: "End for inactivity" }).click();
    await panel.getByLabel("Reason for ending").fill("No new subscriber in the review.");
    await panel.getByRole("button", { name: "End agreement and send notice" }).click();
    await expect(panel.getByTestId("ended-inactivity")).toBeVisible();

    const ended = await row(fx.ambassadorId);
    expect(ended.status).toBe("ended");
    expect(ended.end_reason).toBe("No new subscriber in the review.");
    // Commission keeps running to the original end date.
    expect(new Date(ended.agreement_ends_at!).getTime()).toBe(new Date(fx.agreementEndsAt).getTime());
    // Free Pro ends within the next month, not at the end of the term.
    expect(new Date(ended.pro_until!).getTime()).toBeLessThanOrEqual(Date.now() + 32 * DAY);

    const ctx = await browser.newContext();
    const mine = await ctx.newPage();
    await signIn(mine, amb);
    await mine.goto("/ambassador");
    await expect(mine.getByTestId("ambassador-ended")).toBeVisible();
    await expect(mine.getByTestId("ambassador-ended-pill")).toBeVisible();
    await expect(mine.getByText("Verified Jooma Ambassador")).toHaveCount(0);
    await expect(mine.getByTestId("ambassador-code")).toHaveCount(0);
    await ctx.close();
  });
});
