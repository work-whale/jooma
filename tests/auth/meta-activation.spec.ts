import { test, expect, type Page, type Request } from "@playwright/test";
import {
  createProfilelessTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Reporting a Free plan activation to Meta.
 *
 * WHAT THIS IS ACTUALLY ASSERTING
 *
 * Not that Meta received anything — that needs Events Manager and a human. What
 * it pins is the thing most likely to break silently in our own code: that the
 * event fires exactly once, at the moment the account is genuinely activated,
 * and not before.
 *
 * The specification is explicit that StartTrial must fire "only after the Free
 * plan has been successfully activated, not simply when the user clicks the
 * Start Free button". Activation is the profiles row being written, which
 * happens at the end of /complete-profile. These tests drive that real form
 * rather than calling the route directly, because the ordering is the part that
 * is worth protecting.
 *
 * OBSERVED, NOT INTERCEPTED, and that distinction is load-bearing. The client
 * sends this with `keepalive: true` so the request survives the navigation that
 * follows it. Fulfilling such a request from page.route() leaves it pending from
 * the page's point of view and the App Router transition never completes, so the
 * form appears to hang on "Creating account…" and the test fails against code
 * that is perfectly correct. Watching the request and letting the real route
 * answer it costs nothing and tests more.
 *
 * createProfilelessTeacher is the right fixture and createTeacher is not: the
 * latter seeds a profiles row, so the gate would let it past /complete-profile
 * and there would be no activation left to observe.
 */

/** Every POST to the activation route, captured as it goes out. */
function watchActivations(page: Page): Array<Record<string, unknown>> {
  const calls: Array<Record<string, unknown>> = [];
  page.on("request", (req: Request) => {
    if (req.method() !== "POST") return;
    if (!req.url().includes("/api/meta/activation")) return;
    try {
      calls.push(req.postDataJSON());
    } catch {
      calls.push({});
    }
  });
  return calls;
}

test.describe("Meta activation reporting", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createProfilelessTeacher("Activate");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  /** Fill the profile form with anything valid. The values do not matter to
   *  these tests; reaching the submit does. Country is seeded from the dial
   *  code, so it needs no interaction. */
  async function completeProfile(page: Page) {
    await page.getByLabel("First name").fill("Activate");
    await page.getByLabel("Surname").fill("Testcase");
    await page.getByLabel("Phone number").fill("7700900123");
    await page.getByRole("button", { name: /create account/i }).click();
  }

  test("fires once, only after the profile is saved", async ({ page }) => {
    const calls = watchActivations(page);

    await signIn(page, teacher);
    await page.goto("/complete-profile");

    // Nothing may have fired from merely opening the form. This is the
    // "not simply when the user clicks Start Free" half of the requirement:
    // arriving at the last step is not activating an account.
    expect(calls).toHaveLength(0);

    await completeProfile(page);

    // The redirect to /welcome is how we know the upsert landed rather than
    // erroring: the form only navigates on success.
    await expect(page).toHaveURL(/\/welcome/);

    expect(calls).toHaveLength(1);
    expect(calls[0].outcome).toEqual({ kind: "self-signup" });
  });

  test("reports the signup even when the pixel never ran", async ({ page }) => {
    // The ad-blocker case, and the reason the server half exists at all.
    //
    // The condition is CREATED here rather than assumed: NEXT_PUBLIC_META_PIXEL_ID
    // is set in .env.local, so the real pixel loads against localhost and sets a
    // genuine _fbp cookie. Expecting no cookie without blocking anything would
    // pass or fail on whether a developer happens to have the pixel configured,
    // which is not what this test is about. Aborting the loader is what an ad
    // blocker actually does.
    await page.route("**/connect.facebook.net/**", (route) => route.abort());

    // WHY THIS ONE DOES NOT ASSERT THE NAVIGATION, unlike the other two.
    //
    // Registering any route handler puts this page's requests through
    // Playwright's interception layer, and the activation fetch is sent with
    // `keepalive: true` so that it survives the navigation that follows it. A
    // keepalive request stalls in that layer, which holds up the App Router
    // transition and leaves the form on "Creating account…" — against
    // application code that is provably correct: with the loader blocked and no
    // interception registered, the same flow reaches /welcome with no console
    // errors and window.fbq still present as the inline stub.
    //
    // So the navigation is asserted by the two tests that do not intercept, and
    // this one asserts only the thing it exists for: that a blocked pixel still
    // produces a server-side activation carrying no cookies.
    const activation = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().includes("/api/meta/activation"),
    );

    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    const body = (await activation).postDataJSON();

    // Reported despite the block. This is the whole point: a blocked pixel must
    // not cost us the signup, because the server send is not blockable.
    expect(body.outcome).toEqual({ kind: "self-signup" });
    // Null rather than absent or empty: the payload builder omits what is null
    // rather than sending a blank, which would match every other empty user.
    expect(body.fbp ?? null).toBeNull();
    expect(body.fbc ?? null).toBeNull();
  });

  test("a signup that cannot be saved reports nothing", async ({ page }) => {
    // The upsert failing is the one case where the teacher is NOT activated.
    // Firing here would count an account that does not exist.
    const calls = watchActivations(page);

    // Break the profiles write itself, which is what the form depends on.
    // Intercepting THIS is safe: it is an ordinary awaited fetch, not a
    // keepalive one, so fulfilling it does not strand the page.
    await page.route("**/rest/v1/profiles**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "forced failure" }),
        });
        return;
      }
      await route.continue();
    });

    await signIn(page, teacher);
    await page.goto("/complete-profile");
    await completeProfile(page);

    // Still on the form, showing the error the page renders for a failed save.
    //
    // Matched on the text rather than on role=alert: Next keeps an always-present
    // __next-route-announcer__ div with that role, so the role alone resolves to
    // two elements and fails strict mode against code that is working.
    await expect(page).toHaveURL(/\/complete-profile/);
    await expect(page.getByText(/could not save your profile/i)).toBeVisible();

    expect(calls).toHaveLength(0);
  });
});
