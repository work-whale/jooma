import { test, expect } from "@playwright/test";
import { honouredNextPath } from "@/app/lib/safe-next";

/*
 * Where signup may send a teacher afterwards. Jooma 4.5 adds the plan picker:
 * a signed-out "Choose Pro" on the pricing page signs up first, then lands on
 * /pricing?chosen=pro (spec Step 4, rule 4).
 *
 * Edge cases: the ambassador pages still work; /pricing with or without a
 * query; a look-alike prefix (/pricingevil, /pricing-x) is refused; anything
 * unsafe (//, @, backslash) is refused before the prefix check.
 */

test("the ambassador pages are still honoured", () => {
  expect(honouredNextPath("/ambassador")).toBe("/ambassador");
  expect(honouredNextPath("/ambassador/join")).toBe("/ambassador/join");
});

test("the plan picker, with its query", () => {
  expect(honouredNextPath("/pricing")).toBe("/pricing");
  expect(honouredNextPath("/pricing?chosen=pro")).toBe("/pricing?chosen=pro");
});

test("look-alikes and other pages are not", () => {
  expect(honouredNextPath("/pricingevil")).toBeNull();
  expect(honouredNextPath("/pricing-x")).toBeNull();
  expect(honouredNextPath("/dashboard")).toBeNull();
});

test("unsafe paths are refused", () => {
  expect(honouredNextPath("//evil.com/pricing")).toBeNull();
  expect(honouredNextPath("/pricing?x=@evil.com")).toBeNull();
  expect(honouredNextPath("https://evil.com")).toBeNull();
});
