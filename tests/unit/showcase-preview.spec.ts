import { test, expect } from "@playwright/test";
import {
  PREVIEW_BLOCKS,
  PREVIEW_CHARS,
  PREVIEW_PARAGRAPHS,
  showcasePreview,
  type ShowcasePreview,
} from "@/app/lib/landing/showcase-preview";
import { serializeBandSet } from "@/app/lib/bands";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import type { SheetBlock, SheetDoc, SheetSection } from "@/app/lib/sheets/types";

/*
 * The "Made with Jooma" card for a Worksheet or Comprehension: the top of its
 * first page, cut down from the saved output before it reaches the landing page.
 */

const text = (id: string): SheetBlock => ({ id, type: "text", text: `Block ${id}` });

const section = (id: string, blocks: SheetBlock[]): SheetSection => ({
  id,
  title: `Section ${id}`,
  emoji: "",
  instructions: "",
  blocks,
});

function sheet(title: string, sections: SheetSection[]): SheetDoc {
  const base = normalizeDraft({ title, sections: [] }, sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths" }));
  return { ...base, sections, teacherNotes: [{ title: "Misconceptions", points: ["One"] }] };
}

const asSheet = (p: ShowcasePreview | null) => {
  expect(p && "sheet" in p).toBe(true);
  return (p as { sheet: SheetDoc }).sheet;
};

test("a sheet keeps only its first section, capped, without teacher notes or answers", () => {
  const many = Array.from({ length: PREVIEW_BLOCKS + 3 }, (_, i) => text(`a${i}`));
  const doc = sheet("Fractions", [section("one", many), section("two", [text("b0")])]);
  const out = asSheet(showcasePreview(serializeSheet(doc)));

  expect(out.title).toBe("Fractions");
  expect(doc.design.answers).toBe(true);
  expect(out.design).toEqual({ ...doc.design, answers: false });
  expect(out.sections.map((s) => s.id)).toEqual(["one"]);
  expect(out.sections[0].blocks.map((b) => b.id)).toEqual(many.slice(0, PREVIEW_BLOCKS).map((b) => b.id));
  expect(out.teacherNotes).toEqual([]);
});

test("a long passage keeps its opening paragraphs only", () => {
  const paragraphs = Array.from({ length: PREVIEW_PARAGRAPHS + 4 }, (_, i) => `Paragraph ${i}`);
  const doc = sheet("Volcanoes", [section("read", [{ id: "p", type: "passage", title: "Etna", paragraphs }])]);
  const block = asSheet(showcasePreview(serializeSheet(doc))).sections[0].blocks[0];
  expect(block).toMatchObject({ type: "passage", title: "Etna", paragraphs: paragraphs.slice(0, PREVIEW_PARAGRAPHS) });
});

test("a sheet with no sections still previews its header", () => {
  const out = asSheet(showcasePreview(serializeSheet(sheet("Empty", []))));
  expect(out.title).toBe("Empty");
  expect(out.sections).toEqual([]);
});

test("does not change the stored sheet it was given", () => {
  const doc = sheet("Kept", [section("one", Array.from({ length: PREVIEW_BLOCKS + 2 }, (_, i) => text(`k${i}`)))]);
  const before = structuredClone(doc);
  showcasePreview(serializeSheet(doc));
  expect(doc).toEqual(before);
});

test("of differentiated versions, the first band", () => {
  const out = serializeBandSet({
    bands: [
      { band: "WBS", output: serializeSheet(sheet("Working towards", [])) },
      { band: "GDS", output: serializeSheet(sheet("Greater depth", [])) },
    ],
  });
  expect(asSheet(showcasePreview(out)).title).toBe("Working towards");
});

test("older markdown output is cut at a line break", () => {
  const short = "# Title\n\nA line.";
  expect(showcasePreview(short)).toEqual({ markdown: short });

  const line = "x".repeat(99);
  const long = Array.from({ length: 40 }, () => line).join("\n");
  const p = showcasePreview(long) as { markdown: string };
  expect(p.markdown.length).toBeLessThanOrEqual(PREVIEW_CHARS);
  expect(p.markdown.length).toBeGreaterThan(PREVIEW_CHARS - 100);
  expect(p.markdown.split("\n").every((l) => l === line)).toBe(true);
});

test("nothing to draw: null, empty, blank and a broken sheet", () => {
  expect(showcasePreview(null)).toBeNull();
  expect(showcasePreview(undefined)).toBeNull();
  expect(showcasePreview("")).toBeNull();
  expect(showcasePreview("  \n ")).toBeNull();
  // A sheet that will not parse is shown as the placeholder, never as raw JSON.
  expect(showcasePreview('{"kind":"jooma-sheet","sections":[')).toBeNull();
  expect(showcasePreview('{"some":"json"}')).toBeNull();
});
