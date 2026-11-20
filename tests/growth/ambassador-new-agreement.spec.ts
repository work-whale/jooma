import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Accepting agreement 0.5 in place of an older one (20 November 2026).
 *
 * An ambassador on an older version sees a banner on every tab and an Accept
 * panel on My agreement. Accepting records a second dated signature and the
 * prompt goes away. Someone already on 0.5 never sees it. Someone on 0.3 is
 * told that clause 5 starts from the day they accept.
 *
 * Needs supabase/migrations/20261120000200_ambassador_agreement_acceptances.sql.
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** A live, approved ambassador who signed `version`. */
async function makeAmbassador(teacher: TestTeacher, version: string, opts: { approve?: boolean } = {}) {
  const t = tag();
  const code = `ZZN${t}`.toUpperCase().slice(0, 20);
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
  if (opts.approve === false) return { ambassadorId: null, applicationId: applicationId as string };

  const { data: amb, error: ambError } = await admin
    .from("ambassadors")
    .insert({
      full_name: `${teacher.firstName} ${teacher.surname}`,
      email: teacher.email,
      user_id: teacher.id,
      application_id: applicationId,
      approved_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      agreement_ends_at: new Date(Date.now() + 300 * 86_400_000).toISOString(),
    })
    .select()
    .single();
  if (ambError) throw new Error(`Could not make the ambassador: ${ambError.message}`);
  await admin.from("ambassador_applications").update({ status: "approved", ambassador_id: amb!.id }).eq("id", applicationId);
  await admin.from("ambassador_codes").insert({ ambassador_id: amb!.id, promotion_code_id: `promo_zz${t}`, code });
  return { ambassadorId: amb!.id as string, applicationId: applicationId as string };
}

const main = (page: Page) => page.getByRole("main");
const banner = (page: Page) => main(page).getByTestId("new-agreement-banner");

test.describe("Accepting the new ambassador agreement", () => {
  const people: TestTeacher[] = [];
  const ambassadors: string[] = [];

  test.afterEach(async () => {
    for (const id of ambassadors.splice(0)) await admin.from("ambassadors").delete().eq("id", id);
    for (const p of people.splice(0)) {
      await admin.from("ambassador_applications").delete().eq("user_id", p.id);
      await deleteTeacher(p);
    }
  });

  test("an ambassador on 0.4 is prompted, accepts, and the prompt goes away", async ({ page }) => {
    const amb = await createTeacher("Nadia");
    people.push(amb);
    const fx = await makeAmbassador(amb, "0.4");
    ambassadors.push(fx.ambassadorId!);

    await signIn(page, amb);
    await page.goto("/ambassador");
    await expect(banner(page)).toContainText("version 0.5");
    await expect(banner(page)).toContainText("You are on version 0.4 until you accept");
    await banner(page).getByRole("link", { name: "Read what changed and accept" }).click();

    await expect(page).toHaveURL(/\/ambassador\/agreement/);
    const panel = main(page).getByTestId("accept-agreement");
    await expect(panel).toContainText("version 0.4 stays in force");
    await expect(panel).toContainText("17204207");
    // 0.4 already had clause 5, so there is nothing extra to warn about.
    await expect(main(page).getByTestId("clause-five-note")).toHaveCount(0);

    const button = panel.getByRole("button", { name: "Accept version 0.5" });
    await expect(button).toBeDisabled();
    await panel.getByLabel("Type your full name to accept version 0.5").fill(`${amb.firstName} ${amb.surname}`);
    await button.click();

    await expect(main(page).getByTestId("accept-agreement")).toHaveCount(0);
    await expect(main(page).getByTestId("accepted-note")).toContainText("You accepted version 0.5");
    await expect(main(page).getByTestId("accepted-note")).toContainText("first signature, on version 0.4, is kept");
    await expect(banner(page)).toHaveCount(0);

    const { data: rows } = await admin
      .from("ambassador_agreement_acceptances")
      .select("version, signature_name, signed_ip")
      .eq("application_id", fx.applicationId);
    expect(rows).toHaveLength(1);
    expect(rows![0].version).toBe("0.5");
    expect(rows![0].signature_name).toBe(`${amb.firstName} ${amb.surname}`);

    // The original signature is untouched.
    const { data: app } = await admin.from("ambassador_applications").select("agreement_version").eq("id", fx.applicationId).single();
    expect(app!.agreement_version).toBe("0.4");

    await page.goto("/ambassador/earnings");
    await expect(main(page).getByTestId("ambassador-dashboard")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("an ambassador on 0.3 is told clause 5 starts the day they accept", async ({ page }) => {
    const amb = await createTeacher("Otto");
    people.push(amb);
    const fx = await makeAmbassador(amb, "0.3");
    ambassadors.push(fx.ambassadorId!);

    await signIn(page, amb);
    await page.goto("/ambassador/agreement");
    await expect(banner(page)).toContainText("You are on version 0.3");
    await expect(main(page).getByTestId("clause-five-note")).toContainText("applies to you from the day you accept");
  });

  test("an ambassador already on 0.5 is never prompted", async ({ page }) => {
    const amb = await createTeacher("Pia");
    people.push(amb);
    const fx = await makeAmbassador(amb, "0.5");
    ambassadors.push(fx.ambassadorId!);

    await signIn(page, amb);
    await page.goto("/ambassador/agreement");
    await expect(main(page).getByTestId("signed-agreement")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await expect(main(page).getByTestId("accept-agreement")).toHaveCount(0);
  });

  test("the route refuses someone who is not offered it: an ended agreement cannot accept 0.5", async ({ page }) => {
    const amb = await createTeacher("Rhea");
    people.push(amb);
    const fx = await makeAmbassador(amb, "0.4");
    ambassadors.push(fx.ambassadorId!);
    await admin
      .from("ambassadors")
      .update({ agreement_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq("id", fx.ambassadorId!);

    await signIn(page, amb);
    const res = await page.request.post("/api/ambassadors/accept-agreement", {
      data: { version: "0.5", signature_name: `${amb.firstName} ${amb.surname}` },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("There is no new agreement for you to accept.");

    const { data: rows } = await admin
      .from("ambassador_agreement_acceptances")
      .select("id")
      .eq("application_id", fx.applicationId);
    expect(rows).toHaveLength(0);
  });

  test("an applicant still waiting, on 0.4, sees the prompt on their status page", async ({ page }) => {
    const amb = await createTeacher("Quin");
    people.push(amb);
    await makeAmbassador(amb, "0.4", { approve: false });

    await signIn(page, amb);
    await page.goto("/ambassador");
    await expect(banner(page)).toContainText("You are on version 0.4");
  });
});
