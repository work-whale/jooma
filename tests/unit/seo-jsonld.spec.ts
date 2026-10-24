import { test, expect } from "@playwright/test";
import {
  faqPage,
  graph,
  offers,
  organization,
  softwareApplication,
  toScript,
  website,
  ORG_ID,
} from "@/app/lib/seo/jsonld";
import { faqQuestions } from "@/app/lib/landing/faq";
import { PLANS } from "@/app/lib/plans";
import { V2_TOOLS } from "@/app/lib/tools";
import { BRAND_DEFINITION, LEGAL_NAME, SAME_AS } from "@/app/lib/seo/brand";
import robots from "@/app/robots";
import { GET as llmsTxt } from "@/app/llms.txt/route";

/*
 * The machine-readable layer: the homepage's structured data, robots.txt as
 * production serves it, and /llms.txt.
 *
 * Nobody looks at any of these in a browser, so a wrong price or a dropped tool
 * would sit there unnoticed while search engines and assistants repeat it.
 * Every figure here is checked against the source the visible page uses.
 */

test.describe("structured data", () => {
  test("the organisation is described, and empty fields are left out", () => {
    const org = organization();
    expect(org["@id"]).toBe(ORG_ID);
    expect(org.description).toBe(BRAND_DEFINITION);
    // Only a registered name, and only once it is confirmed.
    if (LEGAL_NAME) expect(org.legalName).toBe(LEGAL_NAME);
    else expect(org).not.toHaveProperty("legalName");
    expect(org.sameAs).toEqual(SAME_AS);
    // No company number yet, so no identifier at all rather than a blank one.
    expect(org).not.toHaveProperty("identifier");
  });

  test("profile links carry no tracking or language parameters", () => {
    for (const url of SAME_AS) {
      expect(url).toMatch(/^https:\/\//);
      expect(url).not.toMatch(/[?&](hl|utm_[a-z]+|fbclid|igsh)=/);
    }
  });

  test("every offer is priced from PLANS, in pounds", () => {
    const list = offers();
    for (const id of ["standard", "pro", "max"] as const) {
      const plan = PLANS[id];
      const prices = list.map((o) => o.price);
      expect(prices).toContain(plan.priceMonthly!.toFixed(2));
      if (plan.priceYearly) expect(prices).toContain(plan.priceYearly.toFixed(2));
    }
    for (const o of list) expect(o.priceCurrency).toBe("GBP");
  });

  test("the app lists every tool by its searchable name, and claims no rating", () => {
    const app = softwareApplication();
    expect(app.featureList).toEqual(V2_TOOLS.map((t) => t.label));
    expect(app.featureList).toContain("Report Writer");
    // There are no reviews. A self-written rating is spam to Google.
    expect(app).not.toHaveProperty("aggregateRating");
  });

  test("the FAQ markup is the FAQ the page shows", () => {
    const page = faqQuestions();
    const markup = faqPage(page).mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(markup.map((q) => q.name)).toEqual(page.map((q) => q.q));
    expect(markup.map((q) => q.acceptedAnswer.text)).toEqual(page.map((q) => q.a));
  });

  test("the graph points every node at one organisation", () => {
    const doc = graph([organization(), website(), softwareApplication()]);
    const nodes = doc["@graph"] as Record<string, unknown>[];
    expect((nodes[1].publisher as { "@id": string })["@id"]).toBe(ORG_ID);
    expect((nodes[2].publisher as { "@id": string })["@id"]).toBe(ORG_ID);
  });

  test("a string in the data cannot close the script tag", () => {
    const out = toScript({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).text).toBe("</script><script>alert(1)</script>");
  });
});

test.describe("robots.txt in production", () => {
  const before = process.env.VERCEL_ENV;
  test.beforeEach(() => {
    process.env.VERCEL_ENV = "production";
  });
  test.afterEach(() => {
    process.env.VERCEL_ENV = before;
  });

  test("the assistants' crawlers get the same rules as everyone, by name", () => {
    const rules = robots().rules as { userAgent: string | string[]; disallow: string[] }[];
    expect(rules).toHaveLength(2);
    const [everyone, assistants] = rules;
    expect(assistants.userAgent).toEqual(expect.arrayContaining(["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot"]));
    expect(assistants.disallow).toEqual(everyone.disallow);
  });

  test("the sign-in pages stay fetchable, so their noindex can be seen", () => {
    const [everyone] = robots().rules as { disallow: string[] }[];
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      expect(everyone.disallow).not.toContain(path);
    }
  });

  test("staging shuts every crawler out", () => {
    process.env.VERCEL_ENV = "preview";
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});

test.describe("/llms.txt", () => {
  test("states what Jooma is, every tool, and the real prices", async () => {
    const body = await llmsTxt().text();
    expect(body.startsWith("# Jooma\n")).toBe(true);
    expect(body).toContain(BRAND_DEFINITION);
    for (const tool of V2_TOOLS) expect(body).toContain(`(${tool.label})`);
    expect(body).toContain(`£${PLANS.pro.priceMonthly!.toFixed(2)} a month`);
    expect(body).not.toMatch(/five free/i);
    expect(body).toContain("stored in the UK (London)");
  });

  test("names no legal entity until one is confirmed", async () => {
    const body = await llmsTxt().text();
    // "Jooma Ltd" is not on the register; the site must not claim it.
    expect(body).not.toContain("Jooma Ltd");
    if (LEGAL_NAME) expect(body).toContain(LEGAL_NAME);
  });

  test("is served as plain text", () => {
    expect(llmsTxt().headers.get("Content-Type")).toContain("text/plain");
  });
});
