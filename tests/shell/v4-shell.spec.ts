import { test, expect } from "@playwright/test";
import { createTeacher, deleteTeacher, seedResource, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * The v4 chrome (docs/Jooma version 4.5/15-jooma-dashboard-v4.html).
 *
 * What is asserted is what a teacher sees and keeps: the dark sidebar, the
 * collapse that is remembered, the search that finds their own work as well as
 * tools, and the colour rule that no tool tile is purple or orange.
 */

test.describe("v4 shell", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Vera");
    await setPlan(teacher, "pro", "paying");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("the sidebar is dark chrome, and the active item is a lift, not purple", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const nav = page.locator("#app-sidenav-v2");
    await expect(nav).toHaveCSS("background-color", "rgb(30, 17, 56)");
    const today = nav.getByRole("link", { name: /^today$/i });
    await expect(today).toHaveAttribute("aria-current", "page");
    await expect(today).not.toHaveCSS("background-color", "rgb(91, 46, 214)");
  });

  test("collapsing the sidebar keeps the labels for screen readers and is remembered", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const nav = page.locator("#app-sidenav-v2");
    const before = (await nav.boundingBox())!.width;

    await nav.getByRole("button", { name: "Collapse the sidebar" }).click();
    await expect(nav).toHaveAttribute("data-collapsed", "true");
    await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(before / 2);
    // Still named, so a screen reader and getByRole both find it.
    await expect(nav.getByRole("link", { name: /^library/i })).toBeVisible();
    // The meters and plan block give way on the rail.
    await expect(nav.getByTestId("sidebar-resources")).toBeHidden();

    await page.reload();
    await expect(nav).toHaveAttribute("data-collapsed", "true");

    await nav.getByRole("button", { name: "Expand the sidebar" }).click();
    await expect(nav).not.toHaveAttribute("data-collapsed", "true");
    await expect(nav.getByTestId("sidebar-resources")).toBeVisible();
  });

  test("a phone never shows the collapsed rail, even when it was left collapsed", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    await page.evaluate(() => window.localStorage.setItem("jooma.sidebar.collapsed", "1"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.locator("#app-sidenav-v2");
    await expect(nav.getByTestId("sidebar-resources")).toBeVisible();
    await expect(nav.getByRole("button", { name: /collapse|expand/i })).toBeHidden();
  });

  test("the top bar search finds the teacher's own resource and a tool", async ({ page }) => {
    const runId = await seedResource(teacher, "Volcanoes of Iceland");
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, teacher);
    await page.goto("/dashboard");

    const search = page.locator("header").getByRole("combobox");
    await search.fill("volcan");
    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect(listbox.getByRole("option", { name: /Volcanoes of Iceland/ })).toBeVisible();

    await search.fill("worksheets");
    await expect(listbox.getByRole("option", { name: /^Worksheets/ })).toBeVisible();

    await search.fill("volcan");
    await listbox.getByRole("option", { name: /Volcanoes of Iceland/ }).click();
    await expect(page).toHaveURL(new RegExp(`run=${runId}`));
  });

  test("a percent sign in the search is text, not a wildcard", async ({ page }) => {
    await seedResource(teacher, "Fractions practice");
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, teacher);
    await page.goto("/dashboard");
    await page.locator("header").getByRole("combobox").fill("%");
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
    await expect(page.getByRole("option", { name: /Fractions practice/ })).toHaveCount(0);
  });

  test("no tool tile on Make is purple or orange", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "What would you like to make?" })).toBeVisible();
    const colours = await page
      .locator("main [style*='background']")
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect(colours.length).toBeGreaterThan(30);
    for (const c of colours) {
      expect(c).not.toBe("rgb(91, 46, 214)");
      expect(c).not.toBe("rgb(194, 85, 31)");
    }
  });
});
