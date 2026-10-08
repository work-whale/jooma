import { test, expect } from "@playwright/test";
import {
  isSheetOutput,
  normalizeBlock,
  normalizeDraft,
  ownPassageSection,
  parseSheet,
  serializeSheet,
} from "@/app/lib/sheets/normalize";
import { finishSheet, sheetContext } from "@/app/lib/sheets/context";

/*
 * What the model sends is checked, not trusted. The schema fixes the shape;
 * normalize fixes the rest: answers that point at options that do not exist,
 * pairings that are not one to one, LaTeX that slipped past the prompt, and a
 * stream that is only half way through.
 */

const ctx = sheetContext("worksheet", { yearGroup: "Year 5", subject: "Maths" });

test.describe("normalizeDraft", () => {
  test("cleans LaTeX in every string, so a maths sheet never shows slashes", () => {
    const doc = normalizeDraft(
      {
        title: "Adding \\( \\frac{1}{2} \\) and more",
        sections: [{ title: "Fractions", emoji: "🍕", instructions: "", blocks: [{ type: "mcq", prompt: "What is \\( \\frac{1}{2} + \\frac{1}{4} \\)?", options: ["\\( \\frac{3}{4} \\)", "1/6"], answers: [0], marks: 1 }] }],
      },
      ctx,
    );
    expect(doc.title).toBe("Adding 1/2 and more");
    const q = doc.sections[0].blocks[0];
    expect(q.type === "mcq" && q.prompt).toBe("What is 1/2 + 1/4?");
    expect(q.type === "mcq" && q.options[0]).toBe("3/4");
  });

  test("ids are positional, so a longer stream keeps the ids already on screen", () => {
    const raw = { sections: [{ title: "A", blocks: [{ type: "text", text: "one" }, { type: "text", text: "two" }] }] };
    const doc = normalizeDraft(raw, ctx);
    expect(doc.sections[0].id).toBe("s0");
    expect(doc.sections[0].blocks.map((b) => b.id)).toEqual(["s0b0", "s0b1"]);
  });

  test("drops blocks with no type yet and sections with nothing in them", () => {
    const doc = normalizeDraft({ sections: [{ title: "", blocks: [{ prompt: "half" }] }, { title: "Real", blocks: [] }] }, ctx);
    expect(doc.sections.map((s) => s.title)).toEqual(["Real"]);
  });

  test("teacher's own passage leads, kept word for word", () => {
    const own = "First paragraph,\nwrapped.\n\nSecond   paragraph.";
    const c = sheetContext("comprehension", { yearGroup: "Year 4", textSource: "own", ownText: own });
    const doc = normalizeDraft({ sections: [{ title: "Retrieval", blocks: [{ type: "short", prompt: "Who?", lines: 2, answer: "", quote: "", marks: 1 }] }] }, c);
    expect(doc.sections[0].id).toBe("own");
    const passage = doc.sections[0].blocks[0];
    expect(passage.type === "passage" && passage.paragraphs).toEqual(["First paragraph, wrapped.", "Second   paragraph."]);
    expect(doc.sections[1].title).toBe("Retrieval");
  });

  test("the copyright sign becomes (c), as the markdown tools did", () => {
    const doc = normalizeDraft({ title: "© Jooma" }, ctx);
    expect(doc.title).toBe("(c) Jooma");
  });
});

