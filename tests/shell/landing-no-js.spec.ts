import { test, expect } from "@playwright/test";

/*
 * The homepage with JavaScript switched off.
 *
 * Every section sits in a Reveal wrapper that starts at opacity 0 and waits for
 * an IntersectionObserver to fade it in. With no JavaScript that observer never
 * runs, so the sections were in the markup but painted invisible. The
 * `scripting: none` rule in Reveal.module.css shows them straight away.
 */

test.use({ javaScriptEnabled: false });

test("sections are visible without JavaScript", async ({ page }) => {
  await page.goto("/");
  const faqHeading = page.getByRole("heading", { name: "Questions teachers ask about Jooma" });
  await faqHeading.scrollIntoViewIfNeeded();
  const opacity = await faqHeading.evaluate((el) => {
    // The Reveal wrapper is an ancestor; check what is actually painted.
    let node: HTMLElement | null = el as HTMLElement;
    let min = 1;
    while (node) {
      min = Math.min(min, Number(getComputedStyle(node).opacity));
      node = node.parentElement;
    }
    return min;
  });
  expect(opacity).toBe(1);
});
