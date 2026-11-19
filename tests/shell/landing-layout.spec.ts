import { test, expect, type Page } from "@playwright/test";

/*
 * The landing page's layout, signed out: the header that follows the page down,
 * and the pricing table.
 *
 * The header test is a regression test. The page wrapper had overflow-x:
 * hidden, which quietly makes it a scroll container, and a sticky element
 * sticks to its nearest scroll container: the header pinned itself to a box
 * that never scrolls and was left behind with the rest of the page. So the
 * assertion is where the header actually IS after a scroll, not what its CSS
 * says: position: sticky was set the whole time it was broken.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(120_000);
const NAV = { timeout: 90_000 };

/** The header's top edge, in viewport pixels, after scrolling the page down. */
async function headerTopAfterScroll(page: Page, by: number): Promise<number> {
  const header = page.locator("header").first();
  await expect(header).toBeVisible(NAV);
  await page.evaluate((y) => window.scrollTo(0, y), by);
  // Something must actually have scrolled, or the test proves nothing.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const box = await header.boundingBox();
  return box!.y;
}

test.describe("the header follows the page down", () => {
  test("on the landing page", async ({ page }) => {
    await page.goto("/");
    expect(Math.abs(await headerTopAfterScroll(page, 3000))).toBeLessThan(1);
  });

  test("on /create, while the prompt is filled in", async ({ page }) => {
    // No topic, so nothing is sent to Jo: the form opens straight away.
    await page.goto("/create?tool=slides");
    await expect(page.getByRole("heading", { name: "Make a deck, free" })).toBeVisible(NAV);
    expect(Math.abs(await headerTopAfterScroll(page, 600))).toBeLessThan(1);
  });
});

test.describe("pricing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#pricing");
    await expect(page.locator("#pricing")).toBeVisible(NAV);
  });

  /** A plan's card: the element its name sits directly in. */
  function card(page: Page, name: string) {
    return page.locator("#pricing").getByRole("heading", { name, exact: true }).locator("..");
  }

  test("three plans in a row, and Schools on its own underneath", async ({ page }) => {
    await expect(card(page, "Max")).toBeVisible();
    await expect(page.locator("#schools").getByRole("heading", { name: "Schools" })).toBeVisible();

    // Measured in one go, once the page has stopped moving: the jump to
    // #pricing scrolls smoothly, and boxes read one at a time mid scroll each
    // come from a different moment.
    const measure = () =>
      page.evaluate(() => {
        const box = (el: Element | null | undefined) => {
          const r = el!.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, width: r.width };
        };
        const headings = [...document.querySelectorAll("#pricing h3")];
        const plans = ["Standard", "Pro", "Max"].map((n) =>
          box(headings.find((h) => h.textContent?.trim() === n)?.parentElement),
        );
        return { scrollY: window.scrollY, plans, schools: box(document.querySelector("#schools")) };
      });
    let last = await measure();
    await expect
      .poll(async () => {
        const now = await measure();
        const settled = now.scrollY === last.scrollY;
        last = now;
        return settled;
      })
      .toBe(true);
    const { plans, schools } = last;

    // One row: the three cards share a top edge.
    const tops = plans.map((b) => Math.round(b.top));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);

    // Schools is below all three, and wider than any one of them.
    expect(schools.top).toBeGreaterThanOrEqual(Math.max(...plans.map((b) => b.bottom)));
    expect(schools.width).toBeGreaterThan(Math.max(...plans.map((b) => b.width)) * 2);

    const band = page.locator("#schools");

    await expect(band.getByRole("link", { name: "Talk to us" })).toHaveAttribute(
      "href",
      "/contact?type=school",
    );
  });

  test("a yearly card leads with its monthly figure, the yearly total under it", async ({ page }) => {
    // The table opens on monthly; the radio itself is visually hidden.
    await page.locator('#pricing label[data-option="year"]').click();
    const standard = card(page, "Standard");
    await expect(standard.getByText("£3.99", { exact: true })).toBeVisible();
    await expect(standard.getByText("a month", { exact: true })).toBeVisible();
    await expect(standard.getByText("£47.99 billed yearly")).toBeVisible();

    await expect(card(page, "Pro").getByText("£5.99", { exact: true })).toBeVisible();
    await expect(card(page, "Max").getByText("£11.99", { exact: true })).toBeVisible();
  });

  test("monthly shows the monthly price, with the yearly option under it (Step 4.5)", async ({ page }) => {
    // The table opens on monthly, so no click is needed.
    const standard = card(page, "Standard");
    await expect(standard.getByText("£4.99", { exact: true })).toBeVisible();
    await expect(standard.getByText(/billed yearly/)).toHaveCount(0);
    await expect(card(page, "Pro").getByText("or £71.99 a year, £5.99 a month")).toBeVisible();
    await expect(card(page, "Max").getByText("£13.99", { exact: true })).toBeVisible();
  });

  test("four plans, each with the spec's button, the same at either interval", async ({ page }) => {
    const pricing = page.locator("#pricing");
    const expected = ["Start free", "Choose Standard", "Choose Pro", "Choose Max"];
    for (const interval of ["month", "year", "month"]) {
      await page.locator(`#pricing label[data-option="${interval}"]`).click();
      for (const name of expected) {
        await expect(pricing.getByRole("button", { name, exact: true })).toHaveCount(1);
      }
      await expect(pricing.locator("article").getByRole("button")).toHaveCount(4);
    }
    // No trace of the old three-day trial.
    await expect(pricing.getByText(/free trial|3 days|three days/i)).toHaveCount(0);
  });

  test("only Pro is Recommended", async ({ page }) => {
    const pricing = page.locator("#pricing");
    await expect(pricing.getByText("Recommended", { exact: true })).toHaveCount(1);
    await expect(card(page, "Pro").getByText("Recommended", { exact: true })).toBeVisible();
  });

  test("each card's button sits under its price, above its features; all but Pro line up", async ({ page }) => {
    for (const interval of ["month", "year"]) {
      await page.locator(`#pricing label[data-option="${interval}"]`).click();
      // Let the reveal and any note row settle before measuring.
      await page.waitForTimeout(600);
      // Measured in one pass, in page coordinates: the page may still be
      // smooth scrolling to #pricing.
      const cards = await page.locator("#pricing").evaluate((section) => {
        const top = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : NaN);
        return [...section.querySelectorAll("article")].map((c) => ({
          plan: c.getAttribute("data-plan"),
          price: top(c.querySelector("h3 ~ p")),
          button: top(c.querySelector("button")),
          firstFeature: top(c.querySelector("li")),
        }));
      });

      expect(cards).toHaveLength(4);
      for (const c of cards) {
        expect(c.button).toBeGreaterThan(c.price);
        expect(c.firstFeature).toBeGreaterThan(c.button);
      }
      // Screenshot 2: Free, Standard and Max line up; Pro's badge puts its
      // button lower, which is the design, not drift.
      const tops = cards.filter((c) => c.plan !== "pro").map((c) => Math.round(c.button));
      expect(tops).toHaveLength(3);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
      const pro = cards.find((c) => c.plan === "pro")!;
      expect(pro.button).toBeGreaterThan(Math.max(...tops));
    }
  });
});
