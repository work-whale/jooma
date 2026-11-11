import { test, expect } from "@playwright/test";
import { sheetContext, finishSheet } from "@/app/lib/sheets/context";
import { normalizeDraft, parseSheet, isSheetOutput } from "@/app/lib/sheets/normalize";
import { sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { parsePartialJson } from "@/app/lib/sheets/stream";
import { visibleColumns, TERM_PLAN_COLUMNS, TOPIC_MAP_COLUMNS, MAX_UNIT_LESSONS, unitLessonCount, DEFAULT_UNIT_LESSONS } from "@/app/lib/sheets/unit";
import { sheetToolProfile, sheetToolForSlug } from "@/app/lib/sheets/tools";
import { unitRequest, unitResponseFormat, type UnitPlanRequest } from "@/app/lib/unit-prompt";
import { joSheetResponseFormat } from "@/app/lib/jo/sheet-schema";
import { applySheetOp } from "@/app/lib/jo/sheet-ops";
import { unitLessonHref } from "@/app/lib/lesson-handoffs";
import type { SequenceBlock, SheetDoc } from "@/app/lib/sheets/types";

/*
 * Topic Map and Term Plan: two tools on one engine. The model fills every
 * field of every lesson; code arranges the unit into sections and each tool
 * opens with its own columns, landscape. Pure; nothing reaches a model.
 */

const DASHES = /[–—]/;

const LESSON = (n: number) => ({
  title: `Rivers lesson ${n}`,
  objective: `To explain idea ${n}`,
  starter: `Recall ${n}`,
  input: `Model ${n}`,
  activity: `Task ${n}`,
  plenary: `Exit ${n}`,
  summary: `Summary ${n}`,
  keyKnowledge: [`That ${n} is so`],
  resources: [`Map ${n}`],
  questions: [`Why ${n}?`],
  vocabulary: [`erosion${n}`],
});

const DRAFT = {
  title: "Rivers and flooding",
  overview: "How rivers shape the land.",
  beforeUnit: ["The water cycle"],
  afterUnit: ["Coasts"],
  lessons: [LESSON(1), LESSON(2), LESSON(3)],
  assessment: [{ when: "Lesson 2", how: "Hinge quiz", purpose: "Checks erosion" }],
  vocabulary: ["source", "mouth", "meander"],
};

const INFO = { curriculum: "2014 National Curriculum", yearGroup: "Year 8", subject: "Geography", topic: "Rivers" };

const planFor = (tool: "topicMap" | "termPlan", draft: unknown = DRAFT): SheetDoc => normalizeDraft(draft, sheetContext(tool, INFO));

test.describe("arranging a unit", () => {
  test("both tools hold the same sections, lessons and words", () => {
    const map = planFor("topicMap");
    const term = planFor("termPlan");
    for (const d of [map, term]) {
      expect(d.sections.map((s) => s.role)).toEqual(["overview", "lessons", "assessment", "vocabulary"]);
      expect(d.title).toBe("Rivers and flooding");
    }
    const lessons = (d: SheetDoc) => (d.sections[1].blocks[0] as SequenceBlock).lessons;
    expect(lessons(map)).toEqual(lessons(term));
    expect(lessons(map)).toHaveLength(3);
  });

  test("each tool opens with its own columns: Topic Map teaching, Term Plan knowledge", () => {
    expect(visibleColumns(planFor("topicMap"), sheetToolProfile("topicMap").unitColumns!).map((c) => c.id)).toEqual(TOPIC_MAP_COLUMNS);
    expect(visibleColumns(planFor("termPlan"), sheetToolProfile("termPlan").unitColumns!).map((c) => c.id)).toEqual(TERM_PLAN_COLUMNS);
    expect(sheetToMarkdown(planFor("termPlan"))).toContain("| Lesson | Learning objective | Summary of the lesson | Key knowledge |");
    expect(sheetToMarkdown(planFor("topicMap"))).toContain("| Starter |");
  });

  test("a plan starts landscape, for staff: no name lines, objective, hook or answers page", () => {
    const d = planFor("topicMap");
    expect(d.design).toMatchObject({ landscape: true, nameDate: false, objective: false, intro: false, answers: false });
  });

  test("the plan keeps its unit, for Plan this lesson", () => {
    const d = planFor("termPlan");
    expect(d.unit).toEqual(INFO);
    const lesson = (d.sections[1].blocks[0] as SequenceBlock).lessons[1];
    expect(unitLessonHref(d, lesson, 1)).toMatch(/^\/tools\/lesson-planner\?prefill=/);
  });

  test("the overview reads before and after the unit", () => {
    const md = sheetToMarkdown(planFor("topicMap"));
    expect(md).toContain("How rivers shape the land.");
    expect(md).toContain("**Before this unit**\n- The water cycle");
    expect(md).toContain("**After this unit**\n- Coasts");
    expect(md).toContain("| When | How | What it shows |");
    expect(md).toContain("source, mouth, meander");
  });

  test("an empty part is left out rather than drawn as an empty heading", () => {
    const d = planFor("topicMap", { ...DRAFT, overview: "", beforeUnit: [], afterUnit: [], assessment: [], vocabulary: [] });
    expect(d.sections.map((s) => s.role)).toEqual(["lessons"]);
  });

  test("mid-stream, a half-written plan is a valid sheet that grows row by row", () => {
    const full = JSON.stringify(DRAFT);
    const cut = full.slice(0, full.indexOf('"Rivers lesson 2"') + 10);
    const d = normalizeDraft(parsePartialJson(cut), sheetContext("topicMap", INFO));
    const block = d.sections.find((s) => s.role === "lessons")!.blocks[0] as SequenceBlock;
    // The first lesson whole, the second as far as it has arrived.
    expect(block.lessons).toHaveLength(2);
    expect(block.lessons[0].title).toBe("Rivers lesson 1");
    expect(block.lessons[1].title).toMatch(/^Rivers l/);
    expect("Rivers lesson 2".startsWith(block.lessons[1].title)).toBe(true);
  });

  test("a finished stream is stored as a sheet that reads back, and its slug finds its tool", () => {
    const stored = finishSheet("termPlan", JSON.stringify(DRAFT), INFO)!;
    expect(isSheetOutput(stored)).toBe(true);
    expect(parseSheet(stored)?.tool).toBe("termPlan");
    expect(sheetToolForSlug("topic-overview")).toBe("topicMap");
    expect(sheetToolForSlug("medium-term-planner")).toBe("termPlan");
  });

  test("an old markdown run is not a sheet, so it opens in its old view", () => {
    expect(isSheetOutput("# Rivers — Topic Overview\n\n| Lesson | ... |")).toBe(false);
  });
});

test.describe("the request", () => {
  const body: UnitPlanRequest = { ...INFO, numLessons: 6 };
  const text = (r: ReturnType<typeof unitRequest>) => ("error" in r ? "" : r.messages.map((m) => m.content).join("\n"));

  test("refuses a request missing what a unit needs", () => {
    for (const missing of ["curriculum", "yearGroup", "subject", "topic"] as const) {
      expect(unitRequest("topicMap", { ...body, [missing]: "  " })).toEqual({ error: "Missing required fields" });
    }
    expect(unitRequest("topicMap", { ...body, numLessons: undefined })).toEqual({ error: "Missing required fields" });
    expect(unitRequest("topicMap", { ...body, numLessons: 0 })).toEqual({ error: "Missing required fields" });
  });

  test("Topic Map sends numLessons and Term Plan numberOfLessons; both work", () => {
    const a = unitRequest("topicMap", { ...INFO, numLessons: 4 });
    const b = unitRequest("termPlan", { ...INFO, numberOfLessons: 4 });
    expect("lessons" in a && a.lessons).toBe(4);
    expect("lessons" in b && b.lessons).toBe(4);
    expect(text(a)).toContain("exactly 4 lessons");
  });

  test("the lesson count is held to 1 to 30", () => {
    expect(unitLessonCount(31)).toBe(MAX_UNIT_LESSONS);
    expect(unitLessonCount(-3)).toBe(1);
    expect(unitLessonCount(2.6)).toBe(3);
    expect(unitLessonCount("abc")).toBe(DEFAULT_UNIT_LESSONS);
    const r = unitRequest("termPlan", { ...INFO, numberOfLessons: 500 });
    expect(text(r)).toContain("exactly 30 lessons");
  });

  test("each tool puts its weight where it should", () => {
    expect(text(unitRequest("topicMap", body))).toContain("FOCUS: this is a topic map");
    expect(text(unitRequest("termPlan", body))).toContain("FOCUS: this is a medium-term plan");
  });

  test("the exam spec, extra context and bands reach the prompt only when given", () => {
    const plain = text(unitRequest("termPlan", body));
    expect(plain).not.toContain("exam specification");
    expect(plain).not.toContain("ADAPTATION");
    const full = text(unitRequest("termPlan", { ...body, examSpec: "AQA 3.1.3 Rivers", differentiate: "yes", differentiationLevels: ["GDS", "WTS"], additionalInfo: "Fieldwork in lesson 5" }));
    expect(full).toContain("AQA 3.1.3 Rivers");
    expect(full).toContain("Fieldwork in lesson 5");
    expect(full).toContain("Working Towards Standard");
    expect(full).toContain("Greater Depth Standard");
  });

  test("no long dashes in what the model is told, so none are copied into plans", () => {
    for (const tool of ["topicMap", "termPlan"] as const) {
      expect(text(unitRequest(tool, { ...body, examSpec: "x", differentiate: "yes", differentiationLevels: ["WBS", "GDS"] }))).not.toMatch(DASHES);
    }
  });

  test("the schema is strict all the way down and asks for every lesson field", () => {
    const schema = unitResponseFormat("topicMap").json_schema.schema as Record<string, unknown>;
    const strict = (n: unknown): boolean => {
      if (!n || typeof n !== "object") return true;
      if (Array.isArray(n)) return n.every(strict);
      const o = n as Record<string, unknown>;
      if (o.type === "object") {
        const keys = Object.keys(o.properties as object);
        if (o.additionalProperties !== false || JSON.stringify([...(o.required as string[])].sort()) !== JSON.stringify([...keys].sort())) return false;
      }
      return Object.values(o).every(strict);
    };
    expect(strict(schema)).toBe(true);
    const lessonProps = Object.keys(((((schema.properties as Record<string, Record<string, unknown>>).lessons.items) as Record<string, unknown>).properties) as object);
    expect(lessonProps.sort()).toEqual(Object.keys(LESSON(1)).sort());
  });
});

test.describe("Jo on a unit plan", () => {
  test("can write a lesson table and turn the page, where a worksheet cannot", () => {
    const unit = JSON.stringify(joSheetResponseFormat("topicMap"));
    expect(unit).toContain('"enum":["sequence"]');
    expect(unit).toContain('"landscape"');
    const sheet = JSON.stringify(joSheetResponseFormat("worksheet"));
    expect(sheet).not.toContain('"enum":["sequence"]');
    expect(sheet).not.toContain('"landscape"');
  });

  test("setDesign landscape works on a plan and refuses nonsense", () => {
    const d = planFor("termPlan");
    expect(applySheetOp(d, { op: "setDesign", key: "landscape", value: "false", label: "x" })!.doc.design.landscape).toBe(false);
    expect(applySheetOp(d, { op: "setDesign", key: "landscape", value: "sideways", label: "x" })).toBeNull();
  });

  test("a rewritten lesson table keeps its id, and an empty one is refused", () => {
    const d = planFor("topicMap");
    const id = d.sections[1].blocks[0].id;
    const next = applySheetOp(d, { op: "replaceBlock", blockId: id, block: { type: "sequence", lessons: [LESSON(9)] }, label: "x" })!;
    expect((next.doc.sections[1].blocks[0] as SequenceBlock).lessons.map((l) => l.title)).toEqual(["Rivers lesson 9"]);
    expect(next.doc.sections[1].blocks[0].id).toBe(id);
    expect(applySheetOp(d, { op: "replaceBlock", blockId: id, block: { type: "sequence", lessons: [] }, label: "x" })).toBeNull();
  });
});
