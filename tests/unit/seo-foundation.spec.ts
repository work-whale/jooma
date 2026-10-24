import { test, expect } from "@playwright/test";
import { isIndexable } from "@/app/lib/seo/indexable";
import { BRAND_DEFINITION, SITE_DESCRIPTION } from "@/app/lib/seo/brand";
import { faqQuestions, inWords } from "@/app/lib/landing/faq";
import { FREE_TRIES_PER_DAY } from "@/app/lib/trial-limits";
import { TRIAL_DAYS } from "@/app/lib/plans";
import { planCardPrice } from "@/app/lib/plan-copy";

/*
 * The facts the public site states about itself.
 *
 * Search engines and assistants quote these, so a wrong one is repeated
 * somewhere we cannot correct it. The site used to promise "five free
 * resources a month" a year after the free plan was retired, and to say staging
 * could be indexed by never saying it could not.
 */

test("only production may be indexed", () => {
  expect(isIndexable("production")).toBe(true);
  expect(isIndexable("preview")).toBe(false);
  expect(isIndexable("development")).toBe(false);
  expect(isIndexable(undefined)).toBe(false);
});

test("the meta description fits where Google cuts it", () => {
  expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
});

test("the brand lines say who it is for and what it makes", () => {
  for (const line of [SITE_DESCRIPTION, BRAND_DEFINITION]) {
    expect(line).toMatch(/UK teachers/);
    expect(line).toMatch(/slides/);
  }
});

test("the FAQ states the free offer the product gives", () => {
  const free = faqQuestions().find((f) => f.q === "Is Jooma free to try?");
  expect(free).toBeDefined();
  expect(free!.a).toContain(`${inWords(FREE_TRIES_PER_DAY)} times a day`);
  expect(free!.a).toContain(`${inWords(TRIAL_DAYS)} days free`);
  expect(free!.a).not.toMatch(/a month/);
});

test("the FAQ quotes prices from the plans, not typed figures", () => {
  const cost = faqQuestions().find((f) => f.q === "How much does Jooma cost?");
  expect(cost).toBeDefined();
  for (const plan of ["standard", "pro", "max"] as const) {
    expect(cost!.a).toContain(planCardPrice(plan));
  }
});

test("the FAQ says where data is stored, and the same place privacy does", () => {
  const data = faqQuestions().find((f) => f.q === "Is pupil data safe?");
  expect(data!.a).toContain("stored in the UK, in London");
});

test("no FAQ question appears twice", () => {
  const qs = faqQuestions().map((f) => f.q);
  expect(new Set(qs).size).toBe(qs.length);
});

test("small numbers are written the way the page writes them", () => {
  expect(inWords(3)).toBe("three");
  expect(inWords(12)).toBe("12");
});
