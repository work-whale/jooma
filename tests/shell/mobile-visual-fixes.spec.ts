import { test, expect, type Locator, type Page } from "@playwright/test";
import { createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The landing page and guest tools on a phone, a Galaxy Fold and a desktop.
 *
 *   - the header is purple at every scroll position, with a shadow once the
 *     page moves, and on a phone its links and account sit behind a menu
 *   - the Fold's cover screen (280 and 344px) and its open screen (884px) do
 *     not scroll sideways
 *   - the hero's box and idea pills are phone sized, and Made with Jooma is
 *     stacked down the page rather than a sideways carousel
 *   - a field's label is never covered by its own box (regression: Tailwind 4's
 *     space-y moved the gap onto each child's bottom margin, so the negative
 *     margins written for Tailwind 3 pulled the boxes up over their labels)
 *   - the theme picker's text sits at the top of every tab and card
 *   - a guest worksheet has the editing buttons, Design opens as a sidebar,
 *     and differentiation is behind sign up on a free try
 *
 * Every /api/try call is stubbed: nothing reaches a model, nothing is spent.
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const TRIAL_ID = "33333333-4444-4555-8666-777777777777";

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function box(el: Locator) {
  const b = await el.boundingBox();
  expect(b, "element has no box").not.toBeNull();
  return b!;
}

/** The label's bottom edge is at or above the top edge of the box it names. */
async function expectLabelClear(label: Locator, field: Locator) {
  await expect(label).toBeVisible(NAV);
  await expect(field).toBeVisible(NAV);
  const l = await box(label);
  const f = await box(field);
  expect(l.y + l.height, "the box overlaps its label").toBeLessThanOrEqual(f.y + 0.5);
}

async function headerLook(page: Page) {
  return page.locator("[data-landing-nav]").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { image: cs.backgroundImage, shadow: cs.boxShadow };
  });
}

test.describe("the landing header", () => {
  test("purple with a shadow once scrolled, on a desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-landing-nav]")).toBeVisible(NAV);
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect.poll(async () => (await headerLook(page)).image).toContain("rgb(74, 34, 181)");
    expect((await headerLook(page)).shadow).not.toBe("none");
    // The wordmark is white on it.
    await expect(page.locator("[data-landing-nav] a[aria-label='Jooma']")).toHaveCSS("color", "rgb(255, 255, 255)");
    // The desktop bar has no menu button.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
  });

  test.describe("on a phone", () => {
    test.use(PHONE);

    test("one row, purple once scrolled, with the links and account behind a menu", async ({ page }) => {
      await page.goto("/");
      const nav = page.locator("[data-landing-nav]");
      await expect(nav).toBeVisible(NAV);
      expect((await box(nav)).height).toBeLessThanOrEqual(64.5);

      // Nothing but the wordmark and the menu button in the bar.
      await expect(nav.getByRole("link", { name: "Log in" })).toBeHidden();
      await expect(nav.getByRole("link", { name: "Pricing" })).toBeHidden();

      await page.evaluate(() => window.scrollTo(0, 2000));
      await expect.poll(async () => (await headerLook(page)).image).toContain("rgb(74, 34, 181)");
      expect((await headerLook(page)).shadow).not.toBe("none");
      // Still pinned to the top.
      expect(Math.abs((await box(nav)).y)).toBeLessThan(1);

      const toggle = page.getByRole("button", { name: "Open menu" });
      await toggle.click();
      const menu = page.locator("#landing-menu");
      await expect(menu).toBeVisible();
      await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
      for (const name of ["Try it free", "Tools", "Pricing", "Schools", "Log in", "Start free"]) {
        const link = menu.getByRole("link", { name, exact: true });
        await expect(link).toBeVisible();
        // Half a pixel of slack: measured mid slide-in, 48 can read as 47.99998.
        expect((await box(link)).height, `${name} is too small to tap`).toBeGreaterThanOrEqual(47.5);
      }

      // Escape closes it and hands focus back to the button.
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();

      // A link closes it as it goes.
      await page.getByRole("button", { name: "Open menu" }).click();
      await menu.getByRole("link", { name: "Pricing" }).click();
      await expect(menu).toBeHidden();
      await expect(page).toHaveURL(/#pricing$/);
    });

    test("the account is in the menu when signed in", async ({ page }) => {
      let teacher: TestTeacher | null = null;
      try {
        teacher = await createTeacher("Rowan");
        await signIn(page, teacher);
        await page.goto("/");
        await page.getByRole("button", { name: "Open menu" }).click(NAV);
        const account = page.getByTestId("nav-account-list");
        await expect(account).toBeVisible();
        await expect(account.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/tools");
        await expect(account.getByRole("link", { name: "Usage & Billing" })).toBeVisible();
        await expect(account.getByRole("button", { name: "Sign out" })).toBeVisible();
      } finally {
        await deleteTeacher(teacher);
      }
    });
  });
});

