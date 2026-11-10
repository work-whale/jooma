import { test, expect } from "@playwright/test";
import { arrangeLesson, clockText, fitTimings, lessonMinutes, phaseClock, relayoutLesson, timingMismatch, MIN_PHASE_MINUTES } from "@/app/lib/sheets/lesson";
import { normalizeDraft, serializeSheet, parseSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { questionNumbers, sheetToMarkdown, sheetOutline } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { lessonRequest, lessonResponseFormat } from "@/app/lib/lesson-prompt";
import { lessonHandoffs } from "@/app/lib/lesson-handoffs";
import { decodePrefill } from "@/app/lib/toolPrefill";
import { strictObject } from "@/app/lib/sheets/schema";
import type { PhaseBlock, SheetDoc } from "@/app/lib/sheets/types";

/*
 * Lesson Plan as a sheet: the model writes one fixed shape, code arranges it
 * into a layout, makes the timings add up and can switch layout afterwards.
 * Everything here is pure; nothing reaches a model.
 */

const DASHES = /[–—]/;

/** A finished draft, as the model would send it. */
const DRAFT = {
  title: "Adding fractions",
  objective: "To add fractions with the same denominator",
  successCriteria: ["Identify the denominator", "Add the numerators", "Simplify the answer"],
  keywords: [{ term: "numerator", definition: "The top number" }, { term: "denominator", definition: "The bottom number" }],
  priorKnowledge: ["Know what a fraction is"],
  keyLearningPoints: ["Only the numerators are added"],
  misconceptions: [{ misconception: "Adding the denominators", response: "Model with fraction strips" }],
  phases: [
    { stage: "starter", title: "Fraction recall", minutes: 8, teacher: "Show fractions", pupils: "Name them", check: ["What is 1/2?"], feedback: "", support: "Strips", challenge: "Equivalents", ta: "" },
    { stage: "main", title: "Modelling", minutes: 20, teacher: "Model 1/5 + 2/5", pupils: "Follow along", check: ["Why stays 5?"], feedback: "Live marking", support: "Bar model", challenge: "Three fractions", ta: "Works with group A" },
    { stage: "main", title: "Practice", minutes: 20, teacher: "Circulate", pupils: "Ten questions", check: [], feedback: "Peer check", support: "", challenge: "", ta: "" },
    { stage: "plenary", title: "Exit check", minutes: 7, teacher: "Ask", pupils: "Answer", check: [], feedback: "", support: "", challenge: "", ta: "" },
  ],
  starterQuiz: [{ prompt: "What is the bottom number called?", options: ["Numerator", "Denominator", "Fraction"], answer: 1 }],
  exitQuiz: [
    { prompt: "1/5 + 2/5 =", options: ["3/10", "3/5", "2/5"], answer: 1 },
    { prompt: "Bad answer index", options: ["A", "B"], answer: 7 },
  ],
  assessment: ["Exit quiz"],
  resources: ["Fraction strips"],
  teacherNotes: [{ title: "Next lesson", points: ["Different denominators"] }],
};

const INFO = { curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Maths", topic: "Fractions", layout: "three-part", lessonLength: 60 };

function planFor(info: Partial<typeof INFO> = {}, draft: unknown = DRAFT): SheetDoc {
  return normalizeDraft(draft, sheetContext("lesson", { ...INFO, ...info }));
}

const phasesOf = (doc: SheetDoc) => doc.sections.flatMap((s) => s.blocks).filter((b): b is PhaseBlock => b.type === "phase");
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

test.describe("fitting the timings to the lesson", () => {
  test("timings that run over are scaled down to exactly the lesson", () => {
    const out = fitTimings([10, 30, 30, 10], 60);
    expect(sum(out)).toBe(60);
    // The short starter and plenary stay the shortest.
    expect(out[0]).toBeLessThan(out[1]);
    expect(out[3]).toBeLessThan(out[2]);
  });

  test("timings that fall short are stretched, longest phases first", () => {
    const out = fitTimings([5, 10, 10, 5], 60);
    expect(sum(out)).toBe(60);
    expect(out[0]).toBeLessThan(out[1]);
  });

  test("a phase given no time still gets the minimum", () => {
    const out = fitTimings([0, 30, 30], 50);
    expect(out[0]).toBeGreaterThanOrEqual(MIN_PHASE_MINUTES);
    expect(sum(out)).toBe(50);
  });

  test("nothing usable from the model shares the lesson out evenly", () => {
    expect(fitTimings([0, 0, 0, 0], 40)).toEqual([10, 10, 10, 10]);
    expect(fitTimings([NaN, -5, 0], 30)).toEqual([10, 10, 10]);
  });

  test("too many phases for the minimum each: every phase keeps the minimum and the total runs over", () => {
    const out = fitTimings(Array(12).fill(5), 20);
    expect(out.every((m) => m >= MIN_PHASE_MINUTES)).toBe(true);
    expect(sum(out)).toBe(12 * MIN_PHASE_MINUTES);
  });

  test("a long lesson and an empty plan", () => {
    expect(sum(fitTimings([10, 50, 50, 10], 180))).toBe(180);
    expect(fitTimings([], 60)).toEqual([]);
  });

  test("lesson lengths are clamped to 20 to 180 whole minutes, defaulting to 60", () => {
    expect(lessonMinutes(5)).toBe(20);
    expect(lessonMinutes(500)).toBe(180);
    expect(lessonMinutes("45")).toBe(45);
    expect(lessonMinutes(47.6)).toBe(48);
    expect(lessonMinutes(undefined)).toBe(60);
    expect(lessonMinutes("soon")).toBe(60);
  });
});

test.describe("arranging the plan", () => {
  test("three-part: overview, starter, main, plenary, assessment, resources, with the quizzes in starter and plenary", () => {
    const doc = planFor();
    expect(doc.sections.map((s) => s.title)).toEqual(["Overview", "Starter", "Main teaching", "Plenary", "Assessment", "Resources"]);
    expect(doc.sections.map((s) => s.role)).toEqual(["overview", "starter", "main", "plenary", "assessment", "resources"]);
    expect(doc.sections[1].blocks.map((b) => b.type)).toEqual(["phase", "mcq"]);
    expect(doc.sections[3].blocks.map((b) => b.type)).toEqual(["phase", "mcq", "mcq"]);
  });

  test("learning cycles: a section per cycle between the starter and exit quizzes", () => {
    const doc = planFor({ layout: "cycles" });
    expect(doc.sections.map((s) => s.title)).toEqual(["Overview", "Starter quiz", "Learning cycle 1", "Learning cycle 2", "Exit quiz", "Assessment", "Resources"]);
  });

  test("both layouts hold the same phases, quizzes and overview", () => {
    const words = (d: SheetDoc) => d.sections.flatMap((s) => s.blocks).map((b) => JSON.stringify({ ...b, id: "" })).sort();
    expect(words(planFor({ layout: "cycles" }))).toEqual(words(planFor()));
  });

  test("the phases always add up to the lesson, whatever the model said", () => {
    expect(sum(phasesOf(planFor()).map((p) => p.minutes))).toBe(60);
    expect(sum(phasesOf(planFor({ lessonLength: 45 })).map((p) => p.minutes))).toBe(45);
  });

  test("the overview carries the success criteria as ticks, the keywords and misconceptions as tables", () => {
    const [criteria, keywords, prior, points, misconceptions] = planFor().sections[0].blocks;
    expect(criteria).toMatchObject({ type: "list", style: "check", title: "Success criteria" });
    expect(keywords).toMatchObject({ type: "table", headers: ["Keyword", "Meaning"], rows: [["numerator", "The top number"], ["denominator", "The bottom number"]] });
    expect(prior).toMatchObject({ type: "list", title: "Prior knowledge" });
    expect(points).toMatchObject({ type: "list", style: "number" });
    expect(misconceptions).toMatchObject({ type: "table", rows: [["Adding the denominators", "Model with fraction strips"]] });
  });

  test("a quiz answer that points past the options is dropped, not kept as a wrong key", () => {
    const exit = planFor().sections[3].blocks.filter((b) => b.type === "mcq");
    expect(exit[0]).toMatchObject({ answers: [1] });
    expect(exit[1]).toMatchObject({ answers: [] });
  });

  test("the plan is for the teacher: no name and date lines, no hook box, and its details are kept", () => {
    const doc = planFor();
    expect(doc.subtitle).toBe("Year 5 · Maths · 60 minutes");
    expect(doc.design.nameDate).toBe(false);
    expect(doc.design.intro).toBe(false);
    expect(doc.intro).toBeNull();
    expect(doc.lesson).toEqual({ layout: "three-part", minutes: 60, curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Maths", topic: "Fractions" });
  });

  test("an unknown layout is three-part, and a stored plan reads back the same", () => {
    expect(planFor({ layout: "zigzag" }).lesson?.layout).toBe("three-part");
    const doc = planFor();
    expect(parseSheet(serializeSheet(doc))).toEqual(doc);
  });

  test("mid-stream drafts never break: nothing, a title only, half a phase", () => {
    expect(planFor({}, {}).sections).toEqual([]);
    expect(planFor({}, { title: "Fractions" }).title).toBe("Fractions");
    const half = planFor({}, { title: "F", phases: [{ stage: "starter", title: "Recall" }] });
    expect(half.sections.map((s) => s.role)).toEqual(["starter"]);
    expect(arrangeLesson(null, { layout: "cycles", minutes: 60 }).sections).toEqual([]);
  });
});

test.describe("the clock", () => {
  test("each phase starts where the one before ended", () => {
    const doc = planFor();
    const clocks = [...phaseClock(doc).values()];
    expect(clocks[0].start).toBe(0);
    for (let i = 1; i < clocks.length; i++) expect(clocks[i].start).toBe(clocks[i - 1].end);
    expect(clocks.at(-1)!.end).toBe(60);
    expect(clockText(0)).toBe("0:00");
    expect(clockText(75)).toBe("1:15");
  });

  test("the editor warns only when the phases stop adding up", () => {
    const doc = planFor();
    expect(timingMismatch(doc)).toBeNull();
    const edited: SheetDoc = { ...doc, sections: doc.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.type === "phase" && b.stage === "starter" ? { ...b, minutes: b.minutes + 5 } : b)) })) };
    expect(timingMismatch(edited)).toEqual({ planned: 65, lesson: 60 });
    expect(timingMismatch({ ...doc, lesson: undefined })).toBeNull();
  });
});