test.describe("normalizeBlock", () => {
  test("mcq: answers that point past the options are dropped, options capped at 6", () => {
    const b = normalizeBlock({ type: "mcq", prompt: "Q", options: ["a", "b", "c", "d", "e", "f", "g"], answers: [1, 9, 1, -1], marks: 2 }, "x");
    expect(b).toMatchObject({ type: "mcq", options: ["a", "b", "c", "d", "e", "f"], answers: [1], marks: 2 });
  });

  test("matching: pairs that are not one to one fall back to the identity", () => {
    const b = normalizeBlock({ type: "matching", prompt: "", left: ["a", "b", "c"], right: ["1", "2", "3"], pairs: [0, 0, 2] }, "x");
    expect(b).toMatchObject({ pairs: [0, 1, 2] });
    const ok = normalizeBlock({ type: "matching", prompt: "", left: ["a", "b"], right: ["1", "2"], pairs: [1, 0] }, "x");
    expect(ok).toMatchObject({ pairs: [1, 0] });
  });

  test("order: a broken order falls back to the identity", () => {
    expect(normalizeBlock({ type: "order", prompt: "", items: ["x", "y", "z"], order: [2, 2] }, "x")).toMatchObject({ order: [0, 1, 2] });
  });

  test("fill in the blanks: [blank] and runs of underscores become one gap", () => {
    const b = normalizeBlock({ type: "fillblanks", prompt: "", sentences: ["The [blank] sat on the ______ mat."], answers: ["cat", "red"], wordBank: [] }, "x");
    expect(b).toMatchObject({ sentences: ["The ___ sat on the ___ mat."] });
  });

  test("lines and marks are clamped to what fits on a page", () => {
    expect(normalizeBlock({ type: "short", prompt: "Q", lines: 40, answer: "", quote: "", marks: 99 }, "x")).toMatchObject({ lines: 6, marks: 20 });
    expect(normalizeBlock({ type: "long", prompt: "Q", lines: 0, answer: "", criteria: [], marks: 3 }, "x")).toMatchObject({ lines: 3 });
  });

  test("a callout with no variant is a fact box with its default label", () => {
    expect(normalizeBlock({ type: "callout", text: "Bees dance." }, "x")).toMatchObject({ variant: "fact", label: "Did you know?", text: "Bees dance." });
  });
});

test.describe("sheetContext", () => {
  test("the subtitle comes from the form, not the model", () => {
    expect(sheetContext("worksheet", { yearGroup: "Year 5", subject: "Maths" }).subtitle).toBe("Year 5 · Maths");
    expect(sheetContext("worksheet", { yearGroup: "Mixed", subject: "Science" }).subtitle).toBe("Mixed years · Science");
    expect(sheetContext("comprehension", { yearGroup: "Year 3" }).subtitle).toBe("Year 3 · Reading comprehension");
  });

  test("the starting theme follows the year: playful for primary, professional above", () => {
    expect(sheetContext("worksheet", { yearGroup: "Year 2" }).design.themeId).toBe("sunny");
    expect(sheetContext("worksheet", { yearGroup: "Year 9" }).design.themeId).toBe("classic");
  });

  test("comprehension: paragraph numbers on, answers page follows the answer key switch", () => {
    expect(sheetContext("comprehension", { yearGroup: "Year 4" }).design.lineNumbers).toBe(true);
    expect(sheetContext("comprehension", { yearGroup: "Year 4", includeAnswerKey: false }).design.answers).toBe(false);
    expect(sheetContext("worksheet", { yearGroup: "Year 4" }).design.lineNumbers).toBe(false);
  });
});

test.describe("stored sheets", () => {
  test("a sheet round trips; markdown is not mistaken for one", () => {
    const doc = normalizeDraft({ title: "Plants", sections: [{ title: "Parts", blocks: [{ type: "text", text: "Roots drink." }] }] }, ctx);
    const stored = serializeSheet(doc);
    expect(isSheetOutput(stored)).toBe(true);
    expect(parseSheet(stored)).toEqual(doc);
    expect(isSheetOutput("# Plants\n\nRoots drink.")).toBe(false);
    expect(parseSheet('{"kind":"other"}')).toBeNull();
  });

  test("finishSheet stores what the browser shows, and nothing for an empty stream", () => {
    const streamed = JSON.stringify({ title: "Plants", objective: "", intro: { variant: "fact", label: "", text: "", emoji: "" }, sections: [], teacherNotes: [] });
    const stored = finishSheet("worksheet", streamed, { yearGroup: "Year 5", subject: "Science" });
    expect(parseSheet(stored)?.title).toBe("Plants");
    expect(parseSheet(stored)?.intro).toBeNull();
    expect(finishSheet("worksheet", "", {})).toBeNull();
    expect(finishSheet("worksheet", "{}", {})).toBeNull();
  });

  test("ownPassageSection splits on blank lines and joins wrapped lines", () => {
    const s = ownPassageSection("One\ntwo\r\n\r\nThree");
    expect(s.blocks[0]).toMatchObject({ type: "passage", paragraphs: ["One two", "Three"] });
  });
});
