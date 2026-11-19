import { test, expect } from "@playwright/test";
import { pictureMode, exportMark, EXPORT_MARK_TEXT, refineCheck, deckImageOptions } from "@/app/lib/plan-features";

/*
 * Features by plan (plan 2f): pictures, the Jooma mark, refines.
 *
 * Edge cases: every plan for each gate; a request for pictures on Free is
 * DOWNGRADED to library photos (the deck still gets made), never refused;
 * the mark follows the plan at export time (a trial deck re-exported on Free
 * is marked); refines at 7, 8, 9, 10 and 11 used; a negative count; refining
 * on paid plans is never counted.
 */

test.describe("pictures", () => {
  test("Free and Standard get library photos, even when generated is asked for", () => {
    expect(pictureMode("free", "generated")).toBe("library");
    expect(pictureMode("standard", "generated")).toBe("library");
  });
  test("Pro, Max and the trial get what they asked for", () => {
    for (const p of ["pro", "max", "pro_trial"] as const) {
      expect(pictureMode(p, "generated")).toBe("generated");
      expect(pictureMode(p, "library")).toBe("library");
      expect(pictureMode(p, "none")).toBe("none");
    }
  });
  test("asking for no pictures is never turned into pictures", () => {
    expect(pictureMode("free", "none")).toBe("none");
  });
});

test.describe("the Jooma mark", () => {
  test("Free and the trial are marked; Standard, Pro and Max are clean (red note)", () => {
    expect(exportMark("free")).toBe(EXPORT_MARK_TEXT);
    expect(exportMark("pro_trial")).toBe(EXPORT_MARK_TEXT);
    expect(exportMark("standard")).toBeNull();
    expect(exportMark("pro")).toBeNull();
    expect(exportMark("max")).toBeNull();
  });
  test("the mark is small and plain", () => {
    expect(EXPORT_MARK_TEXT).toBe("Made with Jooma");
  });
});

test.describe("refines", () => {
  test("Free: a line at 8 used, a sheet at 10", () => {
    expect(refineCheck("free", 7)).toEqual({ ok: true, left: 3, line: null });
    expect(refineCheck("free", 8)).toEqual({ ok: true, left: 2, line: "2 refines left this week." });
    expect(refineCheck("free", 9)).toEqual({ ok: true, left: 1, line: "1 refine left this week." });
    expect(refineCheck("free", 10)).toMatchObject({ ok: false, left: 0, prompt: "P7" });
    expect(refineCheck("free", 11)).toMatchObject({ ok: false, left: 0 });
  });
  test("a bad count never gives more than 10", () => {
    expect(refineCheck("free", -5)).toMatchObject({ ok: true, left: 10 });
  });
  test("every other plan refines without limit", () => {
    for (const p of ["pro_trial", "standard", "pro", "max"] as const) {
      expect(refineCheck(p, 500)).toEqual({ ok: true, left: null, line: null });
    }
  });
});

test.describe("deck picture options on the server", () => {
  test("Free and Standard: every picture from the library, whatever was sent", () => {
    for (const plan of ["free", "standard"] as const) {
      expect(deckImageOptions(plan, { imageSource: "ai", imageMixWeb: 0 })).toEqual({ imageSource: "web", imageMixWeb: 10, forced: true });
      expect(deckImageOptions(plan, { imageSource: "auto", imageMixWeb: 8 })).toEqual({ imageSource: "web", imageMixWeb: 10, forced: true });
      expect(deckImageOptions(plan, {})).toEqual({ imageSource: "web", imageMixWeb: 10, forced: true });
    }
  });
  test("library-only requests are left alone on every plan", () => {
    expect(deckImageOptions("free", { imageSource: "web", imageMixWeb: 10 })).toEqual({ imageSource: "web", imageMixWeb: 10, forced: false });
  });
  test("Pro, Max and the trial keep what they asked for", () => {
    for (const plan of ["pro", "max", "pro_trial"] as const) {
      expect(deckImageOptions(plan, { imageSource: "ai", imageMixWeb: 0 })).toEqual({ imageSource: "ai", imageMixWeb: 0, forced: false });
    }
  });
});