test.describe("switching layout", () => {
  test("there and back keeps every block, by id, and the edits on them", () => {
    const doc = planFor();
    const ids = (d: SheetDoc) => d.sections.flatMap((s) => s.blocks.map((b) => b.id)).sort();
    const edited = { ...doc, sections: doc.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.type === "phase" && b.title === "Practice" ? { ...b, pupils: "Edited by the teacher" } : b)) })) };
    const cycles = relayoutLesson(edited, "cycles");
    expect(cycles.lesson?.layout).toBe("cycles");
    expect(cycles.sections.map((s) => s.title)).toContain("Learning cycle 2");
    expect(ids(cycles)).toEqual(ids(doc));
    const back = relayoutLesson(cycles, "three-part");
    expect(back.sections.map((s) => s.title)).toEqual(["Overview", "Starter", "Main teaching", "Plenary", "Assessment", "Resources"]);
    expect(phasesOf(back).find((p) => p.title === "Practice")?.pupils).toBe("Edited by the teacher");
  });

  test("a section the teacher added, and a block added inside a cycle, stay put", () => {
    const doc = relayoutLesson(planFor(), "cycles");
    const withExtra: SheetDoc = {
      ...doc,
      sections: [
        ...doc.sections.map((s) => (s.title === "Learning cycle 1" ? { ...s, blocks: [...s.blocks, { id: "note1", type: "text" as const, text: "Mini whiteboards" }] } : s)),
        { id: "mine", title: "Homework", emoji: "", instructions: "", blocks: [{ id: "hw", type: "text" as const, text: "Page 12" }] },
      ],
    };
    const three = relayoutLesson(withExtra, "three-part");
    expect(three.sections.at(-1)?.id).toBe("mine");
    expect(three.sections.find((s) => s.role === "main")?.blocks.some((b) => b.id === "note1")).toBe(true);
    const cyclesAgain = relayoutLesson(three, "cycles");
    const cycle1 = cyclesAgain.sections.find((s) => s.title === "Learning cycle 1");
    expect(cycle1?.blocks.map((b) => b.id)).toContain("note1");
    expect(cyclesAgain.sections.filter((s) => s.role === "main")).toHaveLength(2);
  });

  test("an overview the teacher renamed keeps its name", () => {
    const doc = planFor();
    const renamed = { ...doc, sections: doc.sections.map((s) => (s.role === "overview" ? { ...s, title: "At a glance" } : s)) };
    expect(relayoutLesson(renamed, "cycles").sections[0].title).toBe("At a glance");
  });

  test("the same layout, or a sheet that is not a lesson plan, is left alone", () => {
    const doc = planFor();
    expect(relayoutLesson(doc, "three-part")).toBe(doc);
    const ws = { ...doc, lesson: undefined };
    expect(relayoutLesson(ws, "cycles")).toBe(ws);
  });
});

