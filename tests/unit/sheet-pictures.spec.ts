import { test, expect } from "@playwright/test";
import { sheetResponseFormat, kindsForTypes } from "@/app/lib/sheets/schema";
import { MAX_SHEET_PICTURES, normalizeBlock, normalizeDraft, parseSheet, serializeSheet, sheetImages } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { parsePictures, picturesPromptLine } from "@/app/lib/sheets/picture-options";
import { fillBandSetPictures, fillSheetPictures, markFinding, sharePictures, type FoundPicture, type PictureFinder } from "@/app/lib/sheets/picture-fill";
import { sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { showsPictures } from "@/app/lib/sheets/visibility";
import { newBlock, updateBlockById } from "@/app/lib/sheets/edit";
import { fitPicture } from "@/app/lib/sheets/docx";
import { worksheetRequest } from "@/app/lib/worksheet-prompt";
import { comprehensionMessages } from "@/app/lib/comprehension-prompt";
import { joSheetResponseFormat } from "@/app/lib/jo/sheet-schema";
import { applySheetOp, setSheetText, sheetSnapshot } from "@/app/lib/jo/sheet-ops";
import { aiImagePrompt } from "@/app/lib/ai-image-prompt";
import { emptyBandSet, parseBandSet, serializeBandSet, withBand } from "@/app/lib/bands";
import type { ImageBlock, SheetDoc } from "@/app/lib/sheets/types";

/*
 * Pictures on a worksheet or comprehension. The model only says what to look
 * for; where a picture comes from is found afterwards, so a URL from the model
 * is never trusted. A sheet holds at most three, nothing may depend on them,
 * and a differentiated set pays for each picture once.
 */

type Json = Record<string, unknown>;

const ctx = sheetContext("worksheet", { yearGroup: "Year 5", subject: "Science" });

function variantsOf(format: ReturnType<typeof sheetResponseFormat>): string[] {
  const schema = format.json_schema.schema as Json;
  const sections = (schema.properties as Json).sections as Json;
  const blocks = (((sections.items as Json).properties as Json).blocks as Json).items as { anyOf: Json[] };
  return blocks.anyOf.map((v) => ((v.properties as Json).type as { enum: string[] }).enum[0]);
}

function countProperties(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + countProperties(x), 0);
  const o = node as Json;
  let n = o.properties ? Object.keys(o.properties as Json).length : 0;
  for (const v of Object.values(o)) n += countProperties(v);
  return n;
}

const img = (query: string, extra: Json = {}) => ({ type: "image", query, alt: `A picture of ${query}`, ...extra });

/** A sheet with a picture in each of its first sections, and one question. */
function sheetWith(queries: string[]): SheetDoc {
  return normalizeDraft(
    {
      title: "The water cycle",
      sections: queries.map((q, i) => ({ title: `Part ${i + 1}`, blocks: [img(q), { type: "short", prompt: "Why?", lines: 2, answer: "", marks: 1 }] })),
    },
    ctx,
  );
}

const pic = (n: number): FoundPicture => ({ src: `https://cdn.test/${n}.jpg`, width: 1536, height: 1024, source: "web" });

test.describe("the schema", () => {
  test("offers a picture block only when pictures were asked for", () => {
    const kinds = kindsForTypes("worksheet", []);
    expect(variantsOf(sheetResponseFormat({ tool: "worksheet", kinds, passage: false }))).not.toContain("image");
    expect(variantsOf(sheetResponseFormat({ tool: "worksheet", kinds, passage: false, images: true }))).toContain("image");
  });

  test("the picture variant has no src: the model cannot say where a picture is", () => {
    const format = sheetResponseFormat({ tool: "comprehension", kinds: kindsForTypes("comprehension", []), passage: true, images: true });
    const schema = format.json_schema.schema as Json;
    const blocks = ((((schema.properties as Json).sections as Json).items as Json).properties as Json).blocks as Json;
    const image = ((blocks.items as { anyOf: Json[] }).anyOf).find((v) => ((v.properties as Json).type as { enum: string[] }).enum[0] === "image")!;
    expect(Object.keys(image.properties as Json).sort()).toEqual(["alt", "query", "type"]);
  });

  test("stays inside OpenAI's 100 property limit with every kind and pictures on", () => {
    expect(countProperties(sheetResponseFormat({ tool: "worksheet", kinds: kindsForTypes("worksheet", []), passage: false, images: true }).json_schema.schema)).toBeLessThanOrEqual(100);
    expect(countProperties(sheetResponseFormat({ tool: "comprehension", kinds: kindsForTypes("comprehension", []), passage: true, images: true }).json_schema.schema)).toBeLessThanOrEqual(100);
  });

  test("Jo's edit schema never offers a picture block", () => {
    expect(JSON.stringify(joSheetResponseFormat("worksheet"))).not.toContain('"enum":["image"]');
  });
});

