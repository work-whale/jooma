import { test, expect } from "@playwright/test";
import {
  activeBand,
  bandOutput,
  emptyBandSet,
  isBandSetOutput,
  parseBandSet,
  primaryOutput,
  replaceBandOutput,
  saveableBandSet,
  serializeBandSet,
  withBand,
} from "@/app/lib/bands";
import { bandUsageStep, orderedBands } from "@/app/lib/differentiation";
import { worksheetRequest } from "@/app/lib/worksheet-prompt";
import { comprehensionMessages } from "@/app/lib/comprehension-prompt";
import { outputExcerpt } from "@/app/lib/sheets/markdown";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * Differentiated versions: one output per band, stored together as one string
 * in tool_runs.output, and the prompts that pitch each one.
 */

const sheet = (title: string) =>
  serializeSheet(normalizeDraft({ title, sections: [] }, sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths" })));

test.describe("band set", () => {
  test("round trips, in canonical band order whatever order it was built in", () => {
    const out = serializeBandSet({ bands: [{ band: "GDS", output: "# G" }, { band: "WBS", output: "# W" }] });
    expect(isBandSetOutput(out)).toBe(true);
    const set = parseBandSet(out)!;
    expect(set.bands.map((b) => b.band)).toEqual(["WBS", "GDS"]);
    expect(parseBandSet(serializeBandSet(set))).toEqual(set);
  });

  test("a sheet and markdown are not band sets", () => {
    expect(isBandSetOutput(sheet("x"))).toBe(false);
    expect(parseBandSet("# Hello")).toBeNull();
    expect(parseBandSet(null)).toBeNull();
    // Cut off mid string: not readable as a whole set.
    expect(parseBandSet('{"kind":"jooma-bands","version":1,"bands":[{"band":"WBS","out')).toBeNull();
  });

  test("withBand changes one band and leaves the others exactly as they were", () => {
    const set = emptyBandSet(["WTS", "EXS"]);
    const next = withBand(set, "WTS", { output: "# T", pending: false });
    expect(next.bands).toEqual([
      { band: "WTS", output: "# T", pending: false },
      { band: "EXS", output: "", pending: true },
    ]);
    expect(set.bands[0].output).toBe("");
  });

  test("what gets saved drops the streaming flags and any band that failed", () => {
    let set = emptyBandSet(["WBS", "WTS", "GDS"]);
    set = withBand(set, "WBS", { output: "# W \\(\\frac{1}{2}\\)", pending: false });
    set = withBand(set, "WTS", { pending: false, error: "Generation failed" });
    set = withBand(set, "GDS", { output: sheet("Deep"), pending: false });
    const saved = parseBandSet(saveableBandSet(serializeBandSet(set)))!;
    expect(saved.bands.map((b) => b.band)).toEqual(["WBS", "GDS"]);
    expect(saved.bands.every((b) => b.pending === undefined && b.error === undefined)).toBe(true);
    // Markdown is cleaned of leaked LaTeX; a sheet is kept byte for byte.
    expect(saved.bands[0].output).not.toContain("\\frac");
    expect(saved.bands[1].output).toBe(sheet("Deep"));
  });

  test("nothing to save when every band failed", () => {
    const set = withBand(emptyBandSet(["EXS"]), "EXS", { pending: false, error: "x" });
    expect(saveableBandSet(serializeBandSet(set))).toBeNull();
  });

  test("the band on screen falls back to the first, and plain outputs pass through", () => {
    const out = serializeBandSet({ bands: [{ band: "WTS", output: "# T" }, { band: "GDS", output: "# G" }] });
    expect(activeBand(out, "GDS")).toBe("GDS");
    expect(activeBand(out, "WBS")).toBe("WTS");
    expect(activeBand(out, null)).toBe("WTS");
    expect(activeBand("# plain", "GDS")).toBeNull();

    expect(bandOutput(out, "GDS")).toBe("# G");
    expect(bandOutput("# plain", "GDS")).toBe("# plain");

    const edited = replaceBandOutput(out, "GDS", "# G2");
    expect(bandOutput(edited, "GDS")).toBe("# G2");
    expect(bandOutput(edited, "WTS")).toBe("# T");
    expect(replaceBandOutput("# plain", "GDS", "# new")).toBe("# new");
  });

  test("primaryOutput is the first version, or the output unchanged", () => {
    const out = serializeBandSet({ bands: [{ band: "EXS", output: "# E" }, { band: "WBS", output: "# W" }] });
    expect(primaryOutput(out)).toBe("# W");
    expect(primaryOutput("# plain")).toBe("# plain");
    expect(primaryOutput(null)).toBeNull();
  });

  test("the showcase excerpt reads the first version, even from a cut-off slice", () => {
    const out = serializeBandSet({ bands: [{ band: "WBS", output: sheet("Fractions for everyone") }, { band: "GDS", output: sheet("Deep") }] });
    expect(outputExcerpt(out.slice(0, 260))).toContain("Fractions for everyone");
    expect(outputExcerpt(serializeBandSet({ bands: [{ band: "EXS", output: "# A plan" }] }))).toBe("# A plan");
  });
});

test.describe("band prompts", () => {
  const base = {
    curriculum: "England National Curriculum",
    yearGroup: "Year 4",
    subject: "Maths",
    learningObjective: "Add fractions",
    differentiate: "yes" as const,
    differentiationLevels: ["WBS", "GDS"],
  };
  const userPrompt = (built: ReturnType<typeof worksheetRequest>) => {
    if ("error" in built) throw new Error(built.error);
    return built.messages[1].content;
  };

  test("orderedBands keeps canonical order and drops unknowns", () => {
    expect(orderedBands(["GDS", "nope", "WBS"])).toEqual(["WBS", "GDS"]);
  });

  test("a worksheet band request is pitched at that band, with no blended note", () => {
    const p = userPrompt(worksheetRequest({ ...base, band: "WBS" }));
    expect(p).toContain("This is the WBS (Working Below Standard) version");
    expect(p).toContain('How this version is pitched: WBS (Working Below Standard)');
    expect(p).not.toContain('One titled "Differentiation"');
    expect(p).toContain("Never print the band code");
  });

  test("without a band the worksheet prompt keeps the blended note", () => {
    const p = userPrompt(worksheetRequest(base));
    expect(p).toContain('One titled "Differentiation"');
    expect(p).not.toContain("version of the resource");
  });

  test("an unknown band is ignored rather than trusted", () => {
    const p = userPrompt(worksheetRequest({ ...base, band: "TOP SET" }));
    expect(p).not.toContain("TOP SET");
    expect(p).toContain('One titled "Differentiation"');
  });

  test("a supported comprehension reads a shorter passage on the same topic", () => {
    const req = {
      curriculum: "England National Curriculum",
      yearGroup: "Year 4",
      textSource: "generate" as const,
      topic: "Volcanoes",
      passageWordCount: 300,
      contentDomains: ["2b – retrieve"],
      numQuestions: 2,
    };
    const text = (b?: string) => {
      const built = comprehensionMessages({ ...req, band: b });
      if ("error" in built) throw new Error(built.error);
      return built.messages[1].content;
    };
    expect(text("WTS")).toContain("about 210 words");
    expect(text("GDS")).toContain("about 300 words");
    expect(text()).toContain("about 300 words");
  });

  test("only the first band counts as a generation", () => {
    expect(bandUsageStep("WBS", 0)).toBeNull();
    expect(bandUsageStep("GDS", 1)).toBe("Band version");
    expect(bandUsageStep(undefined, 3)).toBeNull();
    expect(bandUsageStep("nope", 2)).toBeNull();
  });
});
