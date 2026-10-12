import { test, expect, type Page } from "@playwright/test";
import { createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * The plan pill in the sidebar, above credits, and the button to /pricing.
 *
 * Every teacher sees which plan they are on and has one obvious way to move
 * between plans, on every screen. The wording of the pill and the button is
 * unit tested in tests/unit/plan-badge.spec.ts; this checks it is really on
 * the page, in the right place, and goes where it says.
 */

function planBlock(page: Page) {
  return page.locator("#app-sidenav-v2").getByTestId("sidebar-plan");
}

test.describe("Sidebar plan", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Sasha");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  for (const [plan, label, cta] of [
    ["standard", "Standard", "Upgrade"],
    ["pro", "Pro", "Upgrade"],
    ["max", "Max", "See plans"],
  ] as const) {
    test(`a ${label} teacher sees ${label}, and ${cta} goes to the plans`, async ({ page }) => {
      await setPlan(teacher, plan, "paying");
      await signIn(page, teacher);
      await page.goto("/dashboard");

      const block = planBlock(page);
      await expect(block.getByText("Your plan")).toBeVisible();
      await expect(block.getByText(label, { exact: true })).toBeVisible();

      // Above the credit meter, in the foot of the rail.
      const meter = page.locator("#app-sidenav-v2").getByText("Credits", { exact: true });
      const blockBox = await block.boundingBox();
      const meterBox = await meter.boundingBox();
      expect(blockBox && meterBox && blockBox.y < meterBox.y).toBe(true);

      await block.getByRole("link", { name: cta }).click();
      await expect(page).toHaveURL(/\/pricing$/);
      await expect(page.getByRole("button", { name: "Your plan" }).first()).toBeVisible();
    });
  }

  test("a teacher with no plan is asked to choose one", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");

    const block = planBlock(page);
    await expect(block.getByText("No plan", { exact: true })).toBeVisible();
    await expect(block.getByRole("link", { name: "Choose a plan" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  test("a non ambassador sees the plain wordmark and no Ambassador item", async ({ page }) => {
    await setPlan(teacher, "pro", "paying");
    await signIn(page, teacher);
    await page.goto("/dashboard");

    const nav = page.locator("#app-sidenav-v2");
    await expect(planBlock(page).getByText("Pro", { exact: true })).toBeVisible();
    await expect(nav.getByRole("img", { name: "Jooma", exact: true })).toBeVisible();
    await expect(nav.getByRole("img", { name: "Jooma Ambassador" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Ambassador", exact: true })).toHaveCount(0);
  });
});
