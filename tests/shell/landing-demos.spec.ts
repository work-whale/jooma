import { test, expect } from "@playwright/test";

/*
 * The landing page: the closing CTA, and the demo output.
 *
 * No fixture teacher and no sign-in: this is the signed-out marketing page,
 * which is the whole point of it. That also keeps these fast.
 *
 * Two defects are pinned here.
 *
 *   1. The closing CTA headline rendered BLACK and sat off-centre. One cause
 *      for both: `.page h1..h4` in landing.module.css tied on specificity with
 *      `.close h2` and won on source order, taking the colour AND killing the
 *      `margin: 0 auto` that centres a 17ch block. Hence two assertions below,
 *      not one — a future regression could bring back either half alone.
 *
 *   2. (Retired 2026-11-18.) The hero used to carry demo output; since
 *      b5073cf (5 Oct) it sends visitors to a real free try instead, so the
 *      demo-structure tests were removed. Originally: the sample outputs were hand-written placeholders, and two of them
 *      advertised things the product does not do: a reading-age switcher on
 *      comprehension, and per-attainment-band worksheet columns. The demos now
 *      carry real captured output, so these assert the STRUCTURES the real
 *      generators emit. If someone swaps in fresh captures the wording changes
 *      and these still pass; if someone reintroduces a fake shape, they fail.
 */

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  /* ── The closing CTA ──────────────────────────────────────────────────── */

  test("the closing call to action is white and centred on its card", async ({ page }) => {
    const heading = page.getByRole("heading", { name: /evenings back/i });
    await heading.scrollIntoViewIfNeeded();
    // The card fades in on scroll; judging colour mid-fade reads the wrong value.
    await expect(heading).toBeVisible();

    const probe = await heading.evaluate((el) => {
      const card = el.closest("section") as HTMLElement;
      const h = el.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        colour: getComputedStyle(el).color,
        cardBackground: getComputedStyle(card).backgroundColor,
        // Distance between the headline's centre and the card's centre. The
        // bug parked the headline hard left, so this was ~100px, not ~0.
        centreOffset: Math.abs(h.left + h.width / 2 - (c.left + c.width / 2)),
      };
    });

    // White on the deep purple card, not --j-ink (#1D1730).
    expect(probe.colour).toBe("rgb(255, 255, 255)");
    expect(probe.cardBackground).toBe("rgb(58, 28, 143)");
    expect(probe.centreOffset).toBeLessThan(2);
  });

  /* ── Copy that used to overclaim ──────────────────────────────────────── */

  test("the page does not advertise features the product lacks", async ({ page }) => {
    const body = page.locator("body");

    // Comprehension has no reading age anywhere in the product.
    await expect(body).not.toContainText("Any reading age from five to sixteen");

    // Jo has no memory of previous lessons: its history is the current thread.
    await expect(body).not.toContainText("Knows what you taught last week");
  });
});