test.describe("the prompts", () => {
  const worksheet = { curriculum: "England", yearGroup: "Year 5", subject: "Science", learningObjective: "the water cycle" };

  test("a worksheet with pictures asks for them, and its schema allows them", () => {
    const built = worksheetRequest({ ...worksheet, pictures: { source: "web", style: "illustration" } });
    if ("error" in built) throw new Error(built.error);
    expect(built.messages[1].content).toContain("PICTURES");
    expect(built.messages[1].content).toContain("No question, instruction or answer may refer to a picture");
    expect(variantsOf(built.response_format)).toContain("image");
  });

  test("without pictures, neither the prompt nor the schema mentions them", () => {
    const built = worksheetRequest({ ...worksheet, pictures: null });
    if ("error" in built) throw new Error(built.error);
    expect(built.messages[1].content).not.toContain("PICTURES");
    expect(variantsOf(built.response_format)).not.toContain("image");
  });

  test("a comprehension with pictures asks for them too", () => {
    const built = comprehensionMessages({ curriculum: "England", yearGroup: "Year 4", textSource: "generate", topic: "Volcanoes", contentDomains: ["2b Retrieve"], numQuestions: 2, pictures: { source: "ai", style: "storybook" } });
    if ("error" in built) throw new Error(built.error);
    expect(built.messages[1].content).toContain('"Volcanoes"');
    expect(variantsOf(built.response_format)).toContain("image");
  });

  test("nonsense in the request is no pictures, and a bad style falls back", () => {
    expect(parsePictures(null)).toBeNull();
    expect(parsePictures({ source: "everywhere" })).toBeNull();
    expect(parsePictures("web")).toBeNull();
    expect(parsePictures({ source: "ai", style: "neon" })).toEqual({ source: "ai", style: "illustration" });
    expect(picturesPromptLine(null, "x")).toBe("");
  });
});

test.describe("normalising", () => {
  test("a src from the model is ignored: pictures are found, never written", () => {
    const b = normalizeBlock(img("volcano", { src: "https://evil.test/x.png" }), "s0b0") as ImageBlock;
    expect(b.src).toBe("");
    expect(b.size).toBe("m");
    expect(b.query).toBe("volcano");
  });

  test("a picture with nothing to search for yet (mid stream) is left out", () => {
    expect(normalizeBlock({ type: "image", query: "", alt: "something" }, "s0b0")).toBeNull();
    expect(normalizeBlock({ type: "image" }, "s0b0")).toBeNull();
  });

  test("a missing description falls back to the search", () => {
    expect((normalizeBlock({ type: "image", query: "lava flow", alt: "" }, "s0b0") as ImageBlock).alt).toBe("lava flow");
  });

  test(`at most ${MAX_SHEET_PICTURES} pictures, the first ones in reading order, with their ids unchanged`, () => {
    const doc = normalizeDraft(
      { sections: [{ title: "A", blocks: [img("one"), img("two")] }, { title: "B", blocks: [img("three"), { type: "text", text: "kept" }, img("four")] }] },
      ctx,
    );
    expect(sheetImages(doc).map((b) => b.query)).toEqual(["one", "two", "three"]);
    expect(sheetImages(doc).map((b) => b.id)).toEqual(["s0b0", "s0b1", "s1b0"]);
    // Other blocks are untouched by the cap.
    expect(doc.sections[1].blocks.map((b) => b.id)).toEqual(["s1b0", "s1b1"]);
  });

  test("a picture is not a question: question numbers skip it", () => {
    const md = sheetToMarkdown(sheetWith(["cloud"]));
    expect(md).toContain("**1.** Why?");
  });
});

