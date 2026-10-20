import { test, expect, type Locator, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";

/*
 * The signed-in app on a phone, a Galaxy Fold and a tablet.
 *
 *   - no bottom tab bar: a burger at the top right opens the drawer from the
 *     right, with the account links at its foot, and the avatar stays beside
 *     the bell
 *   - Today's four counts are square tiles, icon and number, in a 2x2 grid
 *   - the tool filters are one row that scrolls sideways
 *   - the slide editor opens on a phone, a Fold (open and closed) and a tablet
 *   - the slideshow's theme step opens at its top, and "Can't see a
 *     statement?" opens inside its card rather than clipped below it
 *   - Ask Jo's splash, and the locked page a Free teacher sees, fit on a phone
 *   - Jo's "try it on your desktop" pill shows once per tool on a phone
 *   - nothing scrolls sideways on the Fold's 280px cover screen
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const FOLD_OPEN = { viewport: { width: 690, height: 830 }, isMobile: true, hasTouch: true };
const FOLD_CLOSED = { viewport: { width: 280, height: 653 }, isMobile: true, hasTouch: true };
const TABLET = { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true };

async function box(el: Locator) {
  const b = await el.boundingBox();
  expect(b, "element has no box").not.toBeNull();
  return b!;
}

/** True when nothing on the page reaches past the right edge of the screen. */
function noSidewaysScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

/** Inside the visible part of the screen, top to bottom. */
async function expectOnScreen(page: Page, el: Locator, what: string) {
  const b = await box(el);
  const height = page.viewportSize()!.height;
  expect(b.y, `${what} starts above the screen`).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height, `${what} runs off the bottom`).toBeLessThanOrEqual(height + 0.5);
}