test.describe("numbering, copy and Word", () => {
  test("the starter and exit quizzes are numbered separately; a worksheet still counts down the sheet", () => {
    const doc = planFor();
    const n = questionNumbers(doc);
    const starter = doc.sections[1].blocks.find((b) => b.type === "mcq")!;
    const exit = doc.sections[3].blocks.filter((b) => b.type === "mcq");
    expect(n.get(starter.id)).toBe(1);
    expect(exit.map((b) => n.get(b.id))).toEqual([1, 2]);
    expect([...questionNumbers({ ...doc, tool: "worksheet" }).values()]).toEqual([1, 2, 3]);
  });

  test("Copy gives timed phases, tick-box criteria and answers under each quiz", () => {
    const md = sheetToMarkdown(planFor());
    expect(md).toContain("### Starter: Fraction recall (0:00 to 0:");
    expect(md).toContain("- [ ] Identify the denominator");
    expect(md).toContain("**Checking understanding:**");
    expect(md).toContain("## Quiz answers and teacher notes");
    expect(md.indexOf("### Starter")).toBeLessThan(md.indexOf("### Plenary"));
    expect(md).not.toContain("**Support:** \n");
    expect(sheetOutline(planFor())).toContain("## Quiz answers and teacher notes");
  });

  test("a learning cycle reads explain, check, practise", () => {
    const md = sheetToMarkdown(planFor({ layout: "cycles" }));
    expect(md).toContain("### Learning cycle: Modelling");
    expect(md).toContain("**Explain:** Model 1/5 + 2/5");
    expect(md).toContain("**Practise:** Follow along");
  });

  test("the Word file builds", async () => {
    const blob = await buildSheetDocx(planFor());
    expect(blob.size).toBeGreaterThan(5000);
  });
});

