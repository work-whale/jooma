import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * Top ups, Jooma 4.5.
 *
 * The packs come from plan-config (500 for £2.49, 1,500 for £5.99, 4,000 for
 * £12.99), in resources, and never expire. They are sold to Standard, Pro and
 * Max only. The button appears only once the meter is low (15% or less left):
 * selling more to someone with most of the month left is a nag.
 *
 * What the server does with a pack (the 403 on Free, an unknown id refused, a
 * real Checkout for a config pack) is in v45-plans.spec; the grant itself is
 * unit tested in topups-v45. This covers the screen: the button, the list, the
 * default, and that Continue sends the chosen pack's id.
 */

const RESOURCE_GBP = 0.0015;

/** A paying teacher on `plan` with `left` resources of this month's allowance. */
async function payingWith(t: TestTeacher, plan: "standard" | "pro", allowance: number, left: number) {
  await setPlan(t, plan, "paying");
  // setPlan invents a Stripe customer id; checkout is mocked here anyway.
  await admin.from("profiles").update({ stripe_customer_id: null }).eq("id", t.id);
  const start = await admin.rpc("resources_start", { p_uid: t.id, p_plan: plan });
  if (start.error) throw start.error;
  const spend = allowance - left;
  if (spend > 0) {
    const { data: fx } = await admin.rpc("fx_usd_to_gbp");
    const ins = await admin.from("token_usage").insert({
      user_id: t.id,
      tool_slug: "worksheet-generator",
      model: "e2e",
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: (spend * RESOURCE_GBP) / Number(fx ?? 0.79),
    });
    if (ins.error) throw ins.error;
  }
}

test.describe("Top ups", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Robin");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("a Pro teacher running low sees Top up, and the three packs from the plan config", async ({ page }) => {
    await payingWith(teacher, "pro", 1000, 100);
    await signIn(page, teacher);
    await page.goto("/dashboard");

    const nav = page.locator("#app-sidenav-v2");
    await nav.getByRole("button", { name: "Top up" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const options = dialog.getByRole("radio");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toContainText("500 resources");
    await expect(options.nth(0)).toContainText("£2.49");
    await expect(options.nth(1)).toContainText("1,500 resources");
    await expect(options.nth(1)).toContainText("£5.99");
    await expect(options.nth(2)).toContainText("4,000 resources");
    await expect(options.nth(2)).toContainText("£12.99");
    // The smallest is chosen by default, so Continue works straight away.
    await expect(options.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByText("Worth knowing")).toBeVisible();
  });

  test("Continue sends the chosen pack's id, never a price", async ({ page }) => {
    await payingWith(teacher, "pro", 1000, 100);
    await signIn(page, teacher);
    let sent: unknown = null;
    await page.route("**/api/stripe/topup", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { url: "/profile?section=subscription&topup=cancelled" } });
    });

    await page.goto("/dashboard");
    await page.locator("#app-sidenav-v2").getByRole("button", { name: "Top up" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio").nth(1).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect.poll(() => sent).toEqual({ packId: "pack-1500" });
  });

  test("with most of the month left, there is no Top up button", async ({ page }) => {
    await payingWith(teacher, "standard", 500, 400);
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const nav = page.locator("#app-sidenav-v2");
    await expect(nav.getByTestId("sidebar-resources")).toBeVisible();
    await expect(nav.getByRole("button", { name: "Top up" })).toHaveCount(0);
  });
});