async function makeDeck(teacher: TestTeacher): Promise<string> {
  const { data, error } = await admin
    .from("presentations")
    .insert({
      user_id: teacher.id,
      title: "Volcanoes",
      slides: [
        {
          shapes: [], texts: [], images: [], audios: [], videos: [],
          callouts: [], badges: [], blockquotes: [], activities: [],
          background: "#ffffff",
        },
      ],
    })
    .select()
    .single();
  if (error) throw new Error(`Could not create a deck: ${error.message}`);
  return data.id as string;
}

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Rowan");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("no tab bar; the bell, the avatar and the burger sit along the top", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const burger = page.getByRole("button", { name: "Open menu" });
    await expect(burger).toBeVisible(NAV);
    await expect(page.locator("#app-tabbar")).toHaveCount(0);

    const bell = page.locator('button[aria-controls="notification-panel"]');
    const avatar = page.getByRole("button", { name: "Account" });
    const [b, a, m] = [await box(bell), await box(avatar), await box(burger)];
    expect(b.x).toBeLessThan(a.x);
    expect(a.x).toBeLessThan(m.x);
    expect(Math.abs(b.y + b.height / 2 - (m.y + m.height / 2))).toBeLessThan(4);
    expect(m.width).toBeGreaterThanOrEqual(48);
    expect(m.height).toBeGreaterThanOrEqual(48);
    // The burger is at the right of the bar.
    expect(m.x + m.width).toBeGreaterThan(390 - 24);
  });

  test("the burger opens the drawer from the right, with the account links, and Escape gives focus back", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const burger = page.getByRole("button", { name: "Open menu" });
    await expect(burger).toBeVisible(NAV);
    await burger.click();

    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await expect.poll(async () => Math.round((await box(drawer)).x + (await box(drawer)).width)).toBe(390);
    await expect(drawer.getByRole("link", { name: "Timetable" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Profile" })).toBeAttached();
    await expect(drawer.getByRole("link", { name: "Usage and billing" })).toBeAttached();
    await expect(drawer.getByRole("button", { name: "Sign out" })).toBeAttached();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: "test-results/app-drawer-phone.png" });

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(burger).toBeFocused();
  });

  test("the avatar opens the drawer at the account links", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const avatar = page.getByRole("button", { name: "Account" });
    await expect(avatar).toBeVisible(NAV);
    await avatar.click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    // No dropdown of its own on a phone.
    await expect(page.locator("#account-menu")).toHaveCount(0);
    const profile = drawer.getByRole("link", { name: "Profile" });
    await expect(profile).toBeInViewport();
    // Who is signed in heads the account links.
    await expect(drawer.getByText(teacher.email)).toBeVisible();
    await profile.click();
    await page.waitForURL("**/profile", NAV);
    await expect(drawer).toBeHidden();
  });

  test("Today's four counts are square tiles in a 2x2 grid, with no words under them", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const tiles = ["Day streak", "Resources made", "Badges earned", "Time saved"].map((t) => page.locator(`[title="${t}"]`));
    await expect(tiles[0]).toBeVisible(NAV);
    const boxes = await Promise.all(tiles.map(box));
    for (const b of boxes) expect(Math.abs(b.width - b.height)).toBeLessThan(2);
    expect(Math.round(boxes[0].y)).toBe(Math.round(boxes[1].y));
    expect(Math.round(boxes[2].y)).toBe(Math.round(boxes[3].y));
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
    // The sentence values and the labels give way to a bare number.
    await expect(page.getByText("Starts today")).toBeHidden();
    await expect(page.getByText("Let us find out")).toBeHidden();
    await expect(tiles[0].locator("b:visible")).toHaveText("0");
    await page.screenshot({ path: "test-results/app-today-tiles-phone.png" });
  });

  test("the tool filters are one row that scrolls sideways", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/tools");
    const filters = page.getByTestId("tool-filters");
    await expect(filters).toBeVisible(NAV);
    const tops = await filters.locator("button").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    expect((await box(filters)).height).toBeLessThan(60);
    expect(await filters.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await noSidewaysScroll(page)).toBe(true);
    await expect(filters.getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: "test-results/app-tool-filters-phone.png" });
  });

  test("the slideshow's theme step opens at its top, and the statement hint fits its card", async ({ page }) => {
    await page.route("**/api/suggest-subject", (route) => route.fulfill({ json: { subject: "", strand: "", statementIds: [] } }));
    await signIn(page, teacher);
    await page.goto("/tools/slideshow");
    await page.getByRole("button", { name: "Generate slideshow" }).first().click();
    await page.locator('input[name="lesson-topic"]').fill("Volcanoes");
    await page.getByRole("button", { name: /^Continue/ }).click();

    // Step 2, with the curriculum card open.
    const card = page.getByTestId("curriculum-alignment");
    await expect(card).toBeVisible(NAV);
    const align = card.getByRole("button", { name: /Align to curriculum/ });
    if ((await align.getAttribute("aria-expanded")) !== "true") await align.click();
    await card.getByRole("button", { name: /see a statement/ }).click();
    const hint = page.getByTestId("curriculum-hint");
    await expect(hint).toBeVisible();
    const h = await box(hint);
    const c = await box(card);
    expect(h.y + h.height, "the hint hangs below its card").toBeLessThanOrEqual(c.y + c.height + 0.5);

    // Scroll to the bottom of the long Refine step, then on to the themes.
    const body = page.getByTestId("generate-body");
    await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page.getByTestId("theme-picker")).toBeVisible();
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("Ask Jo's locked page fits on a phone for a Free teacher", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/assistant");
    const locked = page.getByTestId("assistant-locked");
    await expect(locked).toBeVisible(NAV);
    await expectOnScreen(page, locked.getByRole("heading", { name: "Your teaching assistant" }), "the heading");
    // Scrolls within itself rather than clipping, so its button can be reached.
    const upgrade = locked.getByRole("link", { name: /Upgrade to Pro/ });
    await upgrade.scrollIntoViewIfNeeded();
    await expectOnScreen(page, upgrade, "the upgrade button");
  });

  test("the desktop pill shows once on a tool, and goes when dismissed", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/tools/worksheet-generator");
    const pill = page.getByTestId("desktop-hint");
    await expect(pill).toBeVisible(NAV);
    await expect(pill).toContainText("Would you like a better experience? Try Jooma on your desktop.");
    await expectOnScreen(page, pill, "the pill");
    await page.screenshot({ path: "test-results/app-desktop-pill-phone.png" });
    await pill.getByRole("button", { name: "Dismiss" }).click();
    await expect(pill).toBeHidden();

    // Not again on the same tool this session.
    await page.reload();
    await expect(page.locator("[data-jo-form]")).toBeVisible(NAV);
    await page.waitForTimeout(3000);
    await expect(pill).toHaveCount(0);
  });
});

