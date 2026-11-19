import { test, expect } from "@playwright/test";
import { matchTools, ilikeContains } from "@/app/lib/app-search";
import { V2_TOOLS } from "@/app/lib/tools";

/*
 * The top bar's search: "Search your library and the 35 tools".
 *
 * Tools match on the short v4 name, the old name (a teacher who learnt
 * "Worksheet Generator" still finds Worksheets), and the description. The
 * library half is a database ILIKE on titles, so what the teacher types must
 * be escaped: a "%" or "_" in a title search is a character, not a wildcard.
 */

const none = () => false;

test.describe("matchTools", () => {
  test("an empty or blank query matches nothing", () => {
    expect(matchTools("", V2_TOOLS, none)).toEqual([]);
    expect(matchTools("   ", V2_TOOLS, none)).toEqual([]);
  });

  test("matches the short name, case-insensitively", () => {
    expect(matchTools("worksheets", V2_TOOLS, none).map((t) => t.name)).toContain("Worksheets");
  });

  test("still matches the old name", () => {
    expect(matchTools("slideshow generator", V2_TOOLS, none).map((t) => t.name)).toContain("Slides");
  });

  test("a name match ranks above a description match", () => {
    const names = matchTools("cover", V2_TOOLS, none).map((t) => t.name);
    expect(names[0]).toBe("Cover Lesson");
  });

  test("never more than five", () => {
    expect(matchTools("a", V2_TOOLS, none).length).toBeLessThanOrEqual(5);
  });

  test("hidden tools are left out", () => {
    const hideCover = (slug: string) => slug === "cover-lesson";
    expect(matchTools("cover lesson", V2_TOOLS, hideCover).map((t) => t.name)).not.toContain("Cover Lesson");
  });
});

test.describe("ilikeContains", () => {
  test("wraps the text in wildcards", () => {
    expect(ilikeContains("fractions")).toBe("%fractions%");
  });

  test("escapes the characters ILIKE treats as special", () => {
    expect(ilikeContains("50%_off\\now")).toBe("%50\\%\\_off\\\\now%");
  });

  test("trims, and a blank query is null so nothing is fetched", () => {
    expect(ilikeContains("  maps  ")).toBe("%maps%");
    expect(ilikeContains("  ")).toBeNull();
  });
});
