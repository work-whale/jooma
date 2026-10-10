import { test, expect } from "@playwright/test";
import { applySheetOp, isSheetOp, setSheetText, sheetOpFocus, sheetSnapshot, sheetTextAt } from "@/app/lib/jo/sheet-ops";
import { readJoProgress } from "@/app/lib/jo/progress";
import { joSheetResponseFormat } from "@/app/lib/jo/sheet-schema";
import { normalizeDraft, defaultDesign } from "@/app/lib/sheets/normalize";
import type { SheetOp } from "@/app/lib/jo/types";
import type { SheetDoc } from "@/app/lib/sheets/types";

/*
 * Jo edits a sheet with small ops addressed by id. They come from a model, so
 * each has to land exactly where it says, and anything that does not fit the
 * sheet has to do nothing at all rather than break it.
 */

function sheet(): SheetDoc {
  return normalizeDraft(
    {
      title: "Volcanoes",
      objective: "I am learning to explain why volcanoes erupt.",
      intro: { variant: "fact", label: "Did you know?", text: "There are 1,350 active volcanoes.", emoji: "🌋" },
      sections: [
        {
          title: "Read",
          emoji: "📖",
          instructions: "Read the text.",
          blocks: [{ type: "passage", title: "Fire mountain", paragraphs: ["First paragraph.", "Second paragraph."] }],
        },
        {
          title: "Questions",
          emoji: "✏️",
          instructions: "Answer the questions.",
          blocks: [
            { type: "mcq", prompt: "What comes out of a volcano?", options: ["Lava", "Water"], answers: [0], marks: 1, domain: "2b" },
            { type: "truefalse", prompt: "True or false?", statements: [{ text: "Lava is cold.", answer: false }], marks: 1, domain: "2b" },
            { type: "short", prompt: "Why do volcanoes erupt?", quote: "", lines: 2, answer: "Pressure builds.", marks: 2, domain: "2d" },
          ],
        },
      ],
      teacherNotes: [],
    },
    { tool: "comprehension", subtitle: "Year 4 · English", design: defaultDesign("comprehension", "paper") },
  );
}

const op = <T extends SheetOp>(o: T) => o;

test.describe("setText", () => {
  test("replaces a block field, a list item and a section field by path", () => {
    const doc = sheet();
    expect(setSheetText(doc, "s1b2.prompt", "Explain why.")?.sections[1].blocks[2]).toMatchObject({ prompt: "Explain why." });
    expect(sheetTextAt(setSheetText(doc, "s0b0.paragraphs.1", "New second.")!, "s0b0.paragraphs.1")).toBe("New second.");
    expect(setSheetText(doc, "s1.instructions", "Answer all of them.")?.sections[1].instructions).toBe("Answer all of them.");
    expect(setSheetText(doc, "title", "Mighty volcanoes")?.title).toBe("Mighty volcanoes");
    expect(setSheetText(doc, "intro", "Some are under the sea.")?.intro?.text).toBe("Some are under the sea.");
  });

  test("a true or false statement's text changes and its answer is kept", () => {
    const next = setSheetText(sheet(), "s1b1.statements.0", "Lava is very hot.")!;
    expect(next.sections[1].blocks[1]).toMatchObject({ statements: [{ text: "Lava is very hot.", answer: false }] });
  });

  test("an index one past the end adds an item", () => {
    const next = setSheetText(sheet(), "s1b0.options.2", "Ash")!;
    expect(next.sections[1].blocks[0]).toMatchObject({ options: ["Lava", "Water", "Ash"] });
  });

  test("a path that is not text, or does not exist, does nothing", () => {
    const doc = sheet();
    expect(setSheetText(doc, "s1b0.answers.0", "1")).toBeNull();
    expect(setSheetText(doc, "s1b0.marks", "3")).toBeNull();
    expect(setSheetText(doc, "nope.prompt", "x")).toBeNull();
    expect(setSheetText(doc, "s1b0.options.9", "x")).toBeNull();
    expect(setSheetText(doc, "s1b1.statements.1", "A new statement")).toBeNull();
  });

  test("LaTeX from the model is cleaned, as a generated sheet is", () => {
    const next = setSheetText(sheet(), "s1b2.prompt", "What is \\frac{3}{4} of 8?")!;
    expect((next.sections[1].blocks[2] as { prompt: string }).prompt).not.toContain("\\frac");
  });
});

