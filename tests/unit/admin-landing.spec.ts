import { test, expect } from "@playwright/test";
// From ./sections, not ./access: access.ts imports "server-only", which the
// unit runner cannot resolve. The pure rules live apart for exactly this reason.
import { landingPath, sectionsOf } from "@/app/admin/sections";

// Where an admin goes when they cannot see the page they asked for.
//
// This is the loop-prevention logic. /admin redirects here when see_overview is
// missing, so a bug that returns /admin sends the request straight back and the
// console becomes unusable for that role. Cheap to pin, expensive to miss.

test.describe("landingPath", () => {
  test("a full admin lands on the dashboard", () => {
    expect(
      landingPath(["see_overview", "see_people", "see_money", "see_admin"]),
    ).toBe("/admin");
  });

  test("marketing lands on stats", () => {
    expect(landingPath(["see_stats"])).toBe("/admin/stats");
  });

  test("never returns /admin without see_overview", () => {
    // The whole point. Any permission set lacking see_overview must route
    // somewhere else, or /admin redirects to itself.
    const sets = [
      ["see_stats"],
      ["see_people"],
      ["see_money"],
      ["see_support"],
      ["see_product"],
      ["see_content"],
      ["see_admin"],
      [],
    ];
    for (const perms of sets) {
      expect(landingPath(perms)).not.toBe("/admin");
    }
  });

  test("an admin with no sections lands somewhere that never redirects", () => {
    expect(landingPath([])).toBe("/admin/no-access");
  });

  test("support, which has no see_stats, still lands on the dashboard", () => {
    expect(
      landingPath([
        "see_overview",
        "see_people",
        "see_product",
        "see_support",
        "see_content",
      ]),
    ).toBe("/admin");
  });

  test("stats wins over other sections when overview is absent", () => {
    // Finance holds both see_stats and see_money. Without the dashboard it
    // should land on the page it was given stats access for.
    expect(landingPath(["see_money", "see_stats", "see_people"])).toBe("/admin/stats");
  });
});

test.describe("sectionsOf", () => {
  test("keeps only real sections, in sidebar order", () => {
    expect(sectionsOf(["see_admin", "see_overview", "see_stats"])).toEqual([
      "see_overview",
      "see_stats",
      "see_admin",
    ]);
  });

  test("ignores action permissions that merely start with see_", () => {
    // see_teachers and see_deletions are ACTION permissions. Filtering by the
    // "see_" prefix instead of the explicit list would invent two sections that
    // do not exist and render empty groups in the sidebar.
    expect(sectionsOf(["see_teachers", "see_deletions"])).toEqual([]);
  });

  test("an empty permission set yields no sections", () => {
    expect(sectionsOf([])).toEqual([]);
  });
});
