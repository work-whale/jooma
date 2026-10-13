import { test, expect } from "@playwright/test";
import {
  DEFAULT_IMAGE_SETTINGS,
  deckImageCostUsd,
  gptImageCostUsd,
  imageUseForLayout,
  normalizeImageSettings,
  qualityFor,
} from "@/app/lib/image-quality";

/*
 * AI image quality per use, set in /admin/tools (app_settings.image_generation).
 *
 * Slideshow images were all made at medium. Now the title image keeps medium
 * and the rest go to low, and every price comes from an editable table instead
 * of a hardcoded one whose unknown keys fell back to $0.02 (more than medium,
 * so a switch to low would have shown costs going up).
 */

test("defaults: title medium, other slides low, single images medium", () => {
  const s = normalizeImageSettings(null);
  expect(qualityFor(s, "title")).toBe("medium");
  expect(qualityFor(s, "slide")).toBe("low");
  expect(qualityFor(s, "single")).toBe("medium");
});

test("medium keeps the calibrated prices that were hardcoded before", () => {
  const s = DEFAULT_IMAGE_SETTINGS;
  expect(gptImageCostUsd(s, "1024x1024", "medium")).toBe(0.015);
  expect(gptImageCostUsd(s, "1536x1024", "medium")).toBe(0.022);
  expect(gptImageCostUsd(s, "1024x1536", "medium")).toBe(0.022);
});

test("low is priced below medium, never at the old $0.02 fallback (regression)", () => {
  const s = DEFAULT_IMAGE_SETTINGS;
  for (const size of ["1024x1024", "1536x1024", "1024x1536"]) {
    const low = gptImageCostUsd(s, size, "low")!;
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(gptImageCostUsd(s, size, "medium")!);
  }
});

test("an unknown size has no price rather than a guessed one", () => {
  expect(gptImageCostUsd(DEFAULT_IMAGE_SETTINGS, "1792x1024", "low")).toBeNull();
});

test("only the opening slide's main image counts as the title", () => {
  expect(imageUseForLayout("title-hero")).toBe("title");
  expect(imageUseForLayout("title-cover")).toBe("title");
  expect(imageUseForLayout("paper-image-right")).toBe("slide");
  expect(imageUseForLayout("paper-vocab-grid")).toBe("slide");
  expect(imageUseForLayout("activity-question")).toBe("slide");
});

test("a saved row overrides the defaults field by field", () => {
  const s = normalizeImageSettings({
    title: "high",
    slide: "medium",
    costUsd: { "1024x1024": { low: 0.005 } },
  });
  expect(s.title).toBe("high");
  expect(s.slide).toBe("medium");
  expect(s.single).toBe("medium");
  expect(s.costUsd["1024x1024"].low).toBe(0.005);
  expect(s.costUsd["1024x1024"].medium).toBe(0.015);
  expect(s.costUsd["1536x1024"]).toEqual(DEFAULT_IMAGE_SETTINGS.costUsd["1536x1024"]);
});

test("bad values fall back alone instead of breaking the row", () => {
  const s = normalizeImageSettings({
    title: "ultra",
    slide: 3,
    costUsd: { "1024x1024": { low: -1, medium: "0.01", high: 5 }, "1536x1024": "nope" },
  });
  expect(s.title).toBe("medium");
  expect(s.slide).toBe("low");
  expect(s.costUsd["1024x1024"]).toEqual(DEFAULT_IMAGE_SETTINGS.costUsd["1024x1024"]);
  expect(s.costUsd["1536x1024"]).toEqual(DEFAULT_IMAGE_SETTINGS.costUsd["1536x1024"]);
});

test("an all-AI deck costs less at the new defaults than all at medium", () => {
  const allMedium = normalizeImageSettings({ title: "medium", slide: "medium" });
  expect(deckImageCostUsd(allMedium)).toBeCloseTo(0.165, 5);
  expect(deckImageCostUsd(DEFAULT_IMAGE_SETTINGS)).toBeCloseTo(0.055, 5);
});