test.describe("applySheetOp", () => {
  test("replaceBlock keeps the block's id and normalises it", () => {
    const applied = applySheetOp(
      sheet(),
      op({ op: "replaceBlock", label: "Turning Q3 into multiple choice", blockId: "s1b2", block: { type: "mcq", prompt: "Why?", options: ["Heat", "Pressure"], answers: [1, 7], marks: 1, domain: "2d" } }),
    )!;
    expect(applied.focus).toBe("s1b2");
    expect(applied.doc.sections[1].blocks[2]).toEqual({ id: "s1b2", type: "mcq", prompt: "Why?", options: ["Heat", "Pressure"], answers: [1], marks: 1, domain: "2d" });
  });

  test("insertBlock goes after the named block, or first, and gets a fresh id", () => {
    const block = { type: "text", text: "Read carefully." };
    const after = applySheetOp(sheet(), op({ op: "insertBlock", label: "Adding a tip", sectionId: "s1", afterBlockId: "s1b0", block }))!;
    expect(after.doc.sections[1].blocks.map((b) => b.type)).toEqual(["mcq", "text", "truefalse", "short"]);
    expect(after.focus).toBe(after.doc.sections[1].blocks[1].id);
    expect(after.focus).not.toMatch(/^s1b/);

    const first = applySheetOp(sheet(), op({ op: "insertBlock", label: "Adding a tip", sectionId: "s1", afterBlockId: "", block }))!;
    expect(first.doc.sections[1].blocks[0].type).toBe("text");
  });

  test("addSection lands after the named section with its blocks", () => {
    const applied = applySheetOp(
      sheet(),
      op({ op: "addSection", label: "Adding vocabulary", afterSectionId: "s0", title: "Vocabulary", emoji: "🔤", instructions: "Match the words.", blocks: [{ type: "wordbank", title: "Words", words: ["magma", "crater"] }] }),
    )!;
    expect(applied.doc.sections.map((s) => s.title)).toEqual(["Read", "Vocabulary", "Questions"]);
    expect(applied.focus).toBe(`sh:${applied.doc.sections[1].id}`);
  });

  test("delete and design ops", () => {
    const doc = sheet();
    expect(applySheetOp(doc, op({ op: "deleteBlock", label: "x", blockId: "s1b1" }))!.doc.sections[1].blocks).toHaveLength(2);
    expect(applySheetOp(doc, op({ op: "deleteSection", label: "x", sectionId: "s0" }))!.doc.sections).toHaveLength(1);
    expect(applySheetOp(doc, op({ op: "setDesign", label: "x", key: "fontScale", value: "XL" }))!.doc.design.fontScale).toBe("xl");
    expect(applySheetOp(doc, op({ op: "setDesign", label: "x", key: "answers", value: "false" }))!.doc.design.answers).toBe(false);
    expect(applySheetOp(doc, op({ op: "setDesign", label: "x", key: "paper", value: "a3" }))).toBeNull();
    for (const key of ["objective", "intro", "diffNote"] as const) {
      expect(applySheetOp(doc, op({ op: "setDesign", label: "x", key, value: "false" }))!.doc.design[key], key).toBe(false);
    }
  });

  test("an op that does not fit the sheet does nothing and leaves it untouched", () => {
    const doc = sheet();
    const copy = JSON.stringify(doc);
    expect(applySheetOp(doc, op({ op: "replaceBlock", label: "x", blockId: "missing", block: { type: "text", text: "x" } }))).toBeNull();
    expect(applySheetOp(doc, op({ op: "replaceBlock", label: "x", blockId: "s1b0", block: { type: "text", text: "" } }))).toBeNull();
    expect(applySheetOp(doc, op({ op: "insertBlock", label: "x", sectionId: "s9", afterBlockId: "", block: { type: "text", text: "x" } }))).toBeNull();
    expect(applySheetOp(doc, op({ op: "deleteSection", label: "x", sectionId: "s9" }))).toBeNull();
    expect(JSON.stringify(doc)).toBe(copy);
  });

  test("focus points at what an op is about to change, by the page's keys", () => {
    const doc = sheet();
    expect(sheetOpFocus(doc, op({ op: "setText", label: "x", target: "title", text: "x" }))).toBe("head");
    expect(sheetOpFocus(doc, op({ op: "setText", label: "x", target: "intro", text: "x" }))).toBe("intro");
    expect(sheetOpFocus(doc, op({ op: "setText", label: "x", target: "s1.title", text: "x" }))).toBe("sh:s1");
    expect(sheetOpFocus(doc, op({ op: "setText", label: "x", target: "s1b2.prompt", text: "x" }))).toBe("s1b2");
    expect(sheetOpFocus(doc, op({ op: "deleteBlock", label: "x", blockId: "s1b0" }))).toBe("s1b0");
    expect(sheetOpFocus(doc, op({ op: "setDesign", label: "x", key: "answers", value: "true" }))).toBeNull();
  });
});

