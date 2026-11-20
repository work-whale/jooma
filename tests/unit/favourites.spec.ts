import { test, expect } from "@playwright/test";
import {
  DEFAULT_FAVOURITES,
  MAX_FAVOURITES,
  isFavouriteHref,
  resolveFavourites,
  toggleFavourite,
} from "@/app/lib/favourites";
import { V2_TOOLS, V2_CATEGORIES, categoriesAToZ } from "@/app/lib/tools";

/*
 * Stars on the Make page (they replaced pins).
 *
 * Edge cases: a teacher who has never starred anything (null) gets the three
 * defaults; one who unstarred everything ([]) must NOT get them back; old pins
 * from the browser carry over once, after the defaults and without repeats; a
 * tool that no longer exists is dropped; junk from storage is ignored rather
 * than thrown on; toggling adds at the end and removes without reordering;
 * the list never grows past the database's cap.
 */

const KNOWN = V2_TOOLS.map((t) => t.href);

test("the defaults are Slides, Worksheets and Comprehension, and all exist", () => {
  expect(DEFAULT_FAVOURITES).toEqual([
    "/tools/slideshow",
    "/tools/worksheet-generator",
    "/tools/comprehension-generator",
  ]);
  for (const href of DEFAULT_FAVOURITES) expect(KNOWN).toContain(href);
});

test("never starred: the defaults", () => {
  expect(resolveFavourites(null, [], KNOWN)).toEqual([...DEFAULT_FAVOURITES]);
  expect(resolveFavourites(undefined, undefined, KNOWN)).toEqual([...DEFAULT_FAVOURITES]);
});

test("unstarred everything: stays empty, the defaults do not come back", () => {
  expect(resolveFavourites([], ["/tools/quiz-generator"], KNOWN)).toEqual([]);
});

test("never starred with old pins: defaults first, then the pins, no repeats", () => {
  expect(
    resolveFavourites(null, ["/tools/quiz-generator", "/tools/slideshow", "/tools/letter-writer"], KNOWN),
  ).toEqual([...DEFAULT_FAVOURITES, "/tools/quiz-generator", "/tools/letter-writer"]);
});

test("old pins are ignored once the account has its own list", () => {
  expect(resolveFavourites(["/tools/letter-writer"], ["/tools/quiz-generator"], KNOWN)).toEqual([
    "/tools/letter-writer",
  ]);
});

test("a saved list keeps its order", () => {
  const saved = ["/tools/quiz-generator", "/tools/slideshow"];
  expect(resolveFavourites(saved, [], KNOWN)).toEqual(saved);
});

test("tools that no longer exist, and junk, are dropped", () => {
  expect(
    resolveFavourites(["/tools/gone", "/tools/slideshow", 42, "javascript:alert(1)", "/tools/slideshow"], [], KNOWN),
  ).toEqual(["/tools/slideshow"]);
  expect(resolveFavourites("not an array", "nor this", KNOWN)).toEqual([...DEFAULT_FAVOURITES]);
});

test("toggle adds at the end and removes in place", () => {
  const start = ["/tools/slideshow", "/tools/worksheet-generator"];
  expect(toggleFavourite(start, "/tools/quiz-generator")).toEqual([...start, "/tools/quiz-generator"]);
  expect(toggleFavourite(start, "/tools/slideshow")).toEqual(["/tools/worksheet-generator"]);
  // The input is not mutated.
  expect(start).toEqual(["/tools/slideshow", "/tools/worksheet-generator"]);
});

test("toggle refuses a bad href and stops at the cap", () => {
  expect(toggleFavourite(["/tools/slideshow"], "https://evil.example")).toEqual(["/tools/slideshow"]);
  const full = Array.from({ length: MAX_FAVOURITES }, (_, i) => `/tools/t${i}`);
  expect(toggleFavourite(full, "/tools/one-more")).toEqual(full);
  // Removing still works when full.
  expect(toggleFavourite(full, "/tools/t0")).toHaveLength(MAX_FAVOURITES - 1);
});

test("isFavouriteHref matches the database's pattern", () => {
  expect(isFavouriteHref("/tools/slideshow")).toBe(true);
  expect(isFavouriteHref("/tools/eyfs-action-plan")).toBe(true);
  expect(isFavouriteHref("/tools/")).toBe(false);
  expect(isFavouriteHref("/tools/Slides")).toBe(false);
  expect(isFavouriteHref("/admin")).toBe(false);
  expect(isFavouriteHref("/tools/a/b")).toBe(false);
});

/*
 * A to Z. The Make page lists its sections and chips in this order. The
 * source list keeps its own order for the other readers (Jo's composer and the
 * public /teacher-tools page), so sorting must not change it.
 */
test("categories A to Z, every category present once", () => {
  const before = V2_CATEGORIES.map((c) => c.id);
  const names = categoriesAToZ().map((c) => c.name);
  expect(names).toEqual([
    "Assessment",
    "Behaviour and SEND",
    "Classroom resources",
    "Communication",
    "Leadership",
    "Planning",
    "Slides",
  ]);
  expect(V2_CATEGORIES.map((c) => c.id)).toEqual(before);
});
