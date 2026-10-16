import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, seedResource, signIn, type TestTeacher } from "../support/users";

/*
 * The mobile-first pass, through the interface.
 *
 * Most teachers open Jooma on a phone. These pin what that pass promised: no
 * page scrolls sideways at 320, 375 or 425px, the four main destinations sit in
 * a tab bar within reach of a thumb, the drawer and the menus behave for a
 * keyboard and a screen reader, fields do not make iOS zoom, and anything that
 * used to appear only on hover is there on a touch screen.
 *
 * The desktop checks at the end are the other half of the promise: the rail,
 * the tighter form sizes and the absent tab bar are exactly as they were.
 */

const NAV = { timeout: 30_000 };
const PHONES = [320, 375, 425];

/** True when nothing on the page reaches past the right edge of the screen. */
async function noSidewaysScroll(page: Page): Promise<{ ok: boolean; scrollWidth: number; width: number }> {
  return page.evaluate(() => ({
    ok: document.documentElement.scrollWidth <= window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
}

/** The computed font size of every visible text field on the page, in px. */
async function fieldFontSizes(page: Page): Promise<{ name: string; size: number }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select"))
      .filter((el) => {
        const type = el.getAttribute("type") ?? "";
        if (["checkbox", "radio", "hidden", "file", "range", "color", "button", "submit"].includes(type)) return false;
        return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      })
      .map((el) => ({
        name: el.id || el.getAttribute("name") || el.getAttribute("placeholder") || el.tagName,
        size: parseFloat(getComputedStyle(el).fontSize),
      })),
  );
}

/** Whether the focused element sits inside the given selector. */
function focusInside(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), selector);
}

test.describe("signed out, on a phone", () => {
  for (const width of PHONES) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 760 }, isMobile: true, hasTouch: true });

      test("the landing page, sign in and sign up do not scroll sideways", async ({ page }) => {
        for (const path of ["/", "/login", "/signup"]) {
          await page.goto(path);
          await page.waitForLoadState("load");
          const result = await noSidewaysScroll(page);
          expect(result.ok, `${path} is ${result.scrollWidth}px wide on a ${result.width}px screen`).toBe(true);
        }
      });
    });
  }

  test.describe("375px", () => {
    test.use({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });

    test("zoom is allowed and the page runs under the notch", async ({ page }) => {
      await page.goto("/login");
      const content = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(content).toContain("viewport-fit=cover");
      expect(content).not.toMatch(/maximum-scale|user-scalable/);
    });

    test("sign in and sign up fields are 16px, so iOS does not zoom into them", async ({ page }) => {
      for (const path of ["/login", "/signup"]) {
        await page.goto(path);
        const sizes = await fieldFontSizes(page);
        expect(sizes.length, `${path} has no fields`).toBeGreaterThan(0);
        for (const field of sizes) {
          expect(field.size, `${path} ${field.name}`).toBeGreaterThanOrEqual(16);
        }
      }
    });

    test("the landing header's links are 48px tall to tap", async ({ page }) => {
      await page.goto("/");
      const links = page.locator("[data-landing-nav] nav a");
      await expect(links.first()).toBeVisible();
      for (const box of await links.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
        expect(box).toBeGreaterThanOrEqual(48);
      }
    });
  });
});

