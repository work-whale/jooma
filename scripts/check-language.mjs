#!/usr/bin/env node
/**
 * Two brand rules, enforced rather than remembered.
 *
 *   1. No em dashes or en dashes in user-facing strings. Use a full stop, a
 *      colon or a comma. They are inconsistently rendered, they encourage
 *      sentences that should have been two, and they are not how the product
 *      talks.
 *
 *   2. No "AI" anywhere a teacher can see. Not in tool names, buttons, empty
 *      states or marketing. The product is judged on what it hands back, and
 *      leading with the technology invites the reader to judge the technology
 *      instead. Allowed only in the terms, the privacy policy and school
 *      procurement documents, where it is a factual disclosure.
 *
 * Scope is deliberately narrow: the marketing surfaces and the shared copy
 * table, which is what a visitor and a signed-out teacher actually read. The
 * signed-in app still carries both, and widening this to `app/**` would fail on
 * roughly a hundred pre-existing strings that are a separate piece of work.
 *
 * Run by `pnpm lint`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/**
 * Files this checks.
 *
 * The V2 landing page, the copy table behind it, and its demo content. That is
 * every string a visitor or a signed-out teacher reads.
 *
 * Deliberately NOT `app/components/landing` wholesale: the six V1 components
 * beside the v2 directory (HeroShowcase, SocialProof, HowItWorks, CtaBanner,
 * WhyJooma and the old Faq) are unreferenced since the rebuild and carry
 * eighteen violations between them. They are kept for one review cycle rather
 * than deleted with the rebuild. Delete them and this list can widen to the
 * whole directory.
 */
const INCLUDE = [
  "app/page.tsx",
  "app/components/landing/v2",
  "app/components/landing/NavAuth.tsx",
  "app/lib/copy.ts",
  "app/lib/landing",
  // The brand lines the homepage, its metadata and its social card share.
  "app/lib/seo/brand.ts",
  // The public tool pages and their copy. Dashes are checked here like
  // anywhere else on the marketing surface; "AI" is allowed (see AI_ALLOWED).
  "app/teacher-tools",
  "app/lib/seo/tool-pages.ts",
  // About is marketing like the homepage; Trust is a procurement page, so
  // dashes are checked but "AI" is allowed (see AI_ALLOWED).
  "app/about",
  "app/trust",
  "app/lib/legal",
];

/**
 * Where "AI" is legitimate. These are the legal and procurement documents the
 * brand bible exempts, plus this file, which has to name the rule to explain
 * it.
 */
const AI_ALLOWED = [
  "app/terms",
  "app/privacy",
  "scripts/check-language.mjs",
  // The public tool pages, by decision: teachers search "AI report writer",
  // and a page that never says it does not rank for it. Allowed in a page's
  // title, H1 and intro only; tests/unit/tool-pages.spec.ts holds the copy to
  // that, which a line-based check here cannot.
  "app/teacher-tools",
  "app/lib/seo/tool-pages.ts",
  // The schools trust page and the sub-processor list it shares with the
  // privacy policy: procurement documents, exempt for the same reason.
  "app/trust",
  "app/lib/legal",
];

const DASHES = /[\u2014\u2013]/;

/**
 * "AI" as a standalone word. Word-boundary matched so it does not fire on
 * `aria-label`, `Email`, `Domain`, `Detail`, or a component called `AiThing`
 * that no teacher ever sees. Case sensitive: lowercase "ai" inside an
 * identifier is not the marketing claim this is about.
 */
const AI_WORD = /\bAI\b/;

function walk(path, out = []) {
  const stat = statSync(path);
  if (stat.isFile()) {
    if (/\.(tsx?|mdx?)$/.test(path)) out.push(path);
    return out;
  }
  for (const entry of readdirSync(path)) walk(join(path, entry), out);
  return out;
}

const failures = [];

for (const target of INCLUDE) {
  const absolute = join(ROOT, target);
  let files;
  try {
    files = walk(absolute);
  } catch {
    continue; // A path that has not been created yet is not a failure.
  }

  for (const file of files) {
    const rel = relative(ROOT, file).split("\\").join("/");
    const lines = readFileSync(file, "utf8").split("\n");

    // Comments explain the rules and quote the strings they replaced, so they
    // are not themselves user-facing copy. Block comments are tracked across
    // lines: a JSDoc paragraph is prose about the code, and flagging its
    // punctuation would make the rule unusable for the people documenting it.
    let inBlock = false;

    lines.forEach((line, i) => {
      let code = "";
      let rest = line;

      while (rest.length) {
        if (inBlock) {
          const end = rest.indexOf("*/");
          if (end === -1) break;
          rest = rest.slice(end + 2);
          inBlock = false;
          continue;
        }
        const start = rest.indexOf("/*");
        const lineComment = rest.indexOf("//");
        if (lineComment !== -1 && (start === -1 || lineComment < start)) {
          code += rest.slice(0, lineComment);
          break;
        }
        if (start === -1) {
          code += rest;
          break;
        }
        code += rest.slice(0, start);
        rest = rest.slice(start + 2);
        inBlock = true;
      }

      if (DASHES.test(code)) {
        failures.push(`${rel}:${i + 1}  em dash or en dash. Use a full stop, colon or comma.`);
      }

      if (AI_WORD.test(code) && !AI_ALLOWED.some((allowed) => rel.startsWith(allowed))) {
        failures.push(`${rel}:${i + 1}  "AI" in teacher-facing copy. Name what it makes instead.`);
      }
    });
  }
}

if (failures.length) {
  console.error(`\nLanguage check failed (${failures.length}):\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("");
  process.exit(1);
}

console.log("Language check passed.");
