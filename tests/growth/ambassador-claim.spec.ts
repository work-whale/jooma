import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * Claiming a code, from the teacher's side.
 *
 * THE CASE THIS FEATURE LIVES OR DIES ON is the delayed subscriber: somebody
 * takes a code, chooses Free, and subscribes days or weeks later. Attribution
 * has to survive that gap, because the whole reason for tracking free
 * redemptions is that they convert later.
 *
 * It does survive, and by construction rather than by luck: the claim is written
 * to our own database the moment it is entered, and checkout resolves it from
 * there rather than from a session, a cookie or a URL. Nothing has to be
 * remembered or retyped. These tests hold that behaviour in place.
 *
 * What is NOT asserted here is the Stripe discount itself. Driving Stripe's
 * hosted checkout from a test would be testing Stripe; what matters on our side
 * is that the referral is found and handed over, which is checked directly.
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

interface Fixture {
  ambassadorId: string;
  codeId: string;
  code: string;
  name: string;
}

async function createAmbassador(): Promise<Fixture> {
  const t = tag();
  const name = `ZZ Claim ${t}`;
  const code = `ZZCLAIM${t}`.toUpperCase();

  const { data: ambassador, error } = await admin
    .from("ambassadors")
    .insert({ full_name: name, email: `zz-claim-${t}@example.com` })
    .select()
    .single();
  if (error) throw new Error(`Could not create the ambassador: ${error.message}`);

  const { data: codeRow, error: codeError } = await admin
    .from("ambassador_codes")
    .insert({ ambassador_id: ambassador.id, promotion_code_id: `promo_zzc${t}`, code })
    .select()
    .single();
  if (codeError) throw new Error(`Could not create the code: ${codeError.message}`);

  return { ambassadorId: ambassador.id, codeId: codeRow.id, code, name };
}

/** The referral row for a teacher, or null. */
async function referralFor(teacher: TestTeacher) {
  const { data } = await admin
    .from("ambassador_referrals")
    .select("ambassador_id, first_paid_at, payout_status")
    .eq("user_id", teacher.id)
    .maybeSingle();
  return data;
}

