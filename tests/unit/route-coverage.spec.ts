import { test, expect } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PRIVATE_PREFIXES, isPublic, needsSession } from "@/app/lib/route-access";

/*
 * Which signed-out requests need a session.
 *
 * The proxy used to send every signed-out request it did not recognise to
 * /login, so a mistyped URL looked to Google like a redirect to a working page.
 * Now only known private routes go to /login and anything else reaches the 404
 * page. The cost of that is a list that has to name every private route, and
 * forgetting one would let a signed-out visitor reach it.
 *
 * The first test is the guard on that list: it walks the route tree and fails
 * on any top level segment that is neither public nor private.
 */

const APP = join(process.cwd(), "app");

// Folders under app/ that are not routes.
const NOT_ROUTES = new Set(["api", "components", "lib"]);

function topLevelSegments(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (NOT_ROUTES.has(name) || name.startsWith("_")) continue;
    // A route group adds no segment of its own; its children are top level.
    if (name.startsWith("(") && name.endsWith(")")) {
      out.push(...topLevelSegments(full));
      continue;
    }
    out.push(name);
  }
  return out;
}

test("every top level route is either public or private", () => {
  const segments = topLevelSegments(APP);
  // A sanity check that the walk found the tree at all.
  expect(segments).toContain("dashboard");

  const unclassified = segments.filter(
    (s) => !isPublic(`/${s}`) && !PRIVATE_PREFIXES.includes(`/${s}`),
  );
  expect(unclassified, "add these to PUBLIC_PATHS or PRIVATE_PREFIXES in app/lib/route-access.ts").toEqual([]);
});

test("private pages and the API need a session", () => {
  expect(needsSession("/dashboard")).toBe(true);
  expect(needsSession("/tools/report-writer")).toBe(true);
  expect(needsSession("/editor/abc")).toBe(true);
  expect(needsSession("/ambassador/apply")).toBe(true);
  expect(needsSession("/api/anything")).toBe(true);
});

test("public pages, and URLs nothing serves, do not", () => {
  expect(needsSession("/")).toBe(false);
  expect(needsSession("/terms")).toBe(false);
  expect(needsSession("/made/some-deck")).toBe(false);
  expect(needsSession("/ambassador/join")).toBe(false);
  expect(needsSession("/api/try/worksheet")).toBe(false);
  // The point of the change: these fall through to the 404 page.
  expect(needsSession("/this-does-not-exist")).toBe(false);
  expect(needsSession("/refunds")).toBe(false);
  expect(needsSession("/manifest.webmanifest")).toBe(false);
});

test("a prefix matches whole segments only", () => {
  // "/tools" must not swallow a public page that merely starts with the word.
  expect(needsSession("/toolshed")).toBe(false);
  expect(needsSession("/terms-and-more")).toBe(false);
});