test.describe("what goes to and comes from the model", () => {
  test("the snapshot keeps every id and word and none of the layout", () => {
    const snap = sheetSnapshot(sheet());
    expect(snap.sections.map((s) => s.id)).toEqual(["s0", "s1"]);
    expect(snap.sections[1].blocks.map((b) => b.id)).toEqual(["s1b0", "s1b1", "s1b2"]);
    expect(snap).not.toHaveProperty("design.themeId");
  });

  test("isSheetOp accepts only whole, known ops", () => {
    expect(isSheetOp({ op: "setText", label: "x", target: "title", text: "y" })).toBe(true);
    expect(isSheetOp({ op: "setText", label: "x", target: "title" })).toBe(false);
    expect(isSheetOp({ op: "explode", label: "x" })).toBe(false);
    expect(isSheetOp({ op: "replaceBlock", label: "x", blockId: "s1b0", block: "text" })).toBe(false);
  });

  test("the response format is strict, ordered reply first, with one shared block definition", () => {
    const rf = joSheetResponseFormat("comprehension");
    const schema = rf.json_schema.schema as { properties: Record<string, unknown>; required: string[]; $defs: { block: { anyOf: unknown[] } } };
    expect(rf.json_schema.strict).toBe(true);
    expect(Object.keys(schema.properties)).toEqual(["reply", "clarify", "ops", "summary"]);
    expect(schema.required).toEqual(["reply", "clarify", "ops", "summary"]);
    expect(schema.$defs.block.anyOf.length).toBeGreaterThan(5);
    expect(JSON.stringify(joSheetResponseFormat("worksheet"))).toContain('"table"');
    expect(JSON.stringify(rf)).not.toContain('"table"');
  });
});

test.describe("readJoProgress", () => {
  const isOp = (v: unknown): v is SheetOp => isSheetOp(v);
  const answer = JSON.stringify({
    reply: "I'll simplify Q3.",
    clarify: null,
    ops: [
      { op: "setText", label: "Simplifying question 3", target: "s1b2.prompt", text: "Why does a volcano erupt?" },
      { op: "deleteBlock", label: "Removing the true or false", blockId: "s1b1" },
    ],
    summary: "Q3 is simpler.",
  });

  test("an op only counts once the next one, or the summary, has started", () => {
    const cut = answer.indexOf('{"op":"deleteBlock"') + 5;
    const mid = readJoProgress(answer.slice(0, cut), isOp);
    expect(mid.reply).toBe("I'll simplify Q3.");
    expect(mid.ops.map((o) => o.op)).toEqual(["setText"]);
    expect(mid.opsDone).toBe(false);

    const halfFirst = readJoProgress(answer.slice(0, answer.indexOf("Why does") + 4), isOp);
    expect(halfFirst.ops).toEqual([]);

    const all = readJoProgress(answer, isOp, true);
    expect(all.ops).toHaveLength(2);
    expect(all.summary).toBe("Q3 is simpler.");
    expect(all.opsDone).toBe(true);
  });

  test("the reply shows while it is still being written", () => {
    expect(readJoProgress('{"reply":"I\'ll simp', isOp).reply).toBe("I'll simp");
  });

  test("a follow up question appears only once it is whole", () => {
    const ask = JSON.stringify({ reply: "Happy to.", clarify: { question: "What should improve?", options: ["Easier", "Harder"], multi: true }, ops: [], summary: "" });
    expect(readJoProgress(ask.slice(0, ask.indexOf("Harder")), isOp).clarify).toBeNull();
    expect(readJoProgress(ask, isOp, true).clarify).toEqual({ question: "What should improve?", options: ["Easier", "Harder"], multi: true });
  });
});