test.describe("Claiming an ambassador code", () => {
  let fixture: Fixture | null = null;
  let second: Fixture | null = null;
  const people: TestTeacher[] = [];

  test.afterEach(async () => {
    for (const f of [fixture, second]) {
      if (f) await admin.from("ambassadors").delete().eq("id", f.ambassadorId);
    }
    fixture = null;
    second = null;
    for (const p of people.splice(0)) await deleteTeacher(p);
  });

  test("a teacher applies a code on the welcome screen", async ({ page }) => {
    fixture = await createAmbassador();
    const teacher = await createTeacher("Juno");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/welcome");

    // Collapsed by default, so the screen still opens on the tools for the
    // majority who have no code.
    await page.getByRole("button", { name: /got a code/i }).click();

    const input = page.getByLabel("Your code");
    await input.fill(fixture.code);
    // Fill then assert, so a hydration landing mid-type cannot swallow it.
    await expect(input).toHaveValue(fixture.code);

    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(new RegExp(`${fixture.code} applied`, "i"))).toBeVisible();

    // Leaving without a plan (there is no Free plan to pick any more, only
    // "Look around first") still records the referral: tracked, not payable.
    await page.getByRole("link", { name: "Look around first" }).click();
    await page.waitForURL(/\/tools/);

    const referral = await referralFor(teacher);
    expect(referral?.ambassador_id).toBe(fixture.ambassadorId);
    expect(referral?.first_paid_at).toBeNull();
    expect(referral?.payout_status).toBe("na");
  });

  test("a code in the signup link survives to the welcome screen", async ({ page }) => {
    fixture = await createAmbassador();
    const teacher = await createTeacher("Kai");
    people.push(teacher);

    // STEP 1, signed OUT, as a genuinely new teacher arrives: /signup?code=
    // stashes the code for the rest of the funnel. Signing in first would prove
    // nothing here, because proxy.ts bounces a signed-in visitor off /signup
    // before the page can mount.
    await page.goto(`/signup?code=${fixture.code}`);
    // Wait for the form to be interactive, which is proof the client component
    // has mounted and therefore that its stash effect has run.
    await expect(page.getByLabel("Email")).toBeVisible();

    // Polled, not read once: the stash is written by an effect, so a single
    // evaluate can land in the gap between the form painting and React
    // hydrating. expect.poll retries until it appears.
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("jooma:ambassador-code")))
      .toBe(fixture.code);

    // STEP 2: /complete-profile forwards that stash into the welcome URL, and
    // the panel arrives open and prefilled. It has to travel in the URL rather
    // than be read from sessionStorage on arrival: /welcome is server rendered,
    // so a value only the client can see is discarded during hydration and the
    // box would open empty.
    await signIn(page, teacher);
    await page.goto(`/welcome?code=${fixture.code}`);
    await expect(page.getByLabel("Your code")).toHaveValue(fixture.code);
  });

  test("an unknown code is refused and nothing is attributed", async ({ page }) => {
    const teacher = await createTeacher("Lior");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/welcome");
    await page.getByRole("button", { name: /got a code/i }).click();

    await page.getByLabel("Your code").fill(`NOSUCH${tag()}`.toUpperCase());
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(/not recognised/i)).toBeVisible();
    expect(await referralFor(teacher)).toBeNull();
  });

  test("a second code never moves attribution", async ({ page }) => {
    fixture = await createAmbassador();
    second = await createAmbassador();
    const teacher = await createTeacher("Manon");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/welcome");
    await page.getByRole("button", { name: /got a code/i }).click();

    await page.getByLabel("Your code").fill(fixture.code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(new RegExp(`${fixture.code} applied`, "i"))).toBeVisible();
    await page.getByRole("link", { name: "Look around first" }).click();
    await page.waitForURL(/\/tools/);

    expect((await referralFor(teacher))?.ambassador_id).toBe(fixture.ambassadorId);

    // The plans page does not even offer an input to somebody who already
    // holds a code: it names the one they have. That is the honest
    // presentation of a rule that cannot be worked around, rather than a box
    // that would only be refused.
    await page.goto("/pricing");

    // Scoped to main, and `.first()`. Arriving here by client-side navigation
    // can leave the outgoing Suspense frame in the DOM for a beat, so an
    // unscoped getByText briefly matches the same node twice and trips strict
    // mode. Waiting for the input to be gone first is the real signal that the
    // resolved section has landed.
    await expect(page.getByLabel("Promo code")).toHaveCount(0);
    await expect(page.getByRole("main").getByText("Code applied").first()).toBeVisible();
    await expect(page.getByRole("main").getByText(fixture.code).first()).toBeVisible();

    // Still the first ambassador. Attribution is first-code-wins and permanent.
    expect((await referralFor(teacher))?.ambassador_id).toBe(fixture.ambassadorId);

    // And the route still refuses a second code, whatever the UI offers.
    const refused = await page.evaluate(async (code) => {
      const res = await fetch("/api/ambassadors/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      return res.ok;
    }, second.code);
    expect(refused).toBe(false);
    expect((await referralFor(teacher))?.ambassador_id).toBe(fixture.ambassadorId);
  });

  test("THE DELAYED SUBSCRIBER: a claim taken on Free is still waiting at checkout", async ({
    page,
  }) => {
    fixture = await createAmbassador();
    const teacher = await createTeacher("Noor");
    people.push(teacher);

    // Day one: takes the code, looks around without choosing a plan.
    await signIn(page, teacher);
    await page.goto("/welcome");
    await page.getByRole("button", { name: /got a code/i }).click();
    await page.getByLabel("Your code").fill(fixture.code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(new RegExp(`${fixture.code} applied`, "i"))).toBeVisible();
    await page.getByRole("link", { name: "Look around first" }).click();
    await page.waitForURL(/\/tools/);

    // Some time later, in a completely fresh browser context: no sessionStorage,
    // no cookie carrying the code, nothing remembered. If attribution lived
    // anywhere but the database, it would be gone by now.
    await page.context().clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });

    await signIn(page, teacher);

    // The claim is still theirs, unspent, and still points at the ambassador.
    const referral = await referralFor(teacher);
    expect(referral?.ambassador_id).toBe(fixture.ambassadorId);
    expect(referral?.first_paid_at).toBeNull();

    // And their plans page says the code is waiting, weeks later, with
    // nothing retyped: checkout resolves it server-side from this row.
    await page.goto("/pricing");
    await expect(page.getByRole("main").getByText("Code applied").first()).toBeVisible();
    await expect(page.getByRole("main").getByText(fixture.code).first()).toBeVisible();
  });

  test("an existing teacher can claim a code from the plans page", async ({
    page,
  }) => {
    fixture = await createAmbassador();
    const teacher = await createTeacher("Nadia");
    people.push(teacher);

    // The case the move was for: somebody who signed up long ago, was handed a
    // code, and has to be able to redeem it from a page they actually visit.
    // The sidebar's plan button goes to /pricing from every screen.
    await signIn(page, teacher);
    await page.goto("/pricing");

    const input = page.getByLabel("Promo code");
    await input.fill(fixture.code);
    await expect(input).toHaveValue(fixture.code);
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(new RegExp(`${fixture.code} applied`, "i"))).toBeVisible();
    expect((await referralFor(teacher))?.ambassador_id).toBe(fixture.ambassadorId);
  });

  test("a spent code offers nothing, because there is nothing left to do", async ({
    page,
  }) => {
    fixture = await createAmbassador();
    const teacher = await createTeacher("Pia");
    people.push(teacher);

    // Referred, and already through their first paid month — the shape the
    // Stripe webhook leaves behind on invoice.paid.
    const { error } = await admin.from("ambassador_referrals").insert({
      ambassador_id: fixture.ambassadorId,
      code_id: fixture.codeId,
      user_id: teacher.id,
      first_paid_at: new Date().toISOString(),
      first_paid_plan: "pro",
      payout_status: "unpaid",
    });
    if (error) throw new Error(`Could not seed the referral: ${error.message}`);

    await signIn(page, teacher);
    await page.goto("/pricing");

    // Neither an input nor a "code applied" note: the offer is spent, and
    // telling them about a discount they have already had would be noise.
    await expect(page.getByLabel("Promo code")).toHaveCount(0);
    await expect(page.getByText("Code applied")).toHaveCount(0);
  });
});

