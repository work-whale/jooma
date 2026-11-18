import { test, expect } from "@playwright/test";
import { pricingCards, PRICING_HEADLINE, maxYearlySaving } from "@/app/lib/pricing-view";

/*
 * The four pricing cards as drawn in screenshot 2, with the owner's red notes:
 * Standard exports are clean (the screenshot marks them), and Max has no
 * "Priority building".
 *
 * Edge cases: Pro is the one dark "Recommended" card; Free and Standard show
 * their missing features as locked rows rather than leaving them out; picture
 * rows are their own kind (orange); the monthly note is the spec's "or £71.99
 * a year, £5.99 a month", and yearly shows the per-month figure with the
 * yearly total; Free never shows a yearly line; no card mentions "credits",
 * "AI" or a dash.
 */

test("four cards in desktop order, Pro recommended", () => {
  const cards = pricingCards("month");
  expect(cards.map((c) => c.id)).toEqual(["free", "standard", "pro", "max"]);
  expect(cards.filter((c) => c.highlight).map((c) => c.id)).toEqual(["pro"]);
  expect(cards.find((c) => c.id === "pro")!.badge).toBe("Recommended");
});

test("prices and notes, monthly", () => {
  const [free, standard, pro, max] = pricingCards("month");
  expect([free.price, standard.price, pro.price, max.price]).toEqual(["£0", "£4.99", "£7.99", "£13.99"]);
  expect(free.note).toBe("No card, no end date");
  expect(pro.note).toBe("or £71.99 a year, £5.99 a month");
  expect(max.note).toBe("or £143.99 a year, £11.99 a month");
});

test("prices and notes, yearly", () => {
  const [free, standard, pro] = pricingCards("year");
  expect(free.price).toBe("£0");
  expect(free.note).toBe("No card, no end date");
  expect(standard.price).toBe("£3.99");
  expect(pro.price).toBe("£5.99");
  expect(pro.note).toBe("£71.99 billed yearly");
});

test("buttons", () => {
  expect(pricingCards("month").map((c) => c.cta)).toEqual(["Start free", "Choose Standard", "Choose Pro", "Choose Max"]);
});

test("Free: what it has, and what it does not as locked rows", () => {
  const free = pricingCards("month")[0];
  expect(free.features.filter((f) => f.kind === "on").map((f) => f.text)).toEqual([
    "50 resources a week, refilled every Sunday",
    "All 35 tools, nothing held back",
    "Full curriculum alignment",
    "10 refines a week with Jo",
  ]);
  expect(free.features.filter((f) => f.kind === "off").map((f) => f.text)).toEqual([
    "Jooma mark on exports",
    "No picture slides",
  ]);
});

test("Standard is clean (red note) but has no picture slides", () => {
  const standard = pricingCards("month")[1];
  const texts = standard.features.map((f) => f.text);
  expect(texts).toContain("Clean exports, no Jooma mark");
  expect(texts).not.toContain("Jooma mark on exports");
  expect(standard.features.find((f) => f.text === "No picture slides")?.kind).toBe("off");
});

test("Pro and Max have picture slides as an orange row; Max has no priority building", () => {
  const [, , pro, max] = pricingCards("month");
  expect(pro.features.find((f) => f.kind === "pic")?.text).toBe("Picture slides in your decks");
  expect(max.features.map((f) => f.text)).toEqual([
    "2,500 resources a month",
    "Picture slides in your decks",
    "Everything in Pro",
  ]);
});

test("the headline and the toggle saving", () => {
  expect(PRICING_HEADLINE).toBe("Start with ten days of Pro. No card, nothing to cancel.");
  expect(maxYearlySaving()).toBe(25);
});

test("no credits, AI or dashes anywhere", () => {
  const text = JSON.stringify([pricingCards("month"), pricingCards("year"), PRICING_HEADLINE]);
  expect(text).not.toMatch(/credits|\bAI\b|[–—]/);
});
