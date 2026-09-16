import { test, expect } from "@playwright/test";
import { deltaOf } from "@/app/admin/stats/export";

/*
 * Month-on-month movement, as shown on the Stats KPI tiles.
 *
 * The arithmetic is one line. Everything that can go wrong here is a case where
 * that line produces a number rather than refusing to: a previous month of zero
 * divides to Infinity, a month that was never recorded divides against null as
 * though it were zero, and a rounding boundary turns a change nobody can see
 * into a green arrow. Each of those renders as a confident, wrong percentage on
 * a page the marketing agency reads, so they are tested individually.
 */

test.describe("deltaOf", () => {
  test("reports a rise and a fall with the direction the chip colours on", () => {
    expect(deltaOf(120, 100)).toEqual({ label: "20%", dir: "up" });
    expect(deltaOf(80, 100)).toEqual({ label: "20%", dir: "down" });
  });

  test("states the magnitude unsigned, because the arrow carries the sign", () => {
    // A "-20%" beside a downward arrow reads as a double negative.
    expect(deltaOf(80, 100)?.label).toBe("20%");
  });

  test("a previous month of zero is 'new', not an infinite rise", () => {
    // The bug this guards: (5 - 0) / 0 is Infinity, which formats as "Infinity%".
    expect(deltaOf(5, 0)).toEqual({ label: "new", dir: "new" });
  });

  test("zero against zero is no movement at all, not 'new'", () => {
    // Nothing happened either month. Claiming "new" would invent an arrival.
    expect(deltaOf(0, 0)).toBeNull();
  });

  test("a month that was never recorded yields no delta", () => {
    // Visitors are null for every month before analytics began. Treating that
    // null as zero would manufacture a gain out of a gap in the data, which is
    // exactly the overclaim the Monthly detail table's dash exists to avoid.
    expect(deltaOf(500, null)).toBeNull();
    expect(deltaOf(null, 500)).toBeNull();
  });

  test("the first month of a range has nothing to compare against", () => {
    // `previous` is undefined when months[] has a single row.
    expect(deltaOf(42, undefined)).toBeNull();
  });

  test("a change too small to display is flat rather than a rise", () => {
    // 1000 -> 1001 is 0.1%, which rounds to 0. Shown as "0%" with a green up
    // arrow it claims growth that the number itself denies.
    expect(deltaOf(1001, 1000)).toEqual({ label: "no change", dir: "flat" });
    expect(deltaOf(999, 1000)).toEqual({ label: "no change", dir: "flat" });
  });

  test("identical months are flat", () => {
    expect(deltaOf(250, 250)).toEqual({ label: "no change", dir: "flat" });
  });

  test("rounds to whole percentages, so tiles stay one line", () => {
    // 100 -> 133 is 33.0%; 100 -> 127 is 27%. Neither should carry decimals.
    expect(deltaOf(133, 100)?.label).toBe("33%");
    expect(deltaOf(1275, 1000)?.label).toBe("28%");
  });

  test("survives a fall to zero", () => {
    expect(deltaOf(0, 400)).toEqual({ label: "100%", dir: "down" });
  });
});
