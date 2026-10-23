import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Vercel builds on the Node major in `engines`, and the editor type-checks
 * against `@types/node`. Keep them on the same line so code that only exists
 * in a newer Node cannot pass the type check and then fail in production.
 *
 * 24.x since the October 2026 security release (CVE-2026-111497, fixed in
 * 24.22.1). Vercel picks up the latest patch of the major on each build.
 */
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

test("engines pins a supported Node major", () => {
  expect(pkg.engines?.node).toBe("24.x");
});

test("@types/node matches the engines major", () => {
  const engineMajor = pkg.engines.node.split(".")[0];
  const typesMajor = pkg.devDependencies["@types/node"].replace(/^\D+/, "").split(".")[0];
  expect(typesMajor).toBe(engineMajor);
});
