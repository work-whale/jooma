import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { pagePx, PAPER_PX } from "@/app/lib/sheets/themes";
import { normalizeBlock, normalizeDraft, MAX_SEQUENCE_LESSONS } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { withPupilName, withPupilPlaceholder, scrubPupilText } from "@/app/lib/sheets/pupil";
import { isHidden, shownSections } from "@/app/lib/sheets/visibility";
import { sheetOutline, sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { visibleColumns, UNIT_COLUMNS, TOPIC_MAP_COLUMNS, TERM_PLAN_COLUMNS, arrangeUnit, emptyLesson } from "@/app/lib/sheets/unit";
import { undash, undashText } from "@/app/lib/sheets/undash";
import { applySheetOp, isSendableSheetSnapshot, setSheetText, sheetSnapshot, sheetTextAt } from "@/app/lib/jo/sheet-ops";
import { unitLessonHref } from "@/app/lib/lesson-handoffs";
import { decodePrefill } from "@/app/lib/toolPrefill";
import { payloadStrings } from "@/app/lib/reports/privacy";
import type { SequenceBlock, SheetDoc, UnitLesson } from "@/app/lib/sheets/types";

/*
 * Batch 2 groundwork: landscape pages, a document about one child whose name
 * never leaves the browser, the lesson table block (`sequence`) and parts of a
 * document switched off in Design. All pure; nothing reaches a model.
 */

const lesson = (n: number, extra: Partial<UnitLesson> = {}): UnitLesson => ({
  title: `Lesson title ${n}`,
  objective: `Objective ${n}`,
  starter: `Starter ${n}`,
  input: `Input ${n}`,
  activity: `Activity ${n}`,
  plenary: `Plenary ${n}`,
  summary: `Summary ${n}`,
  keyKnowledge: [`That fact ${n}`],
  resources: [`Resource ${n}`],
  questions: [`Question ${n}?`],
  vocabulary: [`word${n}`, `term${n}`],
  ...extra,
});

/** A worksheet holding a lesson table, for the block-level checks. Unit
 *  tools arrive in step 1; the block works on any sheet. */
function sheetWith(blocks: unknown[], design: Partial<SheetDoc["design"]> = {}): SheetDoc {
  const ctx = sheetContext("worksheet", { yearGroup: "Year 5", subject: "Geography" });
  const doc = normalizeDraft({ title: "Rivers", sections: [{ title: "Lessons", blocks }] }, ctx);
  return { ...doc, design: { ...doc.design, ...design } };
}

test.describe("landscape pages", () => {
  test("portrait is the paper as it is; landscape turns it on its side", () => {
    expect(pagePx({ paper: "a4" })).toEqual(PAPER_PX.a4);
    expect(pagePx({ paper: "a4", landscape: false })).toEqual(PAPER_PX.a4);
    expect(pagePx({ paper: "a4", landscape: true })).toEqual({ w: PAPER_PX.a4.h, h: PAPER_PX.a4.w });
    expect(pagePx({ paper: "letter", landscape: true })).toEqual({ w: PAPER_PX.letter.h, h: PAPER_PX.letter.w });
  });

  test("an unknown paper falls back to A4 rather than breaking the page", () => {
    expect(pagePx({ paper: "foolscap" as "a4" })).toEqual(PAPER_PX.a4);
  });

  test("the Word file is landscape only when the sheet is", async () => {
    const orient = async (doc: SheetDoc) => {
      const zip = await JSZip.loadAsync(await (await buildSheetDocx(doc)).arrayBuffer());
      const xml = await zip.file("word/document.xml")!.async("string");
      return xml.match(/<w:pgSz [^>]*>/)![0];
    };
    const portrait = await orient(sheetWith([{ type: "text", text: "Hello" }]));
    expect(portrait).not.toContain('w:orient="landscape"');
    // Portrait A4 is 11906 wide; landscape swaps it.
    expect(portrait).toContain('w:w="11906"');
    const landscape = await orient(sheetWith([{ type: "text", text: "Hello" }], { landscape: true }));
    expect(landscape).toContain('w:orient="landscape"');
    expect(landscape).toContain('w:w="16838"');
  });
});

test.describe("the lesson table block", () => {
  test("keeps every field of every lesson, and fills missing ones", () => {
    const b = normalizeBlock({ type: "sequence", lessons: [{ title: "Rivers", objective: "Name parts" }] }, "b1") as SequenceBlock;
    expect(b.type).toBe("sequence");
    expect(b.lessons).toHaveLength(1);
    expect(b.lessons[0]).toEqual({ ...emptyLesson(), title: "Rivers", objective: "Name parts" });
  });

  test("a lesson with neither title nor objective is not one yet (mid-stream) and is left out", () => {
    const b = normalizeBlock({ type: "sequence", lessons: [lesson(1), { starter: "half written" }, null, "junk"] }, "b1") as SequenceBlock;
    expect(b.lessons.map((l) => l.title)).toEqual(["Lesson title 1"]);
  });

  test("no lessons means no block", () => {
    expect(normalizeBlock({ type: "sequence", lessons: [] }, "b1")).toBeNull();
    expect(normalizeBlock({ type: "sequence" }, "b1")).toBeNull();
  });

  test("lessons past the cap are dropped", () => {
    const many = Array.from({ length: MAX_SEQUENCE_LESSONS + 5 }, (_, i) => lesson(i));
    const b = normalizeBlock({ type: "sequence", lessons: many }, "b1") as SequenceBlock;
    expect(b.lessons).toHaveLength(MAX_SEQUENCE_LESSONS);
  });

  test("list fields drop empty and non-string items", () => {
    const b = normalizeBlock({ type: "sequence", lessons: [{ title: "A", vocabulary: ["delta", "", 4, "  "] }] }, "b1") as SequenceBlock;
    expect(b.lessons[0].vocabulary).toEqual(["delta"]);
  });
});

test.describe("table columns", () => {
  const doc = (columns?: string[]) => ({ design: { columns } }) as unknown as Pick<SheetDoc, "design">;

  test("with no choice made, a tool's defaults show", () => {
    expect(visibleColumns(doc(), TOPIC_MAP_COLUMNS).map((c) => c.id)).toEqual(TOPIC_MAP_COLUMNS);
    expect(visibleColumns(doc(), TERM_PLAN_COLUMNS).map((c) => c.id)).toEqual(TERM_PLAN_COLUMNS);
  });

  test("Topic Map opens with the 9 columns teachers had before (Lesson plus 8)", () => {
    expect(TOPIC_MAP_COLUMNS).toHaveLength(8);
  });

  test("the teacher's choice wins, in table order, unknown ids dropped", () => {
    const ids = visibleColumns(doc(["vocabulary", "nonsense", "objective"]), TOPIC_MAP_COLUMNS).map((c) => c.id);
    expect(ids).toEqual(["objective", "vocabulary"]);
  });

  test("every column id is a lesson field, so switching one on needs no new plan", () => {
    const keys = Object.keys(emptyLesson());
    for (const c of UNIT_COLUMNS) expect(keys).toContain(c.id);
  });
});

test.describe("parts switched off in Design", () => {
  const unit = (hidden: string[] = []) => {
    const ctx = sheetContext("worksheet", { yearGroup: "Year 5", subject: "Geography" });
    const doc = normalizeDraft(
      arrangeUnit({ title: "Rivers", overview: "What rivers do.", beforeUnit: ["The water cycle"], lessons: [lesson(1), lesson(2)], assessment: [{ when: "Lesson 2", how: "Quiz", purpose: "Recall" }], vocabulary: ["source", "mouth"] }),
      ctx,
    );
    return { ...doc, design: { ...doc.design, hidden } };
  };

  test("nothing is hidden by default, and an untagged section always shows", () => {
    const d = unit();
    expect(isHidden(d, undefined)).toBe(false);
    expect(shownSections(d).map((s) => s.role)).toEqual(["overview", "lessons", "assessment", "vocabulary"]);
  });

  test("a hidden part is gone from the outline and from Copy", () => {
    const d = unit(["overview", "vocabulary"]);
    expect(shownSections(d).map((s) => s.role)).toEqual(["lessons", "assessment"]);
    expect(sheetOutline(d)).not.toContain("Unit overview");
    const md = sheetToMarkdown(d);
    expect(md).not.toContain("What rivers do.");
    expect(md).not.toContain("source, mouth");
    expect(md).toContain("Assessment points");
  });

  test("Copy writes the lesson table with the shown columns, one row per lesson", () => {
    const d = { ...unit(), design: { ...unit().design, columns: ["objective"] } };
    const md = sheetToMarkdown(d);
    expect(md).toContain("| Lesson | Learning objective |");
    expect(md).toContain("| Lesson 1: Lesson title 1 | Objective 1 |");
    expect(md).not.toContain("Starter 1");
  });

  test("a pipe in a cell cannot break the table", () => {
    const d = sheetWith([{ type: "sequence", lessons: [lesson(1, { objective: "A | B" })] }], { columns: ["objective"] });
    expect(sheetToMarkdown(d)).toContain("| Lesson 1: Lesson title 1 | A / B |");
  });
});

test.describe("a document about one child", () => {
  const withPupil = (name: string, text: string): SheetDoc => ({
    ...sheetWith([{ type: "text", text }, { type: "list", title: "Things [PUPIL] enjoys", style: "bullet", items: ["[PUPIL]'s drawing"] }]),
    pupil: { name, pronouns: "she" },
  });

  test("the page and exports show the name; the stored text keeps [PUPIL]", () => {
    const stored = withPupil("Amira", "[PUPIL] likes maps.");
    const shown = withPupilName(stored);
    expect(JSON.stringify(shown)).not.toContain("[PUPIL]");
    expect(JSON.stringify(shown)).toContain("Amira likes maps.");
    expect(JSON.stringify(shown)).toContain("Amira's drawing");
    // The name is in doc.pupil and nowhere else.
    expect(JSON.stringify({ ...stored, pupil: undefined })).not.toContain("Amira");
  });

  test("the round trip is exact: shown then stored gives back the stored document", () => {
    const stored = withPupil("Amira", "[PUPIL] likes maps.");
    expect(withPupilPlaceholder(withPupilName(stored))).toEqual(stored);
  });

  test("a name typed on the page is stored as [PUPIL], in any case and with 's", () => {
    const edited = withPupil("Amira", "AMIRA said hello. amira's bag.");
    const stored = withPupilPlaceholder(edited);
    expect(stored.sections[0].blocks[0]).toMatchObject({ text: "[PUPIL] said hello. [PUPIL]'s bag." });
    expect(stored.pupil?.name).toBe("Amira");
  });

  test("a name inside a longer word is left alone (Ali in Alison)", () => {
    const stored = withPupilPlaceholder(withPupil("Ali", "Alison helped Ali."));
    expect(stored.sections[0].blocks[0]).toMatchObject({ text: "Alison helped [PUPIL]." });
  });

  test("ids, design and the tool are never rewritten, even if they match the name", () => {
    const doc = withPupil("worksheet", "a worksheet");
    const stored = withPupilPlaceholder(doc);
    expect(stored.tool).toBe("worksheet");
    expect(stored.sections[0].blocks[0]).toMatchObject({ text: "a [PUPIL]" });
  });

  test("with no name given, the page says 'the pupil' rather than [PUPIL]", () => {
    const shown = withPupilName(withPupil("  ", "[PUPIL] likes maps."));
    expect(shown.sections[0].blocks[0]).toMatchObject({ text: "the pupil likes maps." });
  });

  test("a document with no pupil is untouched", () => {
    const doc = sheetWith([{ type: "text", text: "[PUPIL] stays" }]);
    expect(withPupilName(doc)).toBe(doc);
    expect(withPupilPlaceholder(doc)).toBe(doc);
  });

  test("Jo's copy of the sheet carries no name anywhere", () => {
    const doc = withPupilPlaceholder(withPupil("Amira", "Amira likes maps. Ask Amira first."));
    const strings = payloadStrings(sheetSnapshot(doc));
    expect(strings.some((s) => /amira/i.test(s))).toBe(false);
    expect(strings.join(" ")).toContain("[PUPIL] likes maps.");
  });

  test("a snapshot sent with a pupil field is refused; an ordinary one is not", () => {
    expect(isSendableSheetSnapshot({ tool: "worksheet", sections: [], pupil: { name: "Amira" } })).toBe(false);
    // A sort question's groups have a "name" key; that is not a child.
    expect(isSendableSheetSnapshot({ tool: "worksheet", sections: [{ blocks: [{ type: "sort", categories: [{ name: "Mammals", items: [] }] }] }] })).toBe(true);
  });

  test("free text from a form is scrubbed before it is sent", () => {
    expect(scrubPupilText("Sam hits out when Sam is tired", "Sam")).toBe("[PUPIL] hits out when [PUPIL] is tired");
    expect(scrubPupilText("No names here", "")).toBe("No names here");
  });

  test("Copy and Word show the name, as the page does", async () => {
    const doc = withPupil("Amira", "[PUPIL] likes maps.");
    expect(sheetToMarkdown(doc)).toContain("Amira likes maps.");
    const zip = await JSZip.loadAsync(await (await buildSheetDocx(doc)).arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Amira likes maps.");
    expect(xml).not.toContain("[PUPIL]");
  });
});

test.describe("Jo and the lesson table", () => {
  const doc = sheetWith([{ type: "sequence", lessons: [lesson(1), lesson(2)] }]);
  const id = doc.sections[0].blocks[0].id;

  test("one cell is a text path: <block>.lessons.<n>.<field>", () => {
    expect(sheetTextAt(doc, `${id}.lessons.1.starter`)).toBe("Starter 2");
    const next = setSheetText(doc, `${id}.lessons.1.starter`, "A new starter")!;
    expect((next.sections[0].blocks[0] as SequenceBlock).lessons[1].starter).toBe("A new starter");
    expect((next.sections[0].blocks[0] as SequenceBlock).lessons[0].starter).toBe("Starter 1");
  });

  test("a list cell, a missing lesson or another block's 4-part path is not text", () => {
    expect(sheetTextAt(doc, `${id}.lessons.0.vocabulary`)).toBeNull();
    expect(sheetTextAt(doc, `${id}.lessons.9.starter`)).toBeNull();
    expect(sheetTextAt(doc, `${id}.lessons.x.starter`)).toBeNull();
    expect(sheetTextAt(doc, `${id}.other.0.starter`)).toBeNull();
    expect(setSheetText(doc, `${id}.lessons.9.starter`, "x")).toBeNull();
  });

  test("Jo cannot turn landscape on for a tool that does not offer it", () => {
    expect(applySheetOp(doc, { op: "setDesign", key: "landscape", value: "true", label: "x" })).toBeNull();
  });
});

test.describe("Plan this lesson", () => {
  const unitDoc = (meta?: SheetDoc["unit"]) => ({ ...sheetWith([]), ...(meta ? { unit: meta } : {}) });

  test("opens Lesson Plan with the unit's details and the lesson", () => {
    const href = unitLessonHref(unitDoc({ curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Geography", topic: "Rivers" }), lesson(3), 2)!;
    expect(href).toMatch(/^\/tools\/lesson-planner\?prefill=/);
    const prefill = decodePrefill(new URL(href, "http://x").searchParams.get("prefill")!)!;
    expect(prefill.slug).toBe("lesson-planner");
    expect(prefill.fields).toMatchObject({ curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Geography", topic: "Rivers: Lesson title 3", learningObjective: "Objective 3" });
  });

  test("Mixed years and an empty objective are left out rather than sent", () => {
    const href = unitLessonHref(unitDoc({ curriculum: "2014 National Curriculum", yearGroup: "Mixed", subject: "Geography", topic: "Rivers" }), lesson(1, { objective: " " }), 0)!;
    const prefill = decodePrefill(new URL(href, "http://x").searchParams.get("prefill")!)!;
    expect(prefill.fields.yearGroup).toBeUndefined();
    expect(prefill.fields.learningObjective).toBeUndefined();
  });

  test("an untitled lesson is called by its number; a long one is capped", () => {
    const href = unitLessonHref(unitDoc({ curriculum: "", yearGroup: "", subject: "Geography", topic: "" }), lesson(1, { title: "", objective: "x".repeat(900) }), 4)!;
    const prefill = decodePrefill(new URL(href, "http://x").searchParams.get("prefill")!)!;
    expect(prefill.fields.topic).toBe("Lesson 5");
    expect(String(prefill.fields.learningObjective).length).toBeLessThanOrEqual(600);
  });

  test("an old plan that does not know its unit offers no link", () => {
    expect(unitLessonHref(unitDoc(), lesson(1), 0)).toBeNull();
  });
});

test.describe("long dashes out of what a model wrote", () => {
  test("a dash between words becomes a comma; a number range reads 'to'; hyphens stay", () => {
    expect(undashText("erosion—hydraulic action, abrasion—and deposition")).toBe("erosion, hydraulic action, abrasion, and deposition");
    expect(undashText("Rivers – a summary")).toBe("Rivers, a summary");
    expect(undashText("Lessons 1–5 and pages 10 — 12")).toBe("Lessons 1 to 5 and pages 10 to 12");
    expect(undashText("A well-known year-group task")).toBe("A well-known year-group task");
    expect(undashText("It ends here —.")).toBe("It ends here.");
  });

  test("every string at any depth, and the new tools' drafts come out clean", () => {
    expect(undash({ a: ["x—y"], b: { c: "1–2" }, n: 3 })).toEqual({ a: ["x, y"], b: { c: "1 to 2" }, n: 3 });
    const doc = normalizeDraft(arrangeUnit({ title: "Rivers — flooding", lessons: [lesson(1, { input: "Explain erosion—hydraulic action" })] }), sheetContext("worksheet", {}));
    expect(JSON.stringify(doc)).not.toMatch(/[–—]/);
  });
});