test.describe("Ask Jo's chats on a phone", () => {
  test.use(PHONE);

  test("open as a side panel from the left, and choosing one opens it and puts the panel away", async ({ page }) => {
    const { data, error } = await admin
      .from("assistant_chats")
      .insert([
        { user_id: teacher.id, title: "Rainforest plan" },
        { user_id: teacher.id, title: "Fractions quiz" },
      ])
      .select("id, title");
    expect(error, error?.message).toBeNull();
    try {
      await signIn(page, teacher);
      await page.goto("/assistant");
      const toggle = page.getByRole("button", { name: "Open chats" });
      await expect(toggle).toBeVisible(NAV);
      await expect(page.getByTestId("assistant-chat-title")).toHaveText("New chat");
      // Closed, the list is out of sight and out of reach.
      await expect(page.getByRole("button", { name: "Rainforest plan" })).toBeHidden();

      await toggle.click();
      const panel = page.getByRole("dialog", { name: "Chats" });
      await expect(panel).toBeVisible();
      await expect(page.getByRole("button", { name: "Close chats" })).toBeFocused();
      // Against the left edge once it has slid in, over a dimmed page.
      await expect.poll(async () => Math.round((await box(panel)).x)).toBe(0);
      expect((await box(panel)).height).toBeGreaterThanOrEqual(843);
      await expect(page.getByTestId("assistant-chats-backdrop")).toBeVisible();
      await expect(panel.getByRole("button", { name: "Rainforest plan" })).toBeVisible();
      await page.screenshot({ path: "test-results/app-ask-jo-chats-phone.png" });

      // Search narrows it.
      await panel.getByLabel("Search chats").fill("fraction");
      await expect(panel.getByRole("button", { name: "Rainforest plan" })).toBeHidden();
      await panel.getByLabel("Search chats").fill("");

      // Escape puts it away and gives focus back.
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(toggle).toBeFocused();

      // A tap on the page behind does too.
      await toggle.click();
      await expect(panel).toBeVisible();
      await page.getByTestId("assistant-chats-backdrop").click({ position: { x: 380, y: 400 } });
      await expect(panel).toBeHidden();

      // Choosing a chat opens it, closes the panel and names it in the bar.
      await toggle.click();
      await page.getByRole("dialog", { name: "Chats" }).getByRole("button", { name: "Rainforest plan" }).click();
      const rainforest = data!.find((c) => c.title === "Rainforest plan")!;
      await page.waitForURL(`**/assistant/${rainforest.id}`, NAV);
      await expect(page.getByRole("dialog", { name: "Chats" })).toHaveCount(0);
      await expect(page.getByTestId("assistant-chat-title")).toHaveText("Rainforest plan");
    } finally {
      await admin.from("assistant_chats").delete().eq("user_id", teacher.id);
    }
  });
});

test.describe("Ask Jo's chats on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("stay a column beside the conversation, with no panel bar", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/assistant");
    const column = page.locator("#assistant-chats");
    await expect(column).toBeVisible(NAV);
    await expect(column).not.toHaveAttribute("role", "dialog");
    await expect(page.getByRole("button", { name: "Open chats" })).toBeHidden();
    const b = await box(column);
    expect(Math.round(b.width)).toBe(292);
    // In the page's flow beside the rail, not over it.
    expect(b.x).toBeGreaterThan(250);
  });
});

test.describe("Ask Jo on a phone, subscribed", () => {
  test.use(PHONE);

  test("the splash's heading and both lines are on screen above the composer", async ({ page }) => {
    const pro = await createTeacher("Sasha");
    try {
      await setPlan(pro, "pro", "comped");
      await signIn(page, pro);
      await page.goto("/assistant");
      const splash = page.getByTestId("assistant-splash");
      await expect(splash).toBeVisible(NAV);
      await expectOnScreen(page, splash.getByRole("heading", { name: "How can I help you?" }), "the heading");
      await expectOnScreen(page, splash.getByText("Ask about planning"), "the first line");
      await expectOnScreen(page, splash.getByText(/Ask for a resource/), "the second line");
      // The composer is not focused, so no keyboard comes up over it.
      await expect(page.getByLabel("Message Jo")).not.toBeFocused();
      await page.screenshot({ path: "test-results/app-ask-jo-phone.png" });
    } finally {
      await deleteTeacher(pro);
    }
  });
});

for (const [name, device] of [
  ["a phone", PHONE],
  ["a Fold, open", FOLD_OPEN],
  ["a Fold, closed", FOLD_CLOSED],
  ["a tablet", TABLET],
] as const) {
  test.describe(`the slide editor on ${name}`, () => {
    test.use(device);

    test("opens, with no bigger screen notice", async ({ page }) => {
      const deckId = await makeDeck(teacher);
      try {
        await signIn(page, teacher);
        await page.goto(`/editor/${deckId}`);
        const editor = page.getByTestId("slide-editor");
        await expect(editor).toBeVisible(NAV);
        await expect(page.getByText("The slide editor needs a bigger screen")).toHaveCount(0);
        // It fills the screen, top to bottom.
        expect(Math.round((await box(editor)).height)).toBe(device.viewport.height);
        await page.screenshot({ path: `test-results/app-editor-${device.viewport.width}.png` });
      } finally {
        await admin.from("presentations").delete().eq("id", deckId);
      }
    });
  });
}

test.describe("on a Fold's cover screen", () => {
  test.use(FOLD_CLOSED);

  test("no app page scrolls sideways at 280px", async ({ page }) => {
    await signIn(page, teacher);
    for (const path of ["/dashboard", "/tools", "/tools/worksheet-generator", "/folders", "/assistant", "/profile"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible(NAV);
      await page.waitForLoadState("load");
      expect(await noSidewaysScroll(page), `${path} scrolls sideways`).toBe(true);
    }
  });
});

test.describe("on a Fold, open", () => {
  test.use(FOLD_OPEN);

  test("the tiles stay a 2x2 grid of modest squares", async ({ page }) => {
    await signIn(page, teacher);
    await page.goto("/dashboard");
    const tile = page.locator('[title="Day streak"]');
    await expect(tile).toBeVisible(NAV);
    const b = await box(tile);
    expect(Math.abs(b.width - b.height)).toBeLessThan(2);
    expect(b.width).toBeLessThanOrEqual(200);
  });
});
