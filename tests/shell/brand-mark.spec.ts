import { test, expect } from "@playwright/test";

/*
 * The brand mark, signed out.
 *
 * The app icon is the wordmark's own j, solid white on a purple disc, made by
 * scripts/make-favicon.py. It replaced a J drawn as four concentric stripes,
 * and the pages that still carried the old striped lockup as an <img> now
 * render the Wordmark component instead.
 */

// Pages that used to load /logo/logo-v2.svg, the retired striped lockup.
const PAGES = ["/privacy", "/terms", "/unsubscribe", "/maintenance", "/no-such-page-brand-mark"];

test.describe("Brand mark", () => {
  for (const path of PAGES) {
    test(`${path} shows the wordmark, not the old lockup`, async ({ page }) => {
      const oldLogo: string[] = [];
      page.on("request", (req) => {
        if (/\/logo\/(logo|logo-v2|icon)\.svg/.test(req.url())) oldLogo.push(req.url());
      });

      await page.goto(path);
      await expect(page.locator('svg[aria-label="Jooma"]').first()).toBeVisible();
      await expect(page.locator('img[src*="logo-v2.svg"]')).toHaveCount(0);
      expect(oldLogo).toEqual([]);
    });
  }

  test("the favicon and apple icon are served", async ({ request }) => {
    const ico = await request.get("/favicon.ico");
    expect(ico.status()).toBe(200);
    const apple = await request.get("/apple-icon.png");
    expect(apple.status()).toBe(200);
    expect(apple.headers()["content-type"]).toContain("image/png");
  });

  test("the app icon is a solid j, not stripes", async ({ page }) => {
    await page.goto("/privacy");
    // Walk the row through the middle of the icon and count runs of white.
    // The solid j's stem crosses it once; the striped J crossed it four times.
    const runs = await page.evaluate(async () => {
      const img = new Image();
      img.src = "/apple-icon.png";
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const row = ctx.getImageData(0, Math.floor(img.height / 2), img.width, 1).data;
      let count = 0;
      let inWhite = false;
      for (let i = 0; i < row.length; i += 4) {
        const white = row[i] > 200 && row[i + 1] > 200 && row[i + 2] > 200 && row[i + 3] > 200;
        if (white && !inWhite) count++;
        inWhite = white;
      }
      return count;
    });
    expect(runs).toBe(1);
  });
});
