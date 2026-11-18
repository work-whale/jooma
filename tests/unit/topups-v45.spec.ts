import { test, expect } from "@playwright/test";
import { TOP_UP_PACKS } from "@/app/lib/plan-config";
import { topUpPack, topUpRefusal, topUpGrant } from "@/app/lib/topups-v45";

/*
 * Jooma 4.5 top-up packs (spec Step 2 and plan 2e): 500 for £2.49, 1,500 for
 * £5.99, 4,000 for £12.99, Standard, Pro and Max only, never expiring.
 *
 * Edge cases: an unknown or empty pack id is refused (never the default pack:
 * the teacher chose something specific); Free, the trial, School and an
 * unknown plan are refused; the grant comes from the config pack, not from
 * what was paid (a promo code makes a pack cheaper, not smaller); a grant for
 * an unknown pack id is null so the webhook cannot invent resources.
 */

test("the three packs, by id", () => {
  expect(topUpPack("pack-500")).toMatchObject({ resources: 500, price: 2.49 });
  expect(topUpPack("pack-1500")).toMatchObject({ resources: 1500, price: 5.99 });
  expect(topUpPack("pack-4000")).toMatchObject({ resources: 4000, price: 12.99 });
  expect(TOP_UP_PACKS).toHaveLength(3);
});

test("unknown or empty ids are not packs", () => {
  expect(topUpPack("pack-1000")).toBeNull();
  expect(topUpPack("")).toBeNull();
  expect(topUpPack(null)).toBeNull();
  expect(topUpPack("187a6082-1e64-45b2-b0bd-181920db506a")).toBeNull();
});

test("Standard, Pro and Max may buy any pack", () => {
  for (const plan of ["standard", "pro", "max"] as const) {
    for (const p of TOP_UP_PACKS) expect(topUpRefusal(plan, p.id)).toBeNull();
  }
});

test("Free, the trial, School and unknown plans are refused", () => {
  expect(topUpRefusal("free", "pack-500")).toMatch(/Standard, Pro and Max/);
  expect(topUpRefusal("pro_trial", "pack-500")).toMatch(/Standard, Pro and Max/);
  expect(topUpRefusal("school", "pack-500")).not.toBeNull();
});

test("an unknown pack is refused even on Pro", () => {
  expect(topUpRefusal("pro", "pack-9")).toMatch(/no longer available/);
});

test("the grant is the pack's resources, whatever was paid", () => {
  expect(topUpGrant("pack-1500")).toBe(1500);
  expect(topUpGrant("nope")).toBeNull();
  expect(topUpGrant(undefined)).toBeNull();
});