test.describe("filling pictures", () => {
  test("every picture is searched for once, and lands in its own block", async () => {
    const doc = sheetWith(["cloud", "rain"]);
    const calls: string[] = [];
    const find: PictureFinder = async (b) => {
      calls.push(b.query);
      return b.query === "cloud" ? pic(1) : pic(2);
    };
    const updates: string[] = [];
    const { serialized, found } = await fillSheetPictures(serializeSheet(doc), find, (s) => updates.push(s));
    expect(calls.sort()).toEqual(["cloud", "rain"]);
    const out = sheetImages(parseSheet(serialized)!);
    expect(out.map((b) => b.src)).toEqual([pic(1).src, pic(2).src]);
    expect(out.every((b) => !b.finding)).toBe(true);
    expect(found.map((f) => f?.src)).toEqual([pic(1).src, pic(2).src]);
    // The first update shows every frame as searching.
    expect(sheetImages(parseSheet(updates[0])!).every((b) => b.finding)).toBe(true);
  });

  test("a miss, or a finder that throws, leaves an empty frame that is no longer searching", async () => {
    const doc = sheetWith(["cloud", "rain"]);
    const find: PictureFinder = async (b) => {
      if (b.query === "rain") throw new Error("network");
      return null;
    };
    const { serialized, found } = await fillSheetPictures(serializeSheet(doc), find, () => {});
    const out = sheetImages(parseSheet(serialized)!);
    expect(out.map((b) => b.src)).toEqual(["", ""]);
    expect(out.some((b) => b.finding)).toBe(false);
    expect(found).toEqual([null, null]);
  });

  test("a picture already chosen is never searched for again", async () => {
    let doc = sheetWith(["cloud"]);
    doc = updateBlockById(doc, sheetImages(doc)[0].id, { src: "https://cdn.test/mine.jpg" });
    let calls = 0;
    await fillSheetPictures(serializeSheet(doc), async () => { calls++; return pic(9); }, () => {});
    expect(calls).toBe(0);
  });

  test("a sheet with no pictures comes back unchanged without a single update", async () => {
    const doc = normalizeDraft({ title: "T", sections: [{ title: "A", blocks: [{ type: "text", text: "hi" }] }] }, ctx);
    const s = serializeSheet(doc);
    let updates = 0;
    const res = await fillSheetPictures(s, async () => pic(1), () => updates++);
    expect(res.serialized).toBe(s);
    expect(updates).toBe(0);
  });

  test("another version reuses pictures by position, and leaves positions with none for its own search", () => {
    const doc = sheetWith(["a", "b", "c"]);
    const out = sharePictures(markFinding(doc), [pic(1), null, pic(3)]);
    const imgs = sheetImages(out);
    expect(imgs.map((b) => b.src)).toEqual([pic(1).src, "", pic(3).src]);
    expect(imgs[0].finding).toBeUndefined();
    expect(imgs[1].finding).toBe(true);
  });

  test("a differentiated set pays for each picture once: the other bands reuse the first band's", async () => {
    let set = emptyBandSet(["WTS", "EXS", "GDS"]);
    set = withBand(set, "WTS", { output: serializeSheet(sheetWith(["cloud", "rain"])), pending: false });
    set = withBand(set, "EXS", { output: serializeSheet(sheetWith(["cloud", "rain", "river"])), pending: false });
    set = withBand(set, "GDS", { pending: false, error: "failed" });
    const calls: string[] = [];
    let n = 0;
    const out = await fillBandSetPictures(serializeBandSet(set), async (b) => { calls.push(b.query); return pic(++n); }, () => {});
    // Two for the first band, plus the third picture only EXS has.
    expect(calls).toHaveLength(3);
    const parsed = parseBandSet(out)!;
    const wts = sheetImages(parseSheet(parsed.bands.find((b) => b.band === "WTS")!.output)!);
    const exs = sheetImages(parseSheet(parsed.bands.find((b) => b.band === "EXS")!.output)!);
    expect(exs[0].src).toBe(wts[0].src);
    expect(exs[1].src).toBe(wts[1].src);
    expect(exs[2].src).not.toBe("");
  });
});

