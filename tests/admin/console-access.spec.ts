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
    await expect(page.getByText("Acquisition channel")).toBeVisible();

    // The acquisition panel used to be a NOT BUILT YET banner, and this test
    // guarded against someone filling it with the ambassador and invite buckets
    // and calling that channel data. Now that campaign tags are genuinely
    // recorded, the same job falls to the caveats: the panel has to keep saying
    // which accounts carry no source at all, and that paid social is a floor
    // rather than a total because of the in-app-browser gap. A panel that
    // quietly dropped those would be overclaiming again.
    //
    // Matched on the substance rather than an exact sentence: the copy is
    // marketing-facing and will be reworded, and a test pinned to a phrase
    // fails on an honest edit while passing if someone deletes the caveat and
    // writes a different one. "Not recorded" and "floor" are the two claims
    // that have to survive.
    await expect(page.getByText(/Not recorded/).first()).toBeVisible();
    await expect(page.getByText(/floor/)).toBeVisible();

    // And the tagging note, which is what makes a missing utm_source self
    // diagnosing for the agency reading this page.
    await expect(page.getByText(/utm_source=facebook/)).toBeVisible();
  });

  /*
   * The visual rebuild: KPI deltas, the visitors tile, the charts, and the
   * ranges named in months.
   *
   * These assert structure rather than numbers. The staging database's figures
   * change under the tests, so anything pinned to a value fails on a quiet
   * Tuesday; what has to hold is that each panel renders at all, which is what
   * breaks when a chart throws or a tile is wired to a field that does not
   * exist.
   */
  test("shows the range tabs named in months, not days", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/stats");

    // The rename. "30 days" promised a precision the monthly RPCs never had.
    await expect(page.getByRole("link", { name: "1 month" })).toBeVisible();
    await expect(page.getByRole("link", { name: "3 months" })).toBeVisible();
    await expect(page.getByRole("link", { name: "12 months" })).toBeVisible();
    await expect(page.getByRole("link", { name: "All time" })).toBeVisible();

    await expect(page.getByRole("link", { name: /30 days/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /90 days/ })).toHaveCount(0);
  });

  test("renders every KPI tile, including visitors", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/stats");

    // Scoped to the tile labels themselves. Unscoped, "Visitors" also matches
    // the Monthly detail column header and trips strict mode.
    const labels = page.locator("p.uppercase");

    for (const tile of [
      "Total signups",
      "This month",
      "Paying teachers",
      "Free to paid",
      "Visitors",
    ]) {
      await expect(labels.filter({ hasText: new RegExp(`^${tile}$`) })).toBeVisible();
    }
  });

  test("draws the charts rather than leaving empty panels", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/stats");

    await expect(page.getByText("Plan mix")).toBeVisible();
    await expect(page.getByText("Free to paid conversion")).toBeVisible();

    // Recharts renders to SVG, and renders nothing at all if the data shape is
    // wrong. Waiting on the surface is the cheapest proof the chart mounted:
    // a thrown chart leaves the card body empty and this times out.
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // One per chart: signups, conversion, plan mix. Fewer means a panel fell
    // back to its empty state on data that exists.
    await expect(page.locator(".recharts-surface")).toHaveCount(3);
  });

  test("keeps the visitor count honest about being daily", async ({ page }) => {
    await signIn(page, marketing!);
    await page.goto("/admin/stats");

    // The wording is the point. Vercel floors every window to a whole day, so
    // the mockup's "on site right now" would be a claim this data cannot make,
    // and the caveat underneath is what stops someone reinstating it.
    await expect(page.getByText(/so far today/i)).toBeVisible();
    await expect(page.getByText(/Counted per day, not live/)).toBeVisible();
    await expect(page.getByText(/on site right now/i)).toHaveCount(0);
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
