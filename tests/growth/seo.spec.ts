import { test, expect } from "@playwright/test";
import { SITE_DESCRIPTION } from "@/app/lib/seo/brand";

/*
 * What a crawler sees, signed out.
 *
 * None of this shows up for a teacher using the product, which is how each of
 * these got broken or left undone in the first place: a mistyped URL redirected
 * to /login instead of answering 404, /login itself was in Google's index, the
 * homepage never said in a sentence what Jooma is, and every page shared the
 * homepage's social card details.
 *
 * Every request here is signed out. That is the point of the file.
 *
 * Run against a dev server, which is not production, so robots.txt and the
 * pages carry the staging noindex here. The tests assert that too, since it is
 * exactly what staging should serve.
 */

test.describe("SEO basics, signed out", () => {
  test("a URL nothing serves answers 404, not a redirect to /login", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page).toHaveURL(/\/this-page-does-not-exist$/);
    await expect(page.getByRole("heading", { name: "We can't find that page" })).toBeVisible();
  });

  test("a private page still sends a signed-out visitor to /login", async ({ request }) => {
    const res = await request.get("/dashboard", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login/);
  });

  test("an unknown API route is still a 401, not a page", async ({ request }) => {
    const res = await request.get("/api/does-not-exist", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });

  test("the sign-in pages are noindex", async ({ page }) => {
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });

  test("the homepage says what Jooma is, once, in its opening text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByTestId("hero-sub")).toContainText("Jooma");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", SITE_DESCRIPTION);
  });

  test("the homepage has a wide social card and no inherited og:url", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");

    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toBeTruthy();
    // The tag is absolute on www.jooma.ai; fetch the same path from this server.
    const res = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("other pages no longer claim to be the homepage", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
    await expect(page).toHaveTitle("Contact us | Jooma");
  });

  test("the title template does not say Jooma twice", async ({ page }) => {
    await page.goto("/terms");
    await expect(page).toHaveTitle("Terms of Service | Jooma");
  });

  test("the closing banner and FAQ state the real free offer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Five free resources a month/)).toHaveCount(0);
    await expect(page.getByText("Try it free on this page, three times a day.", { exact: false })).toBeVisible();
    await expect(page.locator("summary", { hasText: "Is Jooma free to try?" })).toHaveCount(1);
  });

  test("the footer's refunds link goes to a page that exists", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: "Refunds and cancellation" });
    await expect(link).toHaveAttribute("href", "/terms#payment");
  });

  test("off production, robots.txt keeps every crawler out", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/Disallow: \/\s*$/m);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("the homepage publishes one graph: organisation, site, app and FAQ", async ({ page }) => {
    await page.goto("/");
    const scripts = page.locator('script[type="application/ld+json"]');
    await expect(scripts).toHaveCount(1);
    const data = JSON.parse((await scripts.textContent()) ?? "{}");
    const types = (data["@graph"] as { "@type": string }[]).map((n) => n["@type"]);
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
  });

  test("/llms.txt reaches a signed-out crawler as plain text", async ({ request }) => {
    const res = await request.get("/llms.txt", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
    expect(await res.text()).toMatch(/^# Jooma/);
  });

  test("the homepage loads small theme backgrounds, not the full PNGs", async ({ page }) => {
    const scenes: string[] = [];
    page.on("request", (r) => {
      const path = new URL(r.url()).pathname;
      if (path.startsWith("/scenes/")) scenes.push(path);
    });
    await page.goto("/");
    await page.waitForTimeout(1500);
    // Only thumbnails, if the showcase has any themed decks at all.
    for (const path of scenes) expect(path).toMatch(/^\/scenes\/thumbs\/.+\.webp$/);
  });

  test("only the faces the marketing page renders first are preloaded", async ({ page }) => {
    await page.goto("/");
    // Plus Jakarta and Bricolage. It was nine files when every slide theme
    // font was preloaded too.
    expect(await page.locator('link[rel="preload"][as="font"]').count()).toBeLessThanOrEqual(4);
  });

  test("the manifest is served, not bounced to /login", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect((await res.json()).name).toBe("Jooma");
  });
});
