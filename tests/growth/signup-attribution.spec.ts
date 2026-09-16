import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  asTeacher,
  createProfilelessTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Where a signup came from, end to end.
 *
 * WHAT MAKES THIS WORTH DRIVING IN A BROWSER
 *
 * The unit tests already pin the rules. What they cannot show is the journey,
 * and the journey is where this feature was most likely to be built wrong: a
 * Meta ad points at jooma.ai, not jooma.ai/signup, and the landing page is a
 * server component whose link to /signup drops the query string entirely. A
 * capture living in the signup page would miss most real ad traffic and every
 * unit test would still pass.
 *
 * So the important test here is the unglamorous one: arrive at "/" with a tag,
 * reach /signup BY CLICKING, and assert the tag still lands on the profile.
 *
 * createProfilelessTeacher, not createTeacher: the latter seeds a profiles row,
 * so the gate would wave it past /complete-profile and there would be no
 * attribution write to observe. Same reasoning as tests/auth/meta-activation.
 *
 * DO NOT add page.route() interception to these tests. The activation fetch is
 * sent with keepalive so it survives the navigation, and a keepalive request
 * stalls in Playwright's interception layer, hanging the form on "Creating
 * account..." against code that is perfectly correct. See the long note in
 * tests/auth/meta-activation.spec.ts.
 */

/** The attribution columns for a teacher, read back through the service role. */
async function attributionFor(teacher: TestTeacher) {
  const { data } = await admin
    .from("profiles")
    .select("utm_source, utm_medium, utm_campaign, referrer_host, attributed_at")
    .eq("id", teacher.id)
    .maybeSingle();
  return data;
}

/** Fill the profile form. The values do not matter; reaching the submit does. */
async function completeProfile(page: Page) {
  await page.getByLabel("First name").fill("Attribution");
  await page.getByLabel("Surname").fill("Testcase");
  await page.getByLabel("Phone number").fill("7700900123");
  await page.getByRole("button", { name: /create account/i }).click();
  // The redirect is how we know the upsert landed: the form only navigates on
  // success, and the activation fetch goes out immediately before it.
  await expect(page).toHaveURL(/\/welcome/);
}

test.describe("Signup attribution", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createProfilelessTeacher("Attrib");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  test("a tagged ad survives the hop from the landing page to signup", async ({
    page,
    context,
  }) => {
    // Mixed case on purpose: normalisation is asserted end to end here, not just
    // in the unit test, because the check constraint would reject anything that
    // reached the database unfolded.
    await page.goto(
      "/?utm_source=Facebook&utm_medium=Paid_Social&utm_campaign=Spring2026",
    );

    // The cookie exists before any account does. This is the first touch, and it
    // is what has to survive everything that follows.
    const cookie = (await context.cookies()).find((c) => c.name === "jooma_attr");
    expect(cookie, "the proxy should have recorded the first touch").toBeTruthy();

    // BY CLICKING, not goto: the link carries no query string, which is exactly
    // why the capture lives in the proxy rather than in the signup page.
    //
    // Selected on the href rather than the label. The landing page is marketing
    // copy and "Start free" is theirs to change; the destination is not.
    await page.locator('a[href="/signup"]').first().click();
    await expect(page).toHaveURL(/\/signup/);
    expect(page.url()).not.toContain("utm_source");

    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    const attribution = await attributionFor(teacher);
    expect(attribution?.utm_source).toBe("facebook");
    expect(attribution?.utm_medium).toBe("paid_social");
    expect(attribution?.utm_campaign).toBe("spring2026");
    expect(attribution?.attributed_at).not.toBeNull();
  });

  test("the first tagged link wins, not the most recent", async ({ page }) => {
    // The whole of the first-touch decision, in one assertion. Someone who sees
    // an ad, then arrives again through a newsletter a week later, is still
    // credited to the ad that introduced them.
    await page.goto("/?utm_source=facebook");
    await page.goto("/?utm_source=newsletter");

    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    expect((await attributionFor(teacher))?.utm_source).toBe("facebook");
  });

  test("an untagged visit from elsewhere still records the referring site", async ({
    page,
  }) => {
    // The half that needs no cooperation from whoever builds the links. If the
    // agency points an ad at bare jooma.ai, this is what still catches it.
    await page.setExtraHTTPHeaders({
      referer: "https://www.google.com/search?q=lesson+plans",
    });
    await page.goto("/");

    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    const attribution = await attributionFor(teacher);
    // Host only. The query string carried the search terms and must not be here.
    expect(attribution?.referrer_host).toBe("google.com");
    expect(attribution?.utm_source).toBeNull();
  });

  test("moving around the site does not attribute us to ourselves", async ({ page }) => {
    // Without the internal-referrer rule every visitor who clicks a second page
    // records our own hostname as their source, and the panel fills with it.
    await page.goto("/");
    await page.goto("/pricing").catch(() => page.goto("/signup"));

    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    const attribution = await attributionFor(teacher);
    expect(attribution?.referrer_host ?? "").not.toContain("localhost");
    expect(attribution?.referrer_host ?? "").not.toContain("jooma");
  });

  test("a teacher cannot credit a campaign to themselves", async ({ page }) => {
    // The forgery the guard trigger exists to stop, tested through the anon key
    // rather than the service role. Hiding the columns from the UI is not the
    // same as the database refusing the write, and only one of those survives
    // somebody with a browser console and the key that ships in the bundle.
    await page.goto("/?utm_source=facebook");
    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    const asThem = await asTeacher(teacher);
    const { error } = await asThem
      .from("profiles")
      .update({ utm_source: "forged-by-teacher" })
      .eq("id", teacher.id);

    expect(error, "the guard trigger should refuse this").not.toBeNull();
    expect(error?.message ?? "").toMatch(/not authorized/i);

    // And the real value is untouched.
    expect((await attributionFor(teacher))?.utm_source).toBe("facebook");
  });

  test("an invited teacher on a paid plan is still attributed", async ({ page }) => {
    // The regression guard for the early return in complete-profile.
    //
    // shouldSendStartTrial is false for an invited paid signup, and that check
    // used to sit ABOVE the activation fetch, so the route was never called for
    // these teachers at all. Their _fbp, _fbc and signup source were all dropped
    // silently. If that early return ever comes back, this is null.
    //
    // The outcome is forced through the invited_plan metadata the insert guard
    // honours, which is how a real admin invite arrives.
    await admin.auth.admin.updateUserById(teacher.id, {
      user_metadata: { invited_plan: "pro" },
    });

    await page.goto("/?utm_source=facebook&utm_campaign=schools");
    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    const attribution = await attributionFor(teacher);
    expect(
      attribution?.utm_source,
      "an invited teacher must still record where they came from",
    ).toBe("facebook");
    expect(attribution?.utm_campaign).toBe("schools");
  });
});