test.describe("the request", () => {
  const body = { curriculum: "2014 National Curriculum", yearGroup: "Year 5", subject: "Maths", topic: "Fractions", learningObjective: "Add fractions" };
  const text = (r: ReturnType<typeof lessonRequest>) => ("error" in r ? "" : r.messages.map((m) => m.content).join("\n"));

  test("anything missing is refused before the model sees it", () => {
    for (const k of Object.keys(body)) {
      expect(lessonRequest({ ...body, [k]: k === "curriculum" || k === "yearGroup" ? "" : "   " })).toEqual({ error: "Missing required fields" });
    }
  });

  test("the length is clamped and the phases are asked to add up to it", () => {
    const r = lessonRequest({ ...body, lessonLength: 999 });
    expect("error" in r ? 0 : r.minutes).toBe(180);
    expect(text(r)).toContain("add up to exactly 180 minutes");
    expect(text(lessonRequest(body))).toContain("add up to exactly 60 minutes");
  });

  test("each layout gets its own rules", () => {
    expect(text(lessonRequest(body))).toContain("LAYOUT: a UK three-part lesson");
    expect(text(lessonRequest({ ...body, layout: "cycles" }))).toContain("LAYOUT: learning cycles");
    expect(text(lessonRequest({ ...body, layout: "nonsense" }))).toContain("LAYOUT: a UK three-part lesson");
  });

  test("differentiation names the chosen bands; without it, support and challenge are still asked for", () => {
    expect(text(lessonRequest({ ...body, differentiate: "yes", differentiationLevels: ["GDS", "WTS"] }))).toMatch(/WTS[^\n]*GDS/);
    expect(text(lessonRequest(body))).toContain("support");
  });

  test("no old Ofsted framework wording and no long dashes", () => {
    const t = text(lessonRequest({ ...body, layout: "cycles", differentiate: "yes", differentiationLevels: ["WTS"] }));
    // "renewed education inspection framework" is the current name and is
    // fine; the old acronym and judgement names are not.
    expect(t).not.toMatch(/\bEIF\b|quality of education|intent, implementation,? and impact/i);
    expect(t).not.toMatch(DASHES);
  });

  test("the schema is strict all the way down", () => {
    const schema = lessonResponseFormat().json_schema.schema as Record<string, unknown>;
    const strict = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return true;
      if (Array.isArray(node)) return node.every(strict);
      const o = node as Record<string, unknown>;
      if (o.type === "object") {
        const keys = Object.keys((o.properties as object) ?? {});
        if (o.additionalProperties !== false || (o.required as string[]).length !== keys.length) return false;
      }
      return Object.values(o).every(strict);
    };
    expect(strict(schema)).toBe(true);
    expect(JSON.stringify(schema)).toEqual(JSON.stringify(strictObject(schema.properties as Record<string, unknown>)));
  });
});

