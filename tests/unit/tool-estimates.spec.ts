import { test, expect } from "@playwright/test";
import {
  TOOL_ESTIMATES,
  PICTURE_ESTIMATE,
  UNMEASURED_ESTIMATE,
  estimateFor,
  roundEstimate,
  estimateLabel,
  deckPictureCount,
} from "@/app/lib/tool-estimates";
import { costLine } from "@/app/lib/prompt-views";
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

  test("every tool is measured: none is left on the guessed default", () => {
    for (const [slug, e] of Object.entries(TOOL_ESTIMATES)) {
      expect(["production", "staging"], slug).toContain(e.source);
      expect(e.resources, slug).toBeGreaterThan(0);
    }
  });

  test("well-used tools keep the production average; the rest are the staging median", () => {
    // Production, 15+ saved runs in 90 days: real inputs, pictures, abandoned runs.
    expect(TOOL_ESTIMATES["slideshow"]).toEqual({ resources: 17, source: "production" });
    expect(TOOL_ESTIMATES["worksheet-generator"]).toEqual({ resources: 2.5, source: "production" });
    expect(TOOL_ESTIMATES["lesson-planner"]).toEqual({ resources: 29.5, source: "production" });
    // Staging, 5 runs on the uplifted prompts (tests/tools/measure-tool-costs).
    expect(TOOL_ESTIMATES["eyfs-planner"]).toEqual({ resources: 21, source: "staging" });
    expect(TOOL_ESTIMATES["report-writer"]).toEqual({ resources: 4.4, source: "staging" });
    expect(TOOL_ESTIMATES["risk-assessment"]).toEqual({ resources: 11.1, source: "staging" });
  });

  test("a CPD deck is a deck: same figure as the slideshow it is gated as", () => {
    expect(TOOL_ESTIMATES["cpd-slideshow"].resources).toBe(TOOL_ESTIMATES["slideshow"].resources);
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

test.describe("deckPictureCount: generated pictures a deck will make", () => {
  /*
   * Production, 90 days to 19 Nov 2026: decks set to Generated averaged 11.1
   * pictures for 10.4 slides (one a slide plus the title); Auto at the default
   * 8 web : 2 generated averaged 1.9 for 9 slides. Library photos make none.
   *
   * Edge cases: library photos are always 0 whatever the mix; Auto follows the
   * pipeline's own counter (the first webParts of every 10 are library
   * photos), including mix 0 (all generated) and 10 (none); no source sent
   * means Auto, as the pipeline treats it; a missing slide count is the form's
   * default of 8; nonsense counts and mixes are clamped, never negative.
   */
  test("library photos make no generated pictures", () => {
    expect(deckPictureCount({ imageSource: "web", slideCount: 10 })).toBe(0);
    expect(deckPictureCount({ imageSource: "web", imageMixWeb: 0, slideCount: 10 })).toBe(0);
  });

  test("Generated: one a slide, plus the title", () => {
    expect(deckPictureCount({ imageSource: "ai", slideCount: 10 })).toBe(11);
    expect(deckPictureCount({ imageSource: "ai", slideCount: 8 })).toBe(9);
  });

  test("Auto follows the pipeline's counter, as production measured", () => {
    expect(deckPictureCount({ imageSource: "auto", imageMixWeb: 8, slideCount: 9 })).toBe(2);
    expect(deckPictureCount({ imageSource: "auto", imageMixWeb: 8, slideCount: 8 })).toBe(1);
    expect(deckPictureCount({ imageSource: "auto", imageMixWeb: 0, slideCount: 8 })).toBe(9);
    expect(deckPictureCount({ imageSource: "auto", imageMixWeb: 10, slideCount: 8 })).toBe(0);
    expect(deckPictureCount({ imageSource: "auto", imageMixWeb: 5, slideCount: 19 })).toBe(10);
  });

  test("no source is Auto at 8 web : 2 generated; no slide count is 8", () => {
    expect(deckPictureCount({ slideCount: 9 })).toBe(2);
    expect(deckPictureCount({ imageSource: "ai" })).toBe(9);
  });

  test("nonsense is clamped, never negative", () => {
    expect(deckPictureCount({ imageSource: "ai", slideCount: -4 })).toBe(0);
    expect(deckPictureCount({ imageSource: "ai", slideCount: 500 })).toBe(31);
    expect(deckPictureCount({ imageSource: "auto", imageMixWeb: 99, slideCount: 8 })).toBe(0);
    expect(deckPictureCount({ imageSource: "auto", imageMixWeb: -5, slideCount: 8 })).toBe(9);
  });

  test("an all-generated deck reads about 65, not the library deck's 15", () => {
    expect(roundEstimate(estimateFor("slideshow", { pictures: deckPictureCount({ imageSource: "ai", slideCount: 8 }) }))).toBe(65);
    expect(roundEstimate(estimateFor("slideshow", { pictures: deckPictureCount({ imageSource: "web", slideCount: 8 }) }))).toBe(15);
  });

  test("the cost line carries the pictures, and so does its not-enough check", () => {
    expect(costLine("slideshow", 100).text).toBe("Usually about 15 resources. You have 100.");
    expect(costLine("slideshow", 100, { pictures: 9 }).text).toBe("Usually about 65 resources. You have 100.");
    const short = costLine("slideshow", 40, { pictures: 9 });
    expect(short.enough).toBe(false);
    expect(short.text).toBe("This usually needs about 65. You have 40.");
    // Library photos with the same 40 left is fine.
    expect(costLine("slideshow", 40, { pictures: 0 }).enough).toBe(true);
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
