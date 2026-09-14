import { test, expect } from "@playwright/test";
import {
  createProfilelessTeacher,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Finishing the signup form is not optional.
 *
 * A profiles row is written by exactly one thing: the upsert at the end of
 * /complete-profile. Nothing used to force anyone to get there — /auth/callback
 * redirects a new Google teacher to it, but closing the tab left a live session
 * with no profile. That account could then use the whole product while being
 * invisible to the admin console (admin_users() starts FROM profiles) and
 * silently metered as Free (my_generation_gate() coalesces a missing row).
 *
 * That is not hypothetical: info@jooma.ai ran a homework generation two weeks
 * after signing up, and appeared on no admin screen at all.
 *
 * The gate lives in proxy.ts rather than a layout because app/(app) is a client
 * layout and /editor, /admin and every /api route sit outside it.
 */
test.describe("profile completion gate", () => {
  let stranded: TestTeacher;

  test.beforeEach(async () => {
    stranded = await createProfilelessTeacher("Stranded");
  });

  test.afterEach(async () => {
    await deleteTeacher(stranded);
  });

  // Parametrised across the three layout worlds deliberately: /dashboard is
  // inside app/(app), /editor and /admin are outside it. A layout-based gate
  // would pass the first and fail the rest, so testing one would prove nothing.
  for (const path of ["/dashboard", "/tools", "/editor", "/admin"]) {
    test(`${path} sends a profile-less teacher to /complete-profile`, async ({ page }) => {
      await signIn(page, stranded);

      await page.goto(path);

      await expect(page).toHaveURL(/\/complete-profile$/);
    });
  }

  test("/complete-profile itself is not gated", async ({ page }) => {
    // The loop test. The destination of a redirect cannot be behind the
    // redirect, or the teacher bounces forever and can never fix the thing the
    // gate is complaining about.
    await signIn(page, stranded);

    await page.goto("/complete-profile");

    await expect(page).toHaveURL(/\/complete-profile$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  for (const path of ["/terms", "/privacy"]) {
    test(`${path} stays readable while gated`, async ({ page }) => {
      // Someone stuck at the form must still be able to read what they are
      // being asked to agree to.
      await signIn(page, stranded);

      await page.goto(path);

      await expect(page).toHaveURL(new RegExp(`${path}$`));
    });
  }

  test("a generation API refuses with 403 JSON, not an HTML redirect", async ({ page }) => {
    // Through page.request so the session cookie rides along. An API caller does
    // res.json() and would choke on "<!DOCTYPE html>", which is why the gate
    // splits on /api/ rather than redirecting everything.
    await signIn(page, stranded);

    const res = await page.request.post("/api/homework-generator", {
      data: { subject: "Maths", yearGroup: "Year 5" },
    });

    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("profile_incomplete");
    // NOT x-upgrade-required: UpgradeGate keys off 402 + that header, and no
    // amount of money fixes an unfinished signup.
    expect(res.headers()["x-upgrade-required"]).toBeUndefined();
  });

  test("the slideshow route refuses too, though the proxy cannot see it", async ({ page }) => {
    /*
     * Asserted separately from the case above, and the separation is the point.
     * /api/generate-slideshow is excluded from the proxy matcher (the proxy
     * buffers its SSE stream), so it self-gates inside the handler instead.
     * Folding it into the previous test would prove nothing about that hole —
     * and it is the most expensive endpoint in the product.
     */
    await signIn(page, stranded);

    const res = await page.request.post("/api/generate-slideshow", {
      data: { topic: "Fractions", yearGroup: "Year 5" },
    });

    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("profile_incomplete");
  });

  test("completing the form releases the gate", async ({ page }) => {
    // The end-to-end proof, and the regression test against anyone caching the
    // profile lookup later: a per-user cache would bounce this teacher straight
    // back here for up to a minute after they submitted.
    await signIn(page, stranded);
    await expect(page).toHaveURL(/\/complete-profile$/);

    await page.locator("#firstName").fill(stranded.firstName);
    await page.locator("#surname").fill(stranded.surname);
    await page.locator("#phone").fill("7700900123");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/welcome/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("a teacher with a profile is untouched", async ({ page }) => {
    // Cheap, and it is what catches a gate that fires for everybody.
    const settled = await createTeacher("Settled");
    try {
      await signIn(page, settled);

      await page.goto("/dashboard");

      await expect(page).toHaveURL(/\/dashboard$/);
    } finally {
      await deleteTeacher(settled);
    }
  });
});
