import { test, expect } from "@playwright/test";
import { TOOL_PAGES, toolPageForHref, toolPagePath } from "@/app/lib/seo/tool-pages";
import { V2_TOOLS } from "@/app/lib/tools";

/*
 * The public tool pages, as a signed-out visitor and a crawler see them.
 *
 * These exist so a tool's name can rank: before them, every tool link on the
 * homepage was a redirect to /login. So the properties worth pinning are that
 * they open with no session, say what the tool is in their opening text,
 * declare themselves properly, and that the homepage actually points at them.
 *
 * The tools themselves are untouched and still need a session; the last test
 * holds that line too.
 */

test.describe("public tool pages, signed out", () => {
  for (const page of TOOL_PAGES) {
    test(`${page.slug} opens and says what it is`, async ({ page: browser }) => {
      const res = await browser.goto(toolPagePath(page));
      expect(res?.status()).toBe(200);
      await expect(browser).toHaveURL(new RegExp(`${toolPagePath(page)}$`));

      await expect(browser.locator("h1")).toHaveCount(1);
      await expect(browser.locator("h1")).toHaveText(page.h1);
      await expect(browser.getByTestId("tool-intro")).toHaveText(page.intro);
      await expect(browser).toHaveTitle(`${page.title} | Jooma`);
      await expect(browser.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://www.jooma.ai${toolPagePath(page)}`,
      );

      const data = JSON.parse(
        (await browser.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
      );
      const types = (data["@graph"] as { "@type": string }[]).map((n) => n["@type"]);
      expect(types).toEqual(["SoftwareApplication", "FAQPage", "BreadcrumbList"]);
    });
  }

  test("a tool with a free try sends the visitor to it, the rest to the trial", async ({ page }) => {
    await page.goto("/teacher-tools/worksheet-generator");
    await expect(page.getByRole("link", { name: "Try it free, no sign up" }).first()).toHaveAttribute(
      "href",
      "/create?tool=ws",
    );

    await page.goto("/teacher-tools/report-writer");
    await expect(page.getByRole("link", { name: "Start free trial" }).first()).toHaveAttribute("href", "/signup");
  });

  test("the index lists every tool and links the ones with pages", async ({ page }) => {
    const res = await page.goto("/teacher-tools");
    expect(res?.status()).toBe(200);
    for (const p of TOOL_PAGES) {
      await expect(page.locator(`a[href="${toolPagePath(p)}"]`)).toHaveCount(1);
    }
  });

  test("a slug with no page is a 404, not a page made on demand", async ({ page }) => {
    const res = await page.goto("/teacher-tools/not-a-real-tool");
    expect(res?.status()).toBe(404);
  });

  test("the homepage's tool cards point a visitor at the public pages", async ({ page }) => {
    await page.goto("/");
    for (const p of TOOL_PAGES) {
      await expect(page.locator(`#tools a[href="${toolPagePath(p)}"]`)).toHaveCount(1);
    }
    // A tool without a public page yet still links to the app. Pages are added
    // in batches, so pick one that has none, while any remain.
    const withoutPage = V2_TOOLS.find((t) => !toolPageForHref(t.href));
    if (withoutPage) {
      await expect(page.locator(`#tools a[href="${withoutPage.href}"]`)).toHaveCount(1);
    }
  });

  test("the tool itself still needs a session", async ({ request }) => {
    const res = await request.get("/tools/report-writer", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login/);
  });
});