test.describe("signed in", () => {
  let teacher: TestTeacher;

  test.beforeEach(async () => {
    teacher = await createTeacher("Morgan");
  });

  test.afterEach(async () => {
    await deleteTeacher(teacher);
  });

  for (const width of PHONES) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 760 }, isMobile: true, hasTouch: true });

      test("no app page scrolls sideways", async ({ page }) => {
        test.setTimeout(240_000);
        await signIn(page, teacher);
        for (const path of [
          "/dashboard",
          "/tools",
          "/tools/worksheet-generator",
          "/folders",
          "/assistant",
          "/timetable",
          "/colleagues",
          "/profile",
          "/pricing",
        ]) {
          await page.goto(path);
          await expect(page.locator("#app-tabbar")).toBeVisible(NAV);
          await page.waitForLoadState("load");
          const result = await noSidewaysScroll(page);
          expect(result.ok, `${path} is ${result.scrollWidth}px wide on a ${result.width}px screen`).toBe(true);
        }
      });
    });
  }

  test.describe("on a 375px phone", () => {
    test.use({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });

    test("the tab bar holds Today, Make, Library, Ask Jo and More, each 48px to tap", async ({ page }) => {
      await signIn(page, teacher);
      await page.goto("/dashboard");
      const bar = page.getByRole("navigation", { name: "Primary" });
      await expect(bar).toBeVisible(NAV);

      const items = bar.locator("a, button");
      await expect(items).toHaveText(["Today", "Make", "Library", "Ask Jo", "More"]);
      for (const box of await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
      await expect(bar.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");

      // Pinned to the bottom of the screen, and the hamburger it replaces is gone.
      const barBox = (await bar.boundingBox())!;
      expect(Math.round(barBox.y + barBox.height)).toBe(760);
      await expect(page.getByRole("button", { name: "Open navigation" })).toHaveCount(0);

      await bar.getByRole("link", { name: "Make" }).click();
      await page.waitForURL("**/tools", NAV);
      await expect(bar.getByRole("link", { name: "Make" })).toHaveAttribute("aria-current", "page");
    });

    test("More opens the drawer as a dialog that holds focus and gives it back", async ({ page }) => {
      await signIn(page, teacher);
      await page.goto("/dashboard");
      const more = page.getByRole("button", { name: "More" });
      await expect(more).toBeVisible(NAV);
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).toHaveAttribute("aria-controls", "app-sidenav-v2");

      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      const drawer = page.getByRole("dialog", { name: "Menu" });
      await expect(drawer).toBeVisible();
      // The secondary destinations live here.
      await expect(drawer.getByRole("link", { name: "Timetable" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Colleagues" })).toBeVisible();
      expect(await focusInside(page, "#app-sidenav-v2")).toBe(true);

      // Round the drawer and back again, both ways: focus never leaves it.
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        expect(await focusInside(page, "#app-sidenav-v2"), `Tab ${i + 1} left the drawer`).toBe(true);
      }
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Shift+Tab");
        expect(await focusInside(page, "#app-sidenav-v2"), `Shift+Tab ${i + 1} left the drawer`).toBe(true);
      }

      // Escape closes it and hands focus back to More.
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).toBeFocused();
    });

    test("the bell and the avatar are 48px to tap", async ({ page }) => {
      await signIn(page, teacher);
      await page.goto("/dashboard");
      // By what it controls: its name changes with the unread count.
      const bell = page.locator('button[aria-controls="notification-panel"]');
      const avatar = page.getByRole("button", { name: "Account menu" });
      await expect(avatar).toBeVisible(NAV);

      const avatarBox = (await avatar.boundingBox())!;
      expect(avatarBox.width).toBeGreaterThanOrEqual(48);
      expect(avatarBox.height).toBeGreaterThanOrEqual(48);

      // The bell draws at 36px; its hit area reaches 6px further on each side.
      // A tap 23px above its centre still lands on it.
      const bellBox = (await bell.boundingBox())!;
      const hit = await page.evaluate(
        ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[aria-controls="notification-panel"]')),
        { x: bellBox.x + bellBox.width / 2, y: bellBox.y + bellBox.height / 2 - 23 },
      );
      expect(hit).toBe(true);
    });

    test("a tool's fields are 16px on a phone", async ({ page }) => {
      await signIn(page, teacher);
      await page.goto("/tools/worksheet-generator");
      await expect(page.locator("#app-tabbar")).toBeVisible(NAV);
      const sizes = await fieldFontSizes(page);
      expect(sizes.length).toBeGreaterThan(0);
      for (const field of sizes) {
        expect(field.size, field.name).toBeGreaterThanOrEqual(16);
      }
    });

    test("the tab bar steps aside while the keyboard is up", async ({ page }) => {
      await signIn(page, teacher);
      await page.goto("/tools/worksheet-generator");
      const bar = page.locator("#app-tabbar");
      await expect(bar).toBeVisible(NAV);
      // A field the teacher can see; the form also carries hidden inputs.
      const field = page.locator("main textarea:visible").first();
      await field.focus();
      await expect(bar).toBeHidden();
      await field.blur();
      await expect(bar).toBeVisible();
    });

    test("a chat's options are there to tap, and its delete confirm is a proper dialog", async ({ page }) => {
      const { error } = await admin
        .from("assistant_chats")
        .insert({ user_id: teacher.id, title: "Rainforest plan" });
      expect(error, error?.message).toBeNull();

      await signIn(page, teacher);
      await page.goto("/assistant");
      const options = page.getByRole("button", { name: "Options for Rainforest plan" });
      await expect(options).toBeVisible(NAV);

      // On a mouse this only appears on hover. On a touch screen it is shown.
      expect(await options.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      const box = (await options.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(40);

      await options.click();
      await expect(options).toHaveAttribute("aria-expanded", "true");
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
      await menu.getByRole("menuitem", { name: "Delete" }).click();

      const dialog = page.getByRole("dialog", { name: "Delete this chat?" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(await focusInside(page, '[role="dialog"][aria-modal="true"]'), `Tab ${i + 1} left the dialog`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      // Cancelled, so the chat is still there.
      await expect(options).toBeVisible();
    });

    test("the account menu closes on Escape and gives focus back", async ({ page }) => {
      await signIn(page, teacher);
      await page.goto("/dashboard");
      const avatar = page.getByRole("button", { name: "Account menu" });
      await expect(avatar).toBeVisible(NAV);
      await expect(avatar).toHaveAttribute("aria-controls", "account-menu");

      await avatar.click();
      const menu = page.locator("#account-menu");
      await expect(menu).toBeVisible();
      expect(await focusInside(page, "#account-menu")).toBe(true);
      for (const box of await menu.getByRole("menuitem").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
        expect(box).toBeGreaterThanOrEqual(48);
      }

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(avatar).toBeFocused();
    });

    test("a library resource's menu returns focus to its button on Escape", async ({ page }) => {
      await seedResource(teacher, "Fractions starter");
      await signIn(page, teacher);
      await page.goto("/folders");
      const trigger = page.getByRole("button", { name: /menu$/i }).first();
      await expect(trigger).toBeVisible(NAV);
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toBeFocused();
    });
  });

  test.describe("on a desktop", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("the rail is there, the tab bar is not, and form sizes are as they were", async ({ page }) => {
      await signIn(page, teacher);
      await page.goto("/tools/worksheet-generator");
      await expect(page.locator("#app-sidenav-v2")).toBeVisible(NAV);
      await expect(page.locator("#app-tabbar")).toBeHidden();
      // Not a dialog at this width: it is the page's own sidebar.
      await expect(page.locator("#app-sidenav-v2")).not.toHaveAttribute("role", "dialog");

      // The 16px rule is for touch screens; with a mouse the tool forms keep
      // their 14px fields.
      const sizes = await fieldFontSizes(page);
      expect(sizes.some((f) => f.size === 14)).toBe(true);
    });
  });
});