test.describe("showing and copying", () => {
  test("pictures show unless switched off, including on sheets saved before the switch", () => {
    const doc = sheetWith(["cloud"]);
    expect(showsPictures(doc)).toBe(true);
    expect(showsPictures({ ...doc, design: { ...doc.design, pictures: false } })).toBe(false);
  });

  test("Copy gives a found picture as markdown, and leaves out empty or hidden ones", () => {
    let doc = sheetWith(["cloud", "rain"]);
    doc = updateBlockById(doc, sheetImages(doc)[0].id, { src: "https://cdn.test/c.jpg", alt: "A [grey] cloud" });
    const md = sheetToMarkdown(doc);
    expect(md).toContain("![A grey cloud](https://cdn.test/c.jpg)");
    expect(md).not.toContain("![A picture of rain]");
    expect(sheetToMarkdown({ ...doc, design: { ...doc.design, pictures: false } })).not.toContain("![");
  });

  test("a new picture block from the add menu starts empty, ready to choose", () => {
    const b = newBlock("image");
    expect(b).toMatchObject({ type: "image", src: "", query: "", size: "m" });
  });

  test("Word fits a picture inside its frame, keeping its shape", () => {
    expect(fitPicture("m", 1536, 1024)).toEqual({ width: 300, height: 200 });
    expect(fitPicture("m", 1000, 2000)).toEqual({ width: 100, height: 200 });
    expect(fitPicture("l", 0, 0)).toEqual({ width: 480, height: 320 });
  });
});

test.describe("Jo and pictures", () => {
  function withPicture(): { doc: SheetDoc; id: string } {
    let doc = sheetWith(["cloud"]);
    const id = sheetImages(doc)[0].id;
    doc = updateBlockById(doc, id, { src: "https://cdn.test/c.jpg" });
    return { doc, id };
  }

  test("Jo sees what a picture shows, not where it is stored", () => {
    const { doc, id } = withPicture();
    const block = sheetSnapshot(doc).sections[0].blocks.find((b) => b.id === id)!;
    expect(JSON.stringify(block)).not.toContain("cdn.test");
    expect(block).toMatchObject({ type: "image", alt: "A picture of cloud" });
  });

  test("Jo can rewrite a picture's description but never its address or search", () => {
    const { doc, id } = withPicture();
    expect(setSheetText(doc, `${id}.src`, "https://evil.test/x.png")).toBeNull();
    expect(setSheetText(doc, `${id}.query`, "something else")).toBeNull();
    const next = setSheetText(doc, `${id}.alt`, "Clouds over hills")!;
    expect(sheetImages(next)[0]).toMatchObject({ alt: "Clouds over hills", src: "https://cdn.test/c.jpg" });
  });

  test("Jo can switch pictures off and on in Design", () => {
    const { doc } = withPicture();
    const off = applySheetOp(doc, { op: "setDesign", key: "pictures", value: "false", label: "Hiding pictures" })!;
    expect(off.doc.design.pictures).toBe(false);
    expect(applySheetOp(doc, { op: "setDesign", key: "pictures", value: "maybe", label: "x" })).toBeNull();
  });
});

test.describe("the AI picture prompt", () => {
  test("a slide's prompt is unchanged by default", () => {
    expect(aiImagePrompt("rocky planet surface", "photographic", "square", "The Rocky Four")).toBe(
      "Photographic, realistic, high quality, natural lighting. Subject: The Rocky Four — rocky planet surface. Square composition, balanced framing, centred subject, suitable for a presentation slide. Absolutely no text, no letters, no labels, no captions, no watermarks, no logos, no typography of any kind anywhere in the image. Pure visual only.",
    );
  });

  test("a sheet's picture is framed for print, and only that line changes", () => {
    const slide = aiImagePrompt("water cycle diagram", "illustration", "landscape", "The water cycle");
    const sheet = aiImagePrompt("water cycle diagram", "illustration", "landscape", "The water cycle", "printed worksheet");
    expect(sheet).toContain("suitable for a printed worksheet");
    expect(sheet.replace("printed worksheet", "presentation slide")).toBe(slide);
  });
});
