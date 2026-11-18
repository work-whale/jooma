import { test, expect } from "@playwright/test";
import {
  admin,
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Max plan: the surfaces a teacher sees.
 *
 * Covers the three things that were broken or missing when Max went back on
 * sale:
 *   1. A free teacher could not see Max anywhere in the app — the subscription
 *      section offered a link to /pricing, which sold only Pro.
 *   2. A Pro subscriber had no way to reach Max at all.
 *   3. The sidebar offered a top up at any balance, and the modal it
 *      opened navigated to a page whose top-up button only appears above 80%
 *      used — so anyone below that hit a dead end.
 *
 * Deliberately stops at the point money would change hands: these assert what
 * is offered and where the buttons lead, not Stripe's own checkout, which is
 * not ours to drive.
 */

test.describe("Max plan", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Morgan");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("a Free teacher is offered every paid plan, with its resources, Pro recommended", async ({ page }) => {
    // Jooma 4.5: a teacher with no subscription is on Free, and the plans page
    // is the picker: Standard, Pro and Max, monthly first, Pro preselected.
    await admin
      .from("profiles")
      .update({ plan: "free", subscription_status: null, stripe_subscription_id: null, current_period_end: null })
      .eq("id", teacher.id);
    await admin.rpc("resources_start", { p_uid: teacher.id, p_plan: "free" });
    await signIn(page, teacher);
    await page.goto("/pricing");

    // .first() throughout: the section renders behind a Suspense boundary keyed
    // on the tab, so mid-transition a resolving and a resolved copy can both be
    // in the DOM.
    await expect(page.getByText("Standard", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pro", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Max", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Recommended").first()).toBeVisible();

    await expect(page.getByText("£4.99").first()).toBeVisible();
    await expect(page.getByText("£7.99").first()).toBeVisible();
    await expect(page.getByText("£13.99").first()).toBeVisible();

    // The allowances are derived, never typed, and say resources.
    await expect(page.getByText("500 resources a month").first()).toBeVisible();
    await expect(page.getByText("1,000 resources a month").first()).toBeVisible();
    await expect(page.getByText("2,500 resources a month").first()).toBeVisible();
    await expect(page.getByText(/credits/i)).toHaveCount(0);
  });

  test("a Pro subscriber is offered Max, and told what the switch costs", async ({ page }) => {
    // A real subscription is what distinguishes "upgrade" from "checkout": the
    // page must offer the swap, not a second subscription.
    await admin
      .from("profiles")
      .update({
        plan: "pro",
        stripe_customer_id: `cus_e2e_${teacher.id.slice(0, 8)}`,
        stripe_subscription_id: `sub_e2e_${teacher.id.slice(0, 8)}`,
        subscription_status: "active",
      })
      .eq("id", teacher.id);

    await signIn(page, teacher);
    await page.goto("/pricing");

    // Their own card is marked as theirs. .first() throughout, for the same
    // Suspense reason as above.
    await expect(page.getByRole("button", { name: "Your plan" }).first()).toBeVisible();

    // Every plan move is now offered from its own card, in one consistent
    // shape: the card says where you would go, the panel below says what it
    // means. So this is "Switch to Max", not "Upgrade to Max Teacher".
    const upgrade = page.getByRole("button", { name: /^switch to max$/i }).first();
    await expect(upgrade).toBeVisible();

    // Confirming first is the point: this is the only button on the page that
    // charges a card with no further prompt.
    await upgrade.click();
    await expect(page.getByText(/switch to max teacher/i).first()).toBeVisible();
    await expect(page.getByText(/2,500/).first()).toBeVisible();
    await expect(
      page.getByText(/only be charged the difference/i).first(),
    ).toBeVisible();

    // A subscriber sees every plan card, but NOT the buy-from-scratch buttons:
    // those run Checkout, which would start a second subscription alongside the
    // one they have. The swap buttons take their place.
    await expect(page.getByRole("button", { name: /^Start (free|annual) trial$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Choose Max" })).toHaveCount(0);
  });

  test("a Max subscriber is offered Pro, and shown what they would lose", async ({ page }) => {
    await setPlan(teacher, "max", "paying");

    await signIn(page, teacher);
    await page.goto("/pricing");

    // The card carries the short name; the confirmation panel below uses the
    // full one, which is why this is anchored rather than a loose match.
    const downgrade = page.getByRole("button", { name: /^switch to pro$/i }).first();
    await expect(downgrade).toBeVisible();

    await downgrade.click();

    // The retention beat: what they give up, derived from PLANS[].limits rather
    // than written out, so it cannot claim a loss that is not real.
    await expect(page.getByText(/what you.d miss out on/i).first()).toBeVisible();
    // 2,500 down to 1,000 is 1,500 fewer.
    await expect(page.getByText(/1,500 fewer resources/i).first()).toBeVisible();

    // And the reassuring half: nothing is lost from the month already paid for.
    await expect(
      page.getByText(/keep max teacher until your next renewal/i).first(),
    ).toBeVisible();

    // The prominent button is the reversible one.
    await expect(
      page.getByRole("button", { name: /stay on max teacher/i }).first(),
    ).toBeVisible();
  });

  test("backing out of a downgrade changes nothing", async ({ page }) => {
    await setPlan(teacher, "max", "paying");

    await signIn(page, teacher);
    await page.goto("/pricing");

    await page.getByRole("button", { name: /^switch to pro$/i }).first().click();
    await expect(page.getByText(/what you.d miss out on/i).first()).toBeVisible();

    // "Stay on Max" must close the panel without calling the API — a retention
    // path that still downgraded would be worse than having none.
    let called = false;
    await page.route("**/api/stripe/downgrade", (route) => {
      called = true;
      return route.abort();
    });

    await page.getByRole("button", { name: /stay on max teacher/i }).first().click();

    await expect(page.getByText(/what you.d miss out on/i)).toHaveCount(0);
    expect(called).toBe(false);
  });

  test("a Pro subscriber can step down to Standard, or cancel", async ({ page }) => {
    await setPlan(teacher, "pro", "paying");

    await signIn(page, teacher);
    await page.goto("/pricing");

    // Standard is the paid plan below Pro now, and is offered as a swap.
    const toStandard = page.getByRole("button", { name: /^switch to standard$/i }).first();
    await expect(toStandard).toBeVisible();
    await toStandard.click();
    await expect(page.getByText(/what you.d miss out on/i).first()).toBeVisible();
    // Jooma 4.5 red note: Standard exports are clean too, so no watermark loss.
    await expect(page.getByText(/watermark/i)).toHaveCount(0);

    // Leaving is the Cancel link in Profile, into the cancel flow (P11 and the
    // rest are in cancel-flow.spec, which has a real Stripe subscription).
    await page.goto("/profile?section=subscription");
    await expect(page.getByRole("link", { name: /^cancel subscription$/i }).first()).toHaveAttribute(
      "href",
      "/profile/cancel",
    );
  });

  test("a subscription that is ending offers renewal, not a plan change", async ({ page }) => {
    await setPlan(teacher, "max", "ending");

    await signIn(page, teacher);
    await page.goto("/profile?section=subscription");

    // Renew comes first: swapping a plan that is scheduled to stop would charge
    // for something about to disappear.
    await expect(page.getByText(/set to end/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^cancel subscription$/i })).toHaveCount(0);

    // And the plans page offers no swap either.
    await page.goto("/pricing");
    await expect(page.getByRole("button", { name: "Your plan" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^switch to pro$/i })).toHaveCount(0);
  });

  test("a new Pro teacher sees a calm meter and no Top up", async ({ page }) => {
    await setPlan(teacher, "pro", "paying");
    await admin.rpc("resources_start", { p_uid: teacher.id, p_plan: "pro" });

    await signIn(page, teacher);
    await page.goto("/dashboard");

    const nav = page.locator("#app-sidenav-v2");
    await expect(nav.getByTestId("sidebar-resources")).toContainText("1,000 a month");
    // Nothing spent, so the button must be absent: offering more to someone
    // with a full allowance is a nag rather than an offer.
    await expect(nav.getByRole("button", { name: "Top up" })).toHaveCount(0);
  });
});
