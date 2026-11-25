import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTACT_EMAIL } from "@/app/lib/seo/brand";

/*
 * The public /refunds page (docs/18-jooma-refund-policy.html, built into the
 * app). The page is static text, so these read the source, like
 * terms-v45.spec.ts does.
 *
 * What would go wrong if the page were wrong: the numbers on it drift from the
 * rules the admin console applies (the page says 14 days, the engine says 7),
 * the contact address is one nobody reads, or the terms go on saying refunds
 * are "at our discretion" next to a page that promises them.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const page = read("app/refunds/page.tsx");
const rail = read("app/refunds/RefundsRail.tsx");
const terms = read("app/terms/page.tsx");
const footer = read("app/components/landing/v2/SiteFooter.tsx");
const sitemap = read("app/sitemap.ts");
const access = read("app/lib/route-access.ts");

test("the numbers come from the code, so the page cannot drift from the rules", () => {
  // The page binds the shared constant to W once, so read it through that.
  expect(page).toContain("const W = REFUND_WINDOWS;");
  expect(page).toContain("W.coolingOffDays");
  expect(page).toContain("W.unwantedRenewalDays");
  expect(page).toContain("W.topUpDays");
  expect(page).toContain("TRIAL.days");
  expect(page).toContain("TRIAL.resources");
  expect(page).toContain("OFFER.firstMonthPrice");
});

test("no number of days is typed by hand, in digits or in words", () => {
  expect(page).not.toMatch(/\b(14|30|10)[ -]days?\b/i);
  // ("five to ten working days" is how long the bank takes, not one of our windows)
  expect(page).not.toMatch(/\b(fourteen|thirty|ten days?)\b/i);
  expect(page).not.toContain("3.99");
});

test("what the owner's markup said that is not true of this product is gone", () => {
  // The owner's markup said hello@jooma.ai; the read mailbox is the shared constant.
  expect(page).not.toContain("hello@jooma.ai");
  expect(page).toContain("CONTACT_EMAIL");
  expect(CONTACT_EMAIL).toBe("info@jooma.ai");
  // The trial is ten days, not a fortnight.
  expect(page).not.toMatch(/fortnight/i);
  // There is no app store app or in-app purchase.
  expect(page).not.toMatch(/app store/i);
  expect(page).not.toMatch(/apple/i);
});

test("every clause is there, with a number and an anchor the rail can find", () => {
  for (let n = 1; n <= 9; n++) {
    expect(page, `clause ${n}`).toContain(`id="c${n}"`);
  }
  expect(page).toContain('id="ask"');
  expect(page).toContain("Refunds and cancellations");
});

test("the metadata names the page and sets its canonical", () => {
  expect(page).toContain('title: "Refunds and cancellations"');
  expect(page).toContain('canonical: "/refunds"');
  expect(page).toContain("When Jooma gives your money back, how to ask, and how long it takes.");
});

test("last updated is the day the policy was written", () => {
  expect(page).toContain("26 November 2026");
});

test("the rail is a client component and watches the clauses", () => {
  expect(rail.startsWith('"use client"')).toBe(true);
  expect(rail).toContain("IntersectionObserver");
  expect(rail).toContain("-80px 0px -72% 0px");
});

test("no em or en dashes on the page or its rail", () => {
  expect(page).not.toMatch(/[–—]/);
  expect(rail).not.toMatch(/[–—]/);
});

test("the terms point at the page and no longer say refunds are at our discretion", () => {
  expect(terms).toContain('href="/refunds"');
  expect(terms).toContain("Refunds and cancellations");
  expect(terms).toContain("Nothing in it takes away your rights under law.");
  expect(terms).not.toMatch(/at our discretion/i);
  // The GBP and VAT sentence stays.
  expect(terms).toContain("All fees are quoted in GBP and are inclusive of VAT where applicable.");
  expect(terms).toContain("Last updated: 26 November 2026");
});

test("the footer, the sitemap and the public list know the page", () => {
  expect(footer).toContain('{ href: "/refunds", label: "Refunds and cancellation" }');
  expect(footer).not.toContain("/terms#payment");
  expect(sitemap).toContain("${base}/refunds");
  expect(access).toMatch(/"\/refunds",/);
});