/*
 * The /pricing page.
 *
 * /pricing was a redirect into Profile for a while, and is a real plans page
 * again. It is still Stripe's cancel_url, so a regression here would surface
 * as somebody landing on a broken page straight after backing out of a
 * payment. Old links carrying a billing tab still go to Profile.
 *
 * These run without an ambassador fixture: they are about the route.
 */
test.describe("The /pricing page", () => {
  const people: TestTeacher[] = [];

  test.afterEach(async () => {
    for (const p of people.splice(0)) await deleteTeacher(p);
  });

  test("a signed-in teacher sees every plan, here rather than in Profile", async ({ page }) => {
    const teacher = await createTeacher("Otis");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/pricing");

    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByText("Choose your plan").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(3);
    // Billing management is one link away, in Profile.
    await expect(page.getByRole("main").getByRole("link", { name: "Usage and billing" })).toBeVisible();
  });

  test("an abandoned checkout lands here and says nothing was charged", async ({ page }) => {
    const teacher = await createTeacher("Perry");
    people.push(teacher);

    await signIn(page, teacher);

    // THE CASE THAT MATTERS. cancel_url is `${origin}/pricing?checkout=cancelled`
    // (app/api/stripe/checkout/route.ts), so this is where a teacher lands the
    // moment they back out of paying us.
    await page.goto("/pricing?checkout=cancelled");

    await expect(page).toHaveURL(/\/pricing\?checkout=cancelled/);
    await expect(page.getByRole("status").getByText(/nothing was charged/i)).toBeVisible();
    // And the cards are right there to try again.
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(3);
  });

  test("an old link with a billing tab still reaches Profile, params intact", async ({ page }) => {
    const teacher = await createTeacher("Quinn");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/pricing?checkout=cancelled&tab=history");

    await expect(page).toHaveURL(/\/profile\?/);
    await expect(page).toHaveURL(/checkout=cancelled/);
    await expect(page).toHaveURL(/tab=history/);
    const url = new URL(page.url());
    expect(url.searchParams.getAll("section")).toEqual(["subscription"]);
  });

  test("Profile's subscription section links to the plans", async ({ page }) => {
    const teacher = await createTeacher("Rosa");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");
    await expect(page.getByRole("navigation", { name: /usage and billing/i })).toBeVisible();

    // The cards are no longer here; the link to them is.
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(0);
    await page.getByRole("main").getByRole("link", { name: "See plans" }).first().click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("a signed-out visitor goes to the landing page's pricing section", async ({
    page,
  }) => {
    // /profile would only bounce them to login, so the honest destination is
    // the pricing section the marketing nav and footer already link to.
    await page.goto("/pricing");

    await expect(page).toHaveURL(/\/(#pricing)?$/);
    await expect(page).not.toHaveURL(/\/login/);
  });
});

/*
 * A code should show what it does. The plans open on Monthly, where it takes
 * money off the first payment, and each card strikes the full price beside
 * the real first payment. Needs a REAL promotion code, so a coupon is made in
 * the Stripe test account and switched off afterwards.
 */
test.describe("A code's price on the plans", () => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const people: TestTeacher[] = [];
  let ambassadorId: string | null = null;
  let promotionCodeId: string | null = null;

  test.afterEach(async () => {
    if (promotionCodeId) await new Stripe(key).promotionCodes.update(promotionCodeId, { active: false });
    if (ambassadorId) await admin.from("ambassadors").delete().eq("id", ambassadorId);
    promotionCodeId = null;
    ambassadorId = null;
    for (const p of people.splice(0)) await deleteTeacher(p);
  });

  async function realCode(): Promise<string> {
    const stripe = new Stripe(key);
    const t = tag();
    const code = `ZZHALF${t}`.toUpperCase();
    const coupon = await stripe.coupons.create({ percent_off: 50, duration: "once", name: `e2e ${code}` });
    const promo = await stripe.promotionCodes.create({ promotion: { type: "coupon", coupon: coupon.id }, code });
    promotionCodeId = promo.id;
    const { data: amb, error } = await admin
      .from("ambassadors")
      .insert({ full_name: `ZZ Half ${t}`, email: `zz-half-${t}@example.com` })
      .select()
      .single();
    if (error) throw new Error(`Could not create the ambassador: ${error.message}`);
    ambassadorId = amb.id;
    const { error: codeError } = await admin
      .from("ambassador_codes")
      .insert({ ambassador_id: amb.id, promotion_code_id: promo.id, code });
    if (codeError) throw new Error(`Could not create the code: ${codeError.message}`);
    return code;
  }

  test("on /pricing: an orange box, then Monthly with the first month struck", async ({ page }) => {
    test.skip(!key.startsWith("sk_test_"), "Creates a coupon in Stripe; only against a test key.");
    const code = await realCode();
    const teacher = await createTeacher("Hana");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto("/pricing");
    // No code yet: Yearly first, as before.
    await expect(page.getByRole("radio", { name: /Yearly/ })).toBeChecked();

    const input = page.getByTestId("promo-code-input");
    await expect(input).toHaveCSS("border-top-color", "rgb(194, 85, 31)");
    await input.fill(code);
    await expect(input).toHaveValue(code);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(new RegExp(`${code} applied`, "i"))).toBeVisible();

    await expect(page.getByRole("radio", { name: /Monthly/ })).toBeChecked({ timeout: 15_000 });
    const main = page.getByRole("main");
    // Pro is £7.99; Stripe takes 50% off as £4.00, so £3.99 is charged.
    await expect(main.locator("s").filter({ hasText: "£7.99" })).toBeVisible();
    await expect(main.getByText("£3.99", { exact: true })).toBeVisible();
    await expect(main.getByText("3 days free, then £3.99 for your first month, then £7.99 a month")).toBeVisible();
    await expect(main.getByText("£2.49", { exact: true })).toBeVisible();
  });

  test("on /welcome: a code that arrived with them opens on Monthly, discounted", async ({ page }) => {
    test.skip(!key.startsWith("sk_test_"), "Creates a coupon in Stripe; only against a test key.");
    const code = await realCode();
    const teacher = await createTeacher("Ines");
    people.push(teacher);

    await signIn(page, teacher);
    await page.goto(`/welcome?code=${code}`);
    await expect(page.getByRole("radio", { name: /Monthly/ })).toBeChecked();
    const input = page.getByTestId("promo-code-input");
    await expect(input).toHaveCSS("border-top-color", "rgb(194, 85, 31)");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(new RegExp(`${code} applied`, "i"))).toBeVisible();
    await expect(page.locator("s").filter({ hasText: "£7.99" })).toBeVisible();
    await expect(page.getByText("3 days free, then £3.99 for your first month, then £7.99 a month")).toBeVisible();
  });
});
