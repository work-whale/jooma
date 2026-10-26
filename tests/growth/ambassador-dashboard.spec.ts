import { test, expect } from "@playwright/test";
import {
  admin,
  createAdmin,
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * The ambassador's side: twelve free months of Pro, the gold lockup and nav
 * item, and a page listing the teachers who joined with their code.
 *
 * Needs supabase/migrations/20261012000000_ambassador_pro.sql on the target
 * database (pro_until, my_ambassador, my_ambassador_referrals,
 * admin_link_ambassador_account).
 *
 * The privacy half is the part worth guarding: an ambassador sees their OWN
 * referrals only, and never who they are: the plan and the date, no name.
 * (Programme v2, 20261014000000_ambassador_programme_v2.sql, dropped the first
 * name and initial the v1 page showed.)
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

interface Fixture {
  ambassadorId: string;
  codeId: string;
  code: string;
}

/** An ambassador with one code, linked to `teacher`'s account by email. */
async function makeAmbassador(teacher: TestTeacher): Promise<Fixture> {
  const t = tag();
  const code = `ZZAMB${t}`.toUpperCase();
  const { data: ambassador, error } = await admin
    .from("ambassadors")
    .insert({ full_name: `${teacher.firstName} ${teacher.surname}`, email: teacher.email })
    .select()
    .single();
  if (error) throw new Error(`Could not create the ambassador: ${error.message}`);

  const { data: codeRow, error: codeError } = await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: ambassador.id, promotion_code_id: `promo_zz${t}`, code })
    .select()
    .single();
  if (codeError) throw new Error(`Could not create the code: ${codeError.message}`);

  return { ambassadorId: ambassador.id, codeId: codeRow.id, code };
}

async function refer(fixture: Fixture, teacher: TestTeacher, paid = false) {
  const { error } = await admin.from("ambassador_referrals").insert({
    ambassador_id: fixture.ambassadorId,
    code_id: fixture.codeId,
    user_id: teacher.id,
    ...(paid
      ? { first_paid_at: new Date().toISOString(), first_paid_plan: "pro", payout_status: "unpaid" }
      : {}),
  });
  if (error) throw new Error(`Could not seed the referral: ${error.message}`);
}

/** The grant, as the admin route writes it, for tests that are not about the route. */
async function grantDirectly(fixture: Fixture, teacher: TestTeacher, days: number) {
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  await admin
    .from("ambassadors")
    .update({ user_id: teacher.id, pro_until: until, pro_granted_at: new Date().toISOString() })
    .eq("id", fixture.ambassadorId);
  await setPlan(teacher, "pro", "comped");
  await admin.from("profiles").update({ current_period_end: until }).eq("id", teacher.id);
}

