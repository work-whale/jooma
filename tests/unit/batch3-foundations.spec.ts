import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { markSegments, quoteMarks } from "@/app/lib/sheets/model-answers";
import { activityBlocks, activitySection } from "@/app/lib/sheets/activity";
import { normalizeBlock, normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { lessonHandoffs } from "@/app/lib/lesson-handoffs";
import { decodePrefill } from "@/app/lib/toolPrefill";
import type { ExemplarBlock, SheetDoc } from "@/app/lib/sheets/types";

/*
 * Tool uplift batch 3, the shared pieces: numbered quote markers on the
 * exemplar block (Model Texts, and Model Answers with it), the activity
 * section Phonics and Early Years share, and Lesson Plan's "Set homework".
 * Pure; nothing reaches a model.
 */

test.describe("quote markers", () => {
  test("each quote is marked where it first appears, numbered by its place in the list", () => {
    const parts = ["The sun rose slowly over the hills.", "Have you ever seen the sea?"];
    const marks = quoteMarks(parts, ["Have you ever seen the sea?", "rose slowly"]);
    expect(marks).toEqual([
      { part: 1, start: 0, end: 27, n: 1 },
      { part: 0, start: 8, end: 19, n: 2 },
    ]);
  });

  test("case does not matter, and a quote that is not in the text gets no marker but keeps its number", () => {
    const marks = quoteMarks(["Wow! What a day."], ["not there", "WHAT A DAY"]);
    expect(marks).toEqual([{ part: 0, start: 5, end: 15, n: 2 }]);
  });

  test("a repeated quote moves on to its next place rather than stacking on the first", () => {
    const marks = quoteMarks(["the cat and the cat"], ["the cat", "the cat"]);
    expect(marks.map((m) => [m.start, m.n])).toEqual([[0, 1], [12, 2]]);
  });

  test("an empty quote is never marked", () => {
    expect(quoteMarks(["anything"], ["", "  "])).toEqual([]);
  });

  test("a part is cut into plain and numbered runs that join back to the same text", () => {
    const text = "The sun rose slowly over the hills.";
    const segs = markSegments(text, [{ start: 8, end: 19, n: 2 }]);
    expect(segs).toEqual([{ text: "The sun " }, { text: "rose slowly", n: 2 }, { text: " over the hills." }]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });

  test("marks out of range or overlapping are skipped, never thrown", () => {
    const segs = markSegments("abcdef", [{ start: 2, end: 4, n: 1 }, { start: 3, end: 5, n: 2 }, { start: 4, end: 99, n: 3 }]);
    expect(segs).toEqual([{ text: "ab" }, { text: "cd", n: 1 }, { text: "ef" }]);
  });
});

test.describe("a model text's teacher copy on the exemplar block", () => {
  const raw = {
    type: "exemplar",
    purpose: "text",
    level: "full",
    awarded: 0,
    outOf: 0,
    form: "prose",
    parts: ["Have you ever felt the sand between your toes?"],
    annotations: [{ quote: "Have you ever felt", note: "**Rhetorical question.** It pulls the reader in." }],
    commentary: "",
  };

  test("keeps its purpose; a model answer has none", () => {
    expect(normalizeBlock(raw, "b0")).toMatchObject({ type: "exemplar", purpose: "text" });
    expect(normalizeBlock({ ...raw, purpose: undefined }, "b0")).not.toHaveProperty("purpose");
    expect(normalizeBlock({ ...raw, purpose: "marks" }, "b0")).not.toHaveProperty("purpose");
  });

  // What the Model Texts model writes; arrangeModelText puts it on the block.
  const modelText = { title: "Seaside", paragraphs: raw.parts, features: [{ feature: "Rhetorical question", quote: "Have you ever felt", why: "It pulls the reader in." }], teacherNote: "" };

  test("Copy shows it as a teacher copy with numbered features, never as marks", () => {
    const doc = normalizeDraft(modelText, sheetContext("modelText", { yearGroup: "Year 4" }));
    const md = sheetToMarkdown(doc);
    expect(md).toContain("#### Teacher copy");
    expect(md).toContain("**The writing features:**");
    expect(md).toContain('1. "Have you ever felt"');
    expect(md).not.toMatch(/marks\)/);
  });

  test("Word: the feature's words are bold with their number raised after them; no marks line", async () => {
    const doc = normalizeDraft(modelText, sheetContext("modelText", { yearGroup: "Year 4" }));
    const xml = await (await JSZip.loadAsync(await (await buildSheetDocx(doc)).arrayBuffer())).file("word/document.xml")!.async("string");
    expect(xml).toContain("Teacher copy");
    expect(xml).toContain("The writing features");
    expect(xml).not.toContain("0 / 0 marks");
    expect(xml).toMatch(/<w:vertAlign w:val="superscript"\/>[\s\S]{0,200}<w:t[^>]*>1<\/w:t>/);
  });

  test("a model answer still prints its level and marks, with its quotes now marked too", async () => {
    const exemplar = { level: "full", awarded: 4, form: "prose", parts: raw.parts, annotations: [{ quote: "sand between your toes", note: "Precise detail (AO2)" }], commentary: "" };
    const doc = normalizeDraft({ title: "Q1", questions: [{ question: "Describe the beach.", marks: 6, exemplars: [exemplar], teachingNotes: [] }] }, sheetContext("modelAnswer", {}));
    const block = doc.sections[0].blocks[0] as ExemplarBlock;
    expect(quoteMarks(block.parts, block.annotations.map((a) => a.quote))).toHaveLength(1);
    expect(sheetToMarkdown(doc)).toContain("Full marks (4/6 marks)");
    const xml = await (await JSZip.loadAsync(await (await buildSheetDocx(doc)).arrayBuffer())).file("word/document.xml")!.async("string");
    expect(xml).toContain("4 / 6 marks");
  });
});

test.describe("an activity as blocks", () => {
  const activity = {
    title: "Sound hunt",
    focus: "Spotting the ai sound in words.",
    resources: ["Picture cards", " "],
    steps: ["Hide the cards", "Children find them", "Sound out each word"],
    vocabulary: ["rain", "snail"],
    support: "Show the grapheme card while they search.",
    challenge: "Write the words they find.",
  };

  test("focus, what you need, the steps, the words, then one box with support and challenge", () => {
    const blocks = activityBlocks(activity);
    expect(blocks.map((b) => b.type)).toEqual(["text", "list", "list", "wordbank", "callout"]);
    expect(blocks[1]).toMatchObject({ title: "You will need", style: "bullet", items: ["Picture cards"] });
    expect(blocks[2]).toMatchObject({ title: "What to do", style: "number" });
    expect(blocks[4].text).toBe("**Support:** Show the grapheme card while they search.  **Challenge:** Write the words they find.");
  });

  test("the box appears with either support or challenge alone", () => {
    expect(activityBlocks({ title: "x", challenge: "Stretch" }).at(-1)).toMatchObject({ type: "callout", text: "**Challenge:** Stretch" });
    expect(activityBlocks({ title: "x", support: "Help" }).at(-1)).toMatchObject({ type: "callout", text: "**Support:** Help" });
    expect(activityBlocks({ title: "x" })).toEqual([]);
  });

  test("a section titled from the activity; nothing at all mid-stream is no section", () => {
    expect(activitySection(activity, { prefix: "Activity 1: ", role: "activity" })).toMatchObject({ title: "Activity 1: Sound hunt", role: "activity" });
    expect(activitySection({})).toBeNull();
    expect(activitySection("not an object")).toBeNull();
  });
});

test.describe("Set homework from a lesson plan", () => {
  const plan = (over: Partial<SheetDoc> = {}): SheetDoc =>
    ({
      ...normalizeDraft({ title: "Fractions", objective: "I am learning to add fractions", sections: [] }, sheetContext("lesson", { yearGroup: "Year 6", subject: "Maths", curriculum: "2014 National Curriculum", topic: "Fractions", lessonLength: 60 })),
      ...over,
    });

  test("opens Homework with the curriculum, year, subject and objective, but no type or length", () => {
    const h = lessonHandoffs(plan()).find((x) => x.id === "homework");
    expect(h?.label).toBe("Set homework");
    const prefill = decodePrefill(new URL(`http://x${h!.href}`).searchParams.get("prefill"));
    expect(prefill).toEqual({
      slug: "homework-generator",
      fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 6", subject: "Maths", learningObjective: "I am learning to add fractions" },
    });
  });

  test("the plan's other handoffs are still offered, in their order", () => {
    expect(lessonHandoffs(plan()).map((h) => h.id)).toEqual(["slides", "worksheet", "quiz", "homework"]);
  });

  test("a document that is not a lesson plan offers none", () => {
    expect(lessonHandoffs({ ...plan(), lesson: undefined })).toEqual([]);
  });
});