test.describe("the Galaxy Fold", () => {
  for (const [label, width, height] of [
    ["cover screen, first generation", 280, 653],
    ["cover screen", 344, 882],
    ["open", 884, 1104],
  ] as const) {
    test(`${label} (${width}px): the landing page and /create do not scroll sideways`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 861, hasTouch: true });
      const page = await ctx.newPage();
      try {
        for (const path of ["/", "/create?tool=slides"]) {
          await page.goto(path, NAV);
          await page.waitForLoadState("load");
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(sw, `${path} is ${sw}px wide on a ${width}px screen`).toBeLessThanOrEqual(width);
        }
        await page.goto("/");
        // The hero's box and its Create button both fit inside the screen.
        const create = page.getByRole("link", { name: /^Create/ });
        const c = await box(create);
        expect(c.x + c.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: `test-results/fold-${width}.png` });
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe("the hero on a phone", () => {
  test.use(PHONE);

  test("the box and the idea pills are phone sized", async ({ page }) => {
    await page.goto("/");
    const create = page.getByRole("link", { name: /^Create/ });
    await expect(create).toBeVisible(NAV);
    // Down from 50px, and still 44px to tap.
    const c = await box(create);
    expect(c.height).toBeGreaterThanOrEqual(44);
    expect(c.height).toBeLessThanOrEqual(46);
    const form = page.locator("form").filter({ has: page.getByLabel("What are you teaching?") });
    expect((await box(form)).height).toBeLessThanOrEqual(56);
    // Smaller type and padding than the 0.89rem, 9px pills they were.
    const pill = page.getByRole("button", { name: /Year \d/ }).first();
    expect(parseFloat(await pill.evaluate((el) => getComputedStyle(el).fontSize))).toBeLessThanOrEqual(13);
    expect(parseFloat(await pill.evaluate((el) => getComputedStyle(el).paddingTop))).toBeLessThanOrEqual(6);
    // Split down the middle: the tool in the left half, the idea in the right
    // half, both left aligned.
    const halves = await pill.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const [tool, text] = Array.from(el.children).map((c) => c.getBoundingClientRect());
      return { mid: r.left + r.width / 2, toolLeft: tool.left - r.left, toolRight: tool.right, textLeft: text.left, textRight: r.right - text.right, align: getComputedStyle(el.children[1]).textAlign };
    });
    expect(halves.toolRight).toBeLessThanOrEqual(halves.mid + 1);
    expect(halves.textLeft).toBeGreaterThanOrEqual(halves.mid - 6);
    expect(halves.align).toBe("left");
    // The field stays 16px, or iOS zooms into it.
    await expect(page.getByLabel("What are you teaching?")).toHaveCSS("font-size", "16px");
  });

  test("Made with Jooma is stacked down the page, not a sideways carousel", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator('a[href^="/made/"]');
    test.skip((await cards.count()) < 2, "fewer than two shared resources on this database");
    const first = await box(cards.nth(0));
    const second = await box(cards.nth(1));
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    expect(Math.abs(second.x - first.x)).toBeLessThan(1);
    // Every card fits inside the screen.
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.x + first.width).toBeLessThanOrEqual(390);
  });
});

test.describe("labels are never covered by their boxes (regression)", () => {
  for (const [name, use] of [
    ["desktop", {}],
    ["phone", PHONE],
  ] as const) {
    test.describe(name, () => {
      test.use(use);

      test("the slides wizard's Topic", async ({ page }) => {
        await page.goto("/create?tool=slides");
        await expectLabelClear(page.locator('label[for="gen-topic"]'), page.locator("#gen-topic"));
      });
    });
  }

  test("Search slideshows, on the slides page", async ({ page }) => {
    let teacher: TestTeacher | null = null;
    try {
      teacher = await createTeacher("Sasha");
      await signIn(page, teacher);
      await page.goto("/tools/slideshow");
      await expectLabelClear(page.locator('label[for="slideshow-search"]'), page.locator("#slideshow-search"));
    } finally {
      await deleteTeacher(teacher);
    }
  });
});