test.describe("Ambassador dashboard", () => {
  const people: TestTeacher[] = [];
  const fixtures: Fixture[] = [];

  test.afterEach(async () => {
    for (const f of fixtures.splice(0)) {
      await admin.from("ambassadors").delete().eq("id", f.ambassadorId);
    }
    for (const p of people.splice(0)) await deleteTeacher(p);
  });

  test("an admin grants 12 months of Pro, and the teacher's rail turns gold", async ({
    page,
    browser,
  }) => {
    const amb = await createTeacher("Imani");
    const boss = await createAdmin("Bea");
    people.push(amb, boss);
    const fixture = await makeAmbassador(amb);
    fixtures.push(fixture);

    // The grant, through the real route, as an admin.
    await signIn(page, boss);
    const res = await page.request.post("/api/admin/ambassadors/grant-pro", {
      data: { ambassadorId: fixture.ambassadorId, reason: "e2e" },
    });
    expect(res.ok(), await res.text()).toBe(true);

    const { data: profile } = await admin
      .from("profiles")
      .select("plan, stripe_subscription_id")
      .eq("id", amb.id)
      .single();
    expect(profile).toEqual({ plan: "pro", stripe_subscription_id: null });

    const { data: row } = await admin
      .from("ambassadors")
      .select("user_id, pro_until")
      .eq("id", fixture.ambassadorId)
      .single();
    expect(row!.user_id).toBe(amb.id);
    const months = (new Date(row!.pro_until).getTime() - Date.now()) / (30.4 * 86_400_000);
    expect(months).toBeGreaterThan(11.5);
    expect(months).toBeLessThan(12.5);

    // The ambassador's own view, in a separate browser context.
    const ctx = await browser.newContext();
    const mine = await ctx.newPage();
    await signIn(mine, amb);
    await mine.goto("/dashboard");

    const nav = mine.locator("#app-sidenav-v2");
    await expect(nav.getByRole("img", { name: "Jooma Ambassador" })).toBeVisible();
    await expect(nav.getByTestId("sidebar-plan").getByText("Ambassador · Pro")).toBeVisible();
    await expect(nav.getByTestId("sidebar-plan").getByText(/^Free until /)).toBeVisible();

    await nav.getByRole("link", { name: "Ambassador", exact: true }).click();
    await expect(mine).toHaveURL(/\/ambassador$/);
    await expect(mine.getByRole("heading", { name: new RegExp(`${amb.firstName}\.$`) })).toBeVisible();
    await expect(mine.getByText("Verified Jooma Ambassador")).toBeVisible();
    await expect(mine.getByTestId("ambassador-pro-status")).toContainText("free until");
    await expect(mine.getByText(fixture.code).first()).toBeVisible();
    await ctx.close();
  });

  test("a teacher paying through Stripe is refused, not silently comped", async ({ page }) => {
    const amb = await createTeacher("Jude");
    const boss = await createAdmin("Bo");
    people.push(amb, boss);
    const fixture = await makeAmbassador(amb);
    fixtures.push(fixture);

    // A subscription id Stripe has never heard of reads as unreadable, and
    // unreadable is refused just like live: the route never guesses.
    await setPlan(amb, "max", "paying");

    await signIn(page, boss);
    const res = await page.request.post("/api/admin/ambassadors/grant-pro", {
      data: { ambassadorId: fixture.ambassadorId, reason: "e2e" },
    });
    expect(res.ok()).toBe(false);

    const { data: profile } = await admin.from("profiles").select("plan").eq("id", amb.id).single();
    expect(profile!.plan).toBe("max");
  });

  test("the page lists only their own referrals, and never names them", async ({
    page,
  }) => {
    const amb = await createTeacher("Kofi");
    const other = await createTeacher("Lena");
    const joinedFree = await createTeacher("Mabel");
    const joinedPaid = await createTeacher("Nico");
    const notMine = await createTeacher("Orla");
    people.push(amb, other, joinedFree, joinedPaid, notMine);

    const mineFx = await makeAmbassador(amb);
    const otherFx = await makeAmbassador(other);
    fixtures.push(mineFx, otherFx);
    await grantDirectly(mineFx, amb, 200);

    await refer(mineFx, joinedFree);
    await refer(mineFx, joinedPaid, true);
    await refer(otherFx, notMine);

    await signIn(page, amb);
    await page.goto("/ambassador");

    const table = page.getByTestId("ambassador-referrals");
    await expect(table.getByRole("row")).toHaveCount(3); // header + two
    // The paid one has a first payment but no live subscription now.
    await expect(table.getByText("Stopped")).toBeVisible();
    await expect(table.getByText("Signed up")).toBeVisible();

    // No name at all, no email, and nobody else's referral.
    for (const t of [joinedFree, joinedPaid, notMine]) {
      await expect(page.getByText(t.firstName)).toHaveCount(0);
      await expect(table.getByText(t.surname)).toHaveCount(0);
      await expect(page.getByText(t.email)).toHaveCount(0);
    }
  });

  test("the RPCs return nothing to a teacher who is not an ambassador", async ({ page }) => {
    const plain = await createTeacher("Pip");
    people.push(plain);

    await signIn(page, plain);
    await page.goto("/ambassador");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("the last 30 days count down and offer to keep Pro", async ({ page }) => {
    const amb = await createTeacher("Quill");
    people.push(amb);
    const fixture = await makeAmbassador(amb);
    fixtures.push(fixture);
    await grantDirectly(fixture, amb, 10);

    await signIn(page, amb);
    await page.goto("/dashboard");

    const block = page.locator("#app-sidenav-v2").getByTestId("sidebar-plan");
    await expect(block.getByText(/^Free Pro ends in (9|10) days$/)).toBeVisible();
    await block.getByRole("link", { name: "Keep Pro" }).click();
    await expect(page).toHaveURL(/\/pricing$/);

    // On the plans page the free year is explained, and Pro stays buyable:
    // that is how they keep it, billed from the day the free year ends.
    await expect(page.getByTestId("ambassador-plan-banner")).toContainText("Pro is on us until");
    await expect(page.getByRole("button", { name: "Your plan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Start (free|annual) trial$/ })).toHaveCount(0);
  });
});
