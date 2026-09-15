import { test, expect } from "@playwright/test";
import {
  asTeacher,
  createAdmin,
  createAdminWithRole,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Who can see which part of the admin console.
 *
 * The console used to be one gate: is_admin, and then every page. A marketing
 * contractor with an account could read teacher records, revenue and settings.
 * These tests are about the second gate, the per-section one, and the case that
 * matters most is the NEGATIVE: marketing typing a URL and not getting in.
 *
 * WHAT IS AND IS NOT PROVEN HERE
 *
 * The browser tests prove what a real signed-in admin SEES, under RLS, through
 * the actual pages. They do not prove the database refuses a direct call, so the
 * last test does that separately over the anon key: the sidebar is a UX gate and
 * the RPC guard is the real boundary, and they fail differently.
 */

let marketing: TestTeacher | null = null;
let support: TestTeacher | null = null;
let owner: TestTeacher | null = null;
let fallback: TestTeacher | null = null;

test.beforeAll(async () => {
  marketing = await createAdminWithRole("Mira", "marketing");
  support = await createAdminWithRole("Sam", "support");
  owner = await createAdminWithRole("Olive", "super_admin");
  // Deliberately NO admin_team row: an is_admin user with none resolves to
  // super_admin through coalesce(). Every admin on production is in this state.
  fallback = await createAdmin("Fred");
});

test.afterAll(async () => {
  await deleteTeacher(marketing);
  await deleteTeacher(support);
  await deleteTeacher(owner);
  await deleteTeacher(fallback);
});

test.describe("marketing", () => {
  test("sees Stats in the nav and nothing else", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/stats");

    const nav = page.locator("aside");
    await expect(nav.getByRole("link", { name: "Stats" })).toBeVisible();

    // The sections a marketing contractor must not even know the shape of.
    for (const hidden of ["Teachers", "Payments & invoices", "Team & roles", "Settings"]) {
      await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
    }
  });

  test("cannot reach the teacher list by typing the URL", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/users");

    // Redirected away, and specifically not showing the page's own heading.
    await expect(page).toHaveURL(/\/admin\/stats/);
    await expect(page.getByRole("heading", { name: /^Teachers$/ })).toHaveCount(0);
  });

  test("cannot reach team and roles, the most sensitive page", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/team");

    await expect(page).toHaveURL(/\/admin\/stats/);
    await expect(page.getByRole("heading", { name: /Team/ })).toHaveCount(0);
  });

  test("cannot reach revenue", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/revenue");
    await expect(page).toHaveURL(/\/admin\/stats/);
  });

  test("lands on Stats from /admin without bouncing", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin");

    // The loop guard. If /admin and /admin/stats ever both redirect, this hangs
    // and fails on timeout rather than passing quietly.
    await expect(page).toHaveURL(/\/admin\/stats/);
    await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  });

  test("sees the Stats page render, with its limits stated", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/stats");

    await expect(page.getByText("Signups by month")).toBeVisible();
    await expect(page.getByText("How teachers reached us")).toBeVisible();

    // The acquisition panel must keep saying it is not built. If someone later
    // fills it with the three attribution buckets and calls it channel data,
    // this fails, which is the point.
    await expect(page.getByText("NOT BUILT YET")).toBeVisible();
    await expect(page.getByText(/Acquisition channel/)).toBeVisible();
  });
});

test.describe("other roles", () => {
  test("support sees its own sections but not Stats or Team", async ({ page }) => {
    await signIn(page, support!);
    await page.goto("/admin");

    const nav = page.locator("aside");
    await expect(nav.getByRole("link", { name: "Teachers" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Inbox" })).toBeVisible();
    // support has neither see_stats nor see_admin.
    await expect(nav.getByRole("link", { name: "Stats" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Team & roles" })).toHaveCount(0);
  });

  test("a super admin still sees the whole console", async ({ page }) => {
    await signIn(page, owner!);
    await page.goto("/admin");

    const nav = page.locator("aside");
    for (const label of ["Dashboard", "Stats", "Teachers", "Team & roles", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("an admin with no team row is still treated as a super admin", async ({ page }) => {
    // The coalesce(..., 'super_admin') fallback. Breaking it locks every
    // existing admin out of their own console, so this is the regression test
    // that matters most in the file.
    await signIn(page, fallback!);
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.locator("aside").getByRole("link", { name: "Team & roles" })).toBeVisible();
  });
});

test.describe("the database, not just the interface", () => {
  test("support is refused the stats RPCs outright", async () => {
    // Hiding a page stops it being found, not reached. This is the actual
    // boundary: a support admin calling the function directly over PostgREST,
    // which no amount of sidebar filtering would prevent.
    const client = await asTeacher(support!);
    const { error } = await client.rpc("admin_signup_stats_by_month", { p_months: 12 });

    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/cannot see stats|not authorized/i);
  });

  test("marketing is allowed the stats RPCs", async () => {
    const client = await asTeacher(marketing!);
    const { data, error } = await client.rpc("admin_signup_stats_by_month", { p_months: 3 });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  test("marketing is refused everything else", async () => {
    const client = await asTeacher(marketing!);

    // The dashboard's own aggregate, which carries revenue.
    const dashboard = await client.rpc("admin_dashboard");
    expect(dashboard.error).not.toBeNull();

    // And it cannot grant itself more.
    const grant = await client.rpc("admin_set_role", {
      uid: marketing!.id,
      p_role: "super_admin",
    });
    expect(grant.error).not.toBeNull();
  });
});