test.describe("the theme picker on a phone", () => {
  test.use(PHONE);

  test("every tab's and card's text sits at the top", async ({ page }) => {
    await page.route("**/api/try/prefill", (route) =>
      route.fulfill({ json: { prefill: encodePrefill({ slug: "slideshow", fields: { topic: "Volcanoes", year: "Year 3" } }) } }),
    );
    await page.route("**/api/suggest-subject", (route) => route.fulfill({ json: { subject: "", strand: "", statementIds: [] } }));
    await page.goto(`/create?tool=slides&topic=${encodeURIComponent("Volcanoes, Year 3")}`);
    await expect(page.locator('input[name="lesson-topic"]')).toHaveValue("Volcanoes", NAV);
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    const picker = page.getByTestId("theme-picker");
    await expect(picker).toBeVisible();

    // The three family names share one top edge, whatever their descriptions.
    const tabTops = await picker
      .getByRole("tab")
      .evaluateAll((els) => els.map((e) => Math.round(e.querySelector("span")!.getBoundingClientRect().top)));
    expect(new Set(tabTops).size).toBe(1);

    // Two cards side by side: their names share a top edge too.
    const names = await picker.locator("[data-theme-id]").evaluateAll((els) =>
      els.slice(0, 2).map((e) => {
        const r = e.getBoundingClientRect();
        const name = e.querySelector("p")!.getBoundingClientRect();
        return { row: Math.round(r.top), name: Math.round(name.top) };
      }),
    );
    expect(names[0].row).toBe(names[1].row);
    expect(names[0].name).toBe(names[1].name);
    await page.screenshot({ path: "test-results/theme-picker-phone.png", fullPage: true });
  });
});

