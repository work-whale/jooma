import { test, expect } from "@playwright/test";
import {
  TOOL_ESTIMATES,
  PICTURE_ESTIMATE,
  UNMEASURED_ESTIMATE,
  estimateFor,
  roundEstimate,
  estimateLabel,
} from "@/app/lib/tool-estimates";
import { TOOLS } from "@/app/lib/tools";

/*
 * The "about N resources" figure on a tool card.
 *
 * Charging stays measured: a generation costs what it really costs. These are
 * the typical costs from production, shown so a teacher knows roughly what a
 * tool takes before pressing Make. Rounded so the card never claims a precision
 * the measurement does not have.
 */

const slug = (href: string) => href.replace("/tools/", "");

test.describe("TOOL_ESTIMATES", () => {
  test("covers every tool there is, so no card is left without a figure", () => {
    // An entry of its own, not the fallback: a new tool must be added here
    // deliberately, measured or not.
    for (const tool of TOOLS) {
      expect(Object.keys(TOOL_ESTIMATES), tool.href).toContain(slug(tool.href));
    }
    expect(Object.keys(TOOL_ESTIMATES)).toHaveLength(TOOLS.length);
  });

  test("a tool with no production runs is marked unmeasured and gets the default", () => {
    const unmeasured = Object.entries(TOOL_ESTIMATES).filter(([, e]) => !e.measured);
    for (const [, e] of unmeasured) expect(e.resources).toBe(UNMEASURED_ESTIMATE);
  });

  test("the measured figures are the production averages", () => {
    expect(TOOL_ESTIMATES["slideshow"]).toEqual({ resources: 17, measured: true });
    expect(TOOL_ESTIMATES["worksheet-generator"].resources).toBe(2.5);
    expect(TOOL_ESTIMATES["lesson-planner"].resources).toBe(29.5);
  });

  test("an unknown slug falls back to the default rather than zero", () => {
    expect(estimateFor("no-such-tool")).toBe(UNMEASURED_ESTIMATE);
  });
});

test.describe("estimateFor with generated pictures", () => {
  test("each generated picture adds its own estimate", () => {
    expect(estimateFor("slideshow", { pictures: 0 })).toBe(17);
    expect(estimateFor("slideshow", { pictures: 4 })).toBeCloseTo(17 + 4 * PICTURE_ESTIMATE);
  });

  test("a negative or fractional picture count is not trusted", () => {
    expect(estimateFor("slideshow", { pictures: -3 })).toBe(17);
    expect(estimateFor("slideshow", { pictures: 2.7 })).toBeCloseTo(17 + 2 * PICTURE_ESTIMATE);
  });
});

test.describe("roundEstimate", () => {
  test("never shows zero: anything below one is about 1", () => {
    expect(roundEstimate(0.1)).toBe(1);
    expect(roundEstimate(0.6)).toBe(1);
  });

  test("small figures round up to a whole number", () => {
    expect(roundEstimate(2.5)).toBe(3);
    expect(roundEstimate(3.3)).toBe(4);
    expect(roundEstimate(9.2)).toBe(10);
  });

  test("from 10 up, to the nearest 5, so the card does not fake precision", () => {
    expect(roundEstimate(17)).toBe(15);
    expect(roundEstimate(18.8)).toBe(20);
    expect(roundEstimate(29.5)).toBe(30);
    expect(roundEstimate(58)).toBe(60);
  });
});

test.describe("estimateLabel", () => {
  test("says about, and resources", () => {
    expect(estimateLabel(29.5)).toBe("about 30 resources");
    expect(estimateLabel(2.5)).toBe("about 3 resources");
  });

  test("one is singular", () => {
    expect(estimateLabel(0.4)).toBe("about 1 resource");
  });
});
