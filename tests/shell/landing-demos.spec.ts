import { test, expect, type Page } from "@playwright/test";

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
 *   2. The sample outputs were hand-written placeholders, and two of them
 *      advertised things the product does not do: a reading-age switcher on
 *      comprehension, and per-attainment-band worksheet columns. The demos now
 *      carry real captured output, so these assert the STRUCTURES the real
 *      generators emit. If someone swaps in fresh captures the wording changes
 *      and these still pass; if someone reintroduces a fake shape, they fail.
 */

/** Open the hero demo on one tab and wait for the stream to settle. */
async function openTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("tab", { name }).click();
  const pane = page.getByRole("tabpanel");
  await expect(pane).toBeVisible();
  // The output is on screen throughout; aria-busy is what marks it as still
  // arriving, exactly as the product's results panel does.
  await expect(pane.locator("[aria-busy=false]")).toBeVisible({ timeout: 15_000 });
}

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

  /* ── The demos show real product output ───────────────────────────────── */

  test("the slides demo shows a real slide, with a sub-hook and a callout", async ({ page }) => {
    await openTab(page, /^Slides$/);
    const pane = page.getByRole("tabpanel");

    // A sub-hook under the title, which every real content slide carries.
    await expect(pane.getByText("What makes puddles disappear?")).toBeVisible();

    // A real callout label. "Quick check" is NOT one: it only ever existed in
    // the hidden legacy lesson-slideshow prompt, and the placeholder used it.
    await expect(pane.getByText(/^(Key point|Remember|Fun fact)$/)).toBeVisible();
    await expect(pane.getByText("Quick check")).toHaveCount(0);

    // Bullets lead with a bold term, which the slide prompt mandates.
    await expect(pane.locator("li b").first()).toBeVisible();
    // And the markers are parsed, never printed raw.
    await expect(pane.getByText("**")).toHaveCount(0);
  });

  test("the comprehension demo pitches by complexity, not by reading age", async ({ page }) => {
    await openTab(page, /^Comprehension$/);
    const pane = page.getByRole("tabpanel");

    // The real control. The tool has no reading age, and the page must not
    // claim one.
    await expect(pane.getByRole("group", { name: /complexity/i })).toBeVisible();
    await expect(pane.getByText(/reading age/i)).toHaveCount(0);

    // Questions carry their DfE content domain and their marks, as real output
    // does. Domain codes are 2a-2h at KS2.
    await expect(pane.getByText(/^2[a-h] /).first()).toBeVisible();
    await expect(pane.getByText(/^\[\d+ marks?\]$/).first()).toBeVisible();

    // Switching really swaps the passage: each level is its own generation.
    const title = pane.locator("h4").first();
    const simple = await title.innerText();
    await pane.getByRole("button", { name: /^Challenging/ }).click();
    await expect(title).not.toHaveText(simple);
  });

  test("the worksheet demo is one sectioned document, not per-band columns", async ({ page }) => {
    await openTab(page, /^Worksheets$/);
    const pane = page.getByRole("tabpanel");

    // Bloom's-progressive sections, which is what the generator emits.
    await expect(pane.getByText(/^Section A/)).toBeVisible();
    await expect(pane.getByText(/^Section D/)).toBeVisible();

    // The attainment bands the placeholder invented as columns. The generator
    // is explicitly told NOT to split differentiation this way.
    await expect(pane.getByText(/^Working towards$/)).toHaveCount(0);
    await expect(pane.getByText(/^Greater depth$/)).toHaveCount(0);

    // The header the real worksheet prints.
    await expect(pane.getByText(/I am learning to/)).toBeVisible();
  });

  /* ── The wait looks like the product's ────────────────────────────────── */

  test("generating shows the results panel, not an invented build sequence", async ({ page }) => {
    // The panel is titled and on screen from the first moment, with the
    // spinner inside it — which is how a real generation looks.
    await expect(page.getByText("My results")).toBeVisible();
    await expect(page.getByText("Generating…")).toBeVisible();

    // The five-step splash that used to stand in for it existed nowhere in the
    // app. None of its steps may come back.
    await expect(page.getByText("Building your lesson")).toHaveCount(0);
    await expect(page.getByText("Checking the national curriculum")).toHaveCount(0);
    await expect(page.getByText("Differentiating three ways")).toHaveCount(0);

    // And the output settles.
    await expect(page.getByText("Generating…")).toBeHidden({ timeout: 15_000 });
  });

  /* ── The chips really change the output ───────────────────────────────── */

  test("each suggestion chip returns its own generation", async ({ page }) => {
    await openTab(page, /^Slides$/);
    const pane = page.getByRole("tabpanel");
    const title = pane.locator("h4").first();

    const first = await title.innerText();

    // Every chip is a different topic, year group and subject, so every one
    // must bring back a different slide. A chip that changed nothing would be
    // a promise the page does not keep.
    const seen = new Set([first]);
    for (const chip of ["Equivalent fractions, Year 4", "Ancient Egypt, Year 5", "Persuasive writing, Year 6"]) {
      await page.getByRole("button", { name: chip }).click();
      await expect(pane.locator("[aria-busy=false]")).toBeVisible({ timeout: 15_000 });
      const next = await title.innerText();
      expect(seen.has(next)).toBe(false);
      seen.add(next);
    }
  });

  test("a chip changes the worksheet's subject too, not just the slide", async ({ page }) => {
    await openTab(page, /^Worksheets$/);
    const pane = page.getByRole("tabpanel");

    await expect(pane.getByText(/Year 4 \| Science/)).toBeVisible();

    await page.getByRole("button", { name: "Ancient Egypt, Year 5" }).click();
    await expect(pane.locator("[aria-busy=false]")).toBeVisible({ timeout: 15_000 });

    // A different year group AND a different subject: the whole request
    // changed, not just the words on one card.
    await expect(pane.getByText(/Year 5 \| History/)).toBeVisible();
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