test.describe("make slides, a worksheet or a quiz from the plan", () => {
  test("three links, each opening its tool filled in from the plan", () => {
    const links = lessonHandoffs(planFor());
    expect(links.map((l) => l.id)).toEqual(["slides", "worksheet", "quiz"]);
    const decoded = Object.fromEntries(links.map((l) => [l.id, decodePrefill(new URL(l.href, "http://x").searchParams.get("prefill"))]));
    expect(decoded.slides).toMatchObject({ slug: "slideshow", fields: { topic: "Fractions", year: "Year 5" } });
    expect(String(decoded.slides?.fields.additionalInstructions)).toContain("Key words: numerator, denominator");
    expect(decoded.worksheet).toMatchObject({ slug: "worksheet-generator", fields: { subject: "Maths", yearGroup: "Year 5", learningObjective: "To add fractions with the same denominator" } });
    expect(decoded.quiz).toMatchObject({ slug: "quiz-generator", fields: { subject: "Maths", topic: "Fractions", curriculum: "2014 National Curriculum" } });
  });

  test("a mixed class leaves the year out rather than sending an invalid one", () => {
    const links = lessonHandoffs(planFor({ yearGroup: "Mixed" }));
    for (const l of links) {
      const p = decodePrefill(new URL(l.href, "http://x").searchParams.get("prefill"));
      expect(p?.fields.yearGroup ?? p?.fields.year).toBeUndefined();
    }
  });

  test("a very long objective is cut to fit, and a sheet that is not a plan offers nothing", () => {
    const doc = planFor();
    const long = { ...doc, objective: "x".repeat(2000) };
    const ws = lessonHandoffs(long).find((l) => l.id === "worksheet")!;
    const p = decodePrefill(new URL(ws.href, "http://x").searchParams.get("prefill"));
    expect(String(p?.fields.learningObjective).length).toBeLessThanOrEqual(600);
    expect(lessonHandoffs({ ...doc, lesson: undefined })).toEqual([]);
  });
});
