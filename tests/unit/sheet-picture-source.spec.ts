import { test, expect } from "@playwright/test";
import { sheetPictureSource } from "@/app/lib/plan-features";

/*
 * Sheet pictures by plan (plan 2f: the server forces library photos on Free
 * and Standard, sheet-picture included).
 *
 * Edge cases: "ai" and "auto" both become "web" on Free and Standard (auto
 * could fall through to a generated picture); "web" is untouched everywhere;
 * Pro, Max and the trial keep what was asked; no plan (before the migration)
 * changes nothing.
 */

test("Free and Standard always get a library photo", () => {
  for (const plan of ["free", "standard"] as const) {
    expect(sheetPictureSource(plan, "ai")).toBe("web");
    expect(sheetPictureSource(plan, "auto")).toBe("web");
    expect(sheetPictureSource(plan, "web")).toBe("web");
  }
});

test("Pro, Max and the trial keep what was asked", () => {
  for (const plan of ["pro", "max", "pro_trial"] as const) {
    expect(sheetPictureSource(plan, "ai")).toBe("ai");
    expect(sheetPictureSource(plan, "auto")).toBe("auto");
  }
});

test("no plan known changes nothing", () => {
  expect(sheetPictureSource(null, "ai")).toBe("ai");
});
