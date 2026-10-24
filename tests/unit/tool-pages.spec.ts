import { test, expect } from "@playwright/test";
import { TOOL_PAGES, toolPagePath, type ToolPage } from "@/app/lib/seo/tool-pages";
import { V2_TOOLS } from "@/app/lib/tools";
import { guestSlugFor } from "@/app/lib/guest-tools";
import sitemap from "@/app/sitemap";

/*
 * The public tool pages, held to the rules their copy was written under.
 *
 * "AI" is allowed where teachers search for it (the title, the H1, the intro
 * and the meta description) and nowhere else on the page. The language check
 * in scripts/check-language.mjs works line by line and cannot tell those
 * fields apart, so this does.
 *
 * Every claim on these pages was checked against the tool itself. The cheapest
 * guard on that is a list of things the tools cannot do yet that older copy
 * did claim, so none of them comes back.
 */

const words = (s: string) => s.trim().split(/\s+/).length;

/** Every string on the page outside the four fields where "AI" is allowed. */
function bodyCopy(p: ToolPage): string[] {
  return [
    ...p.steps,
    ...p.features,
    p.uk.heading,
    p.uk.body,
    ...p.faqs.flatMap((f) => [f.q, f.a]),
  ];
}

test("every page belongs to a real tool, once", () => {
  const hrefs = new Set(V2_TOOLS.map((t) => t.href));
  for (const p of TOOL_PAGES) expect(hrefs.has(p.href), p.href).toBe(true);
  expect(new Set(TOOL_PAGES.map((p) => p.slug)).size).toBe(TOOL_PAGES.length);
  expect(new Set(TOOL_PAGES.map((p) => p.href)).size).toBe(TOOL_PAGES.length);
});

test("every tool in the app has a public page", () => {
  const missing = V2_TOOLS.filter((t) => !TOOL_PAGES.some((p) => p.href === t.href)).map((t) => t.href);
  expect(missing, "add a page in app/lib/seo/tool-pages.ts").toEqual([]);
});

test("intros are a direct answer: 40 to 60 words", () => {
  for (const p of TOOL_PAGES) {
    const n = words(p.intro);
    expect(n, `${p.slug} intro is ${n} words`).toBeGreaterThanOrEqual(40);
    expect(n, `${p.slug} intro is ${n} words`).toBeLessThanOrEqual(60);
  }
});

test("descriptions fit where Google cuts them", () => {
  for (const p of TOOL_PAGES) expect(p.description.length, p.slug).toBeLessThanOrEqual(160);
});

test("\"AI\" appears in the search fields and nowhere else", () => {
  for (const p of TOOL_PAGES) {
    expect(p.title, p.slug).toMatch(/\bAI\b/);
    expect(p.h1, p.slug).toMatch(/\bAI\b/);
    for (const s of bodyCopy(p)) expect(s, `${p.slug}: ${s}`).not.toMatch(/\bAI\b/);
  }
});

test("no page promises an export the app does not have yet", () => {
  for (const p of TOOL_PAGES) {
    for (const s of [p.intro, p.description, ...bodyCopy(p)]) {
      // Google Docs and Google Slides export are "coming soon" in the app.
      expect(s, `${p.slug}: ${s}`).not.toMatch(/(export|send|save) (it )?to Google (Docs|Slides)/i);
      // Quizzes are single answer multiple choice; there is no Quizizz label.
      expect(s, `${p.slug}: ${s}`).not.toMatch(/Quizizz/);
    }
  }
});

test("only the tools on /create offer a try with no account", () => {
  for (const p of TOOL_PAGES) {
    if (p.guest) {
      expect(`/tools/${guestSlugFor(p.guest)}`, p.slug).toBe(p.href);
    } else {
      expect(p.faqs.map((f) => f.q), p.slug).not.toContain("Can I try it without signing up?");
    }
  }
});

test("related tools exist and are not the page itself", () => {
  const hrefs = new Set(V2_TOOLS.map((t) => t.href));
  for (const p of TOOL_PAGES) {
    for (const r of p.related) {
      expect(hrefs.has(r), `${p.slug} relates to ${r}`).toBe(true);
      expect(r).not.toBe(p.href);
    }
  }
});

test("the sitemap lists the index and every page", () => {
  const urls = sitemap().map((e) => e.url);
  expect(urls).toContain("https://www.jooma.ai/teacher-tools");
  for (const p of TOOL_PAGES) expect(urls).toContain(`https://www.jooma.ai${toolPagePath(p)}`);
});