test.describe("a guest worksheet on a phone", () => {
  test.use(PHONE);

  async function stubWorksheet(page: Page) {
    await page.route("**/api/try/prefill", (route) =>
      route.fulfill({
        json: {
          prefill: encodePrefill({
            slug: "worksheet-generator",
            fields: {
              curriculum: "2014 National Curriculum",
              yearGroup: "Year 4",
              subject: "Maths",
              learningObjective: "To find equivalent fractions",
              // Jo cannot switch it on for a guest either.
              differentiate: "yes",
              differentiationLevels: ["WTS", "GDS"],
            },
          }),
        },
      }),
    );
    await page.route("**/api/try/jo**", (route) => route.fulfill({ json: { left: 3 } }));
    const sent: Record<string, unknown>[] = [];
    await page.route("**/api/try/worksheet", (route) => {
      sent.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "x-trial-id": TRIAL_ID },
        body: JSON.stringify({
          title: "Equivalent fractions",
          objective: "I am learning to find equivalent fractions.",
          intro: { variant: "fact", label: "", text: "", emoji: "" },
          sections: [
            {
              title: "Warm up",
              emoji: "🔥",
              instructions: "Circle the right answer.",
              blocks: [{ type: "mcq", prompt: "Which fraction is equal to 1/2?", options: ["2/4", "1/3", "3/4", "2/3"], answers: [0], marks: 1 }],
            },
          ],
          teacherNotes: [],
        }),
      });
    });
    await page.goto("/create?tool=ws&topic=Equivalent%20fractions%2C%20Year%204");
    await expect(page.locator("[data-jo-generate]")).toBeEnabled(NAV);
    // On a phone Jo's card waits behind a floating button, clear of the form.
    await expect(page.getByRole("button", { name: /^Jo filled this in/ })).toBeVisible();
    return sent;
  }

  test("differentiation is behind sign up on a free try", async ({ page }) => {
    const sent = await stubWorksheet(page);

    // Jo's "yes" was not applied, and choosing Yes asks them to sign up.
    const no = page.getByRole("radio", { name: "No" });
    await expect(no).toBeChecked();
    await expect(page.getByText("Sign up to use")).toBeVisible();
    await page.getByRole("radio", { name: "Yes" }).click();
    const gate = page.getByTestId("auth-gate");
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("Sign up free to differentiate");
    await expect(no).toBeChecked();
    await expect(page.getByText("Select the attainment bands")).toHaveCount(0);
    await gate.getByRole("button", { name: "Close" }).click();

    await page.locator("[data-jo-generate]").click();
    await expect(page.getByTestId("guest-result")).toContainText("Which fraction is equal to", NAV);
    expect(sent[0]).toMatchObject({ differentiate: "no", differentiationLevels: [] });
  });

  test("has undo, preview, and Design as a sidebar over the page", async ({ page }) => {
    await stubWorksheet(page);
    await page.locator("[data-jo-generate]").click();
    const result = page.getByTestId("guest-result");
    await expect(result).toContainText("Which fraction is equal to", NAV);

    await expect(result.getByRole("button", { name: "Undo" })).toBeDisabled();
    await expect(result.getByRole("button", { name: "Redo" })).toBeDisabled();

    // Design opens a sidebar on the right, outside the page's own flow, so
    // the result is exactly as tall as it was.
    const before = (await box(result)).height;
    await result.getByTestId("sheet-design-toggle").click();
    const drawer = page.getByTestId("sheet-design-drawer");
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    // Against the right edge once it has slid in.
    await expect.poll(async () => { const b = await box(drawer); return Math.round(b.x + b.width); }).toBe(390);
    const d = await box(drawer);
    expect(d.y).toBeLessThanOrEqual(0.5);
    // A few pixels at most, from the toolbar button changing state; the inline
    // panel used to add its whole height.
    expect(Math.abs((await box(result)).height - before)).toBeLessThan(40);
    await page.screenshot({ path: "test-results/guest-design-drawer-phone.png" });

    // A design change can be undone.
    const panel = page.getByTestId("sheet-design-panel");
    await panel.getByText("XL", { exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(result.getByRole("button", { name: "Undo" })).toBeEnabled();
    await result.getByRole("button", { name: "Undo" }).click();
    await expect(result.getByRole("button", { name: "Redo" })).toBeEnabled();

    // Preview turns editing off; Edit turns it back on.
    const sheet = result.locator("[data-mode]").first();
    await expect(sheet).toHaveAttribute("data-mode", "edit");
    await result.getByTestId("sheet-preview-toggle").click();
    await expect(sheet).toHaveAttribute("data-mode", "read");
    await result.getByTestId("sheet-preview-toggle").click();
    await expect(sheet).toHaveAttribute("data-mode", "edit");
  });
});

test.describe("the guest forms' option rows fit the screen (regression)", () => {
  /** Options that run past the row they sit in (into the card's edge, and on
   *  a narrower phone off the screen), or past the screen itself. */
  async function spilling(page: Page, names: string[]) {
    return page.evaluate((names) => {
      const out: string[] = [];
      for (const name of names) {
        const el = Array.from(document.querySelectorAll<HTMLElement>("button, label")).find(
          (e) => e.textContent?.trim() === name && e.getClientRects().length > 0,
        );
        if (!el) {
          out.push(`${name}: not found`);
          continue;
        }
        const row = el.parentElement!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (r.right > row.right + 0.5 || r.right > window.innerWidth) out.push(`${name}: ends at ${Math.round(r.right)}, row at ${Math.round(row.right)}`);
      }
      return out;
    }, names);
  }

  for (const width of [390, 360, 280]) {
    test(`Complexity and Output detail at ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      try {
        // No topic, so nothing is sent to Jo and the form opens straight away.
        await page.goto("/create?tool=comp", NAV);
        const complexity = page.getByRole("button", { name: "Challenging", exact: true });
        await expect(complexity).toBeVisible(NAV);
        expect(await spilling(page, ["Simple", "Standard", "Challenging"])).toEqual([]);

        await page.goto("/create?tool=ws", NAV);
        await expect(page.getByText("Condensed", { exact: true })).toBeVisible(NAV);
        expect(await spilling(page, ["Condensed", "Standard", "Detailed"])).toEqual([]);
        // And the Generate button stays inside the card on the Fold's cover.
        const gen = await box(page.locator("[data-jo-generate]"));
        expect(gen.x + gen.width).toBeLessThanOrEqual(width - 16);
        await page.screenshot({ path: `test-results/guest-worksheet-form-${width}.png`, fullPage: true });
      } finally {
        await ctx.close();
      }
    });
  }
});
