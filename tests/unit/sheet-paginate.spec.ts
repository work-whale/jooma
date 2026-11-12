import { test, expect } from "@playwright/test";
import { paginate } from "@/app/lib/sheets/paginate";

/*
 * Packing a sheet onto A4 pages. The component measures, this decides: a
 * question is never split, a heading never sits alone at the foot of a page,
 * and the answers always start a page of their own.
 */

const h = (...heights: number[]) => heights.map((height) => ({ height }));

test.describe("paginate", () => {
  test("fills a page, then starts the next", () => {
    expect(paginate(h(400, 400, 400), 1000, 0)).toEqual([[0, 1], [2]]);
  });

  test("counts the gap between pieces, not before the first", () => {
    expect(paginate(h(495, 495), 1000, 10)).toEqual([[0, 1]]);
    expect(paginate(h(496, 496), 1000, 10)).toEqual([[0], [1]]);
  });

  test("a section heading moves to the next page with its first question", () => {
    const units = [{ height: 800 }, { height: 50, keepWithNext: true }, { height: 300 }];
    expect(paginate(units, 1000, 0)).toEqual([[0], [1, 2]]);
  });

  test("the answers start a new page", () => {
    const units = [{ height: 100 }, { height: 50, breakBefore: true }, { height: 50 }];
    expect(paginate(units, 1000, 0)).toEqual([[0], [1, 2]]);
  });

  test("a piece taller than a page gets a page to itself rather than vanishing", () => {
    expect(paginate(h(100, 1500, 100), 1000, 0)).toEqual([[0], [1], [2]]);
  });

  test("openHeight counts only when the piece opens a page (a continued passage panel)", () => {
    const units = [{ height: 600 }, { height: 300, openHeight: 80 }, { height: 300, openHeight: 80 }];
    // The second fits after the first without its opening allowance; the
    // third opens page two and carries it.
    expect(paginate(units, 1000, 0)).toEqual([[0, 1], [2]]);
    const tight = [{ height: 950 }, { height: 500, openHeight: 80 }, { height: 440, openHeight: 80 }];
    // 500 + 80 opens page two, and 440 more would overflow it.
    expect(paginate(tight, 1000, 0)).toEqual([[0], [1], [2]]);
  });

  test("a heading stays with a block taller than any page, rather than sitting alone on a page", () => {
    const units = [{ height: 800 }, { height: 50, keepWithNext: true }, { height: 1500 }, { height: 100 }];
    expect(paginate(units, 1000, 0)).toEqual([[0], [1, 2], [3]]);
  });

  test("a block that fits a page on its own is never squeezed in after its heading", () => {
    // 50 + 960 overflows, so the block moves on, as it always did: a lone
    // heading is better than a clipped block.
    const units = [{ height: 800 }, { height: 50, keepWithNext: true }, { height: 960 }];
    expect(paginate(units, 1000, 0)).toEqual([[0], [1], [2]]);
  });

  test("no pieces, no pages", () => {
    expect(paginate([], 1000, 10)).toEqual([]);
  });
});
