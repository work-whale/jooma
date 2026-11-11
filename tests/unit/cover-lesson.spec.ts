import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { sheetContext } from "@/app/lib/sheets/context";
import { normalizeBlock, normalizeDraft } from "@/app/lib/sheets/normalize";
import { hasAnswersPage, answersTitle, sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { sheetBlockVariants } from "@/app/lib/sheets/schema";
import { joSheetResponseFormat } from "@/app/lib/jo/sheet-schema";
import { coverMinutes, COVER_KINDS } from "@/app/lib/sheets/cover";
import { coverRequest, coverResponseFormat, type CoverLessonRequest } from "@/app/lib/cover-prompt";
import type { PhaseBlock, SheetDoc } from "@/app/lib/sheets/types";

/*
 * Cover Lesson as a sheet: a plan a non-specialist can follow (notes, timed
 * stages with what to say, a checklist), then the pupil task on its own page
 * with name lines, then the answers. Pure; nothing reaches a model.
 */

const DASHES = /[–—]/;

/** What the model would send. Its timings add to 70, not the 60 asked for. */
const MODEL = {
  title: "Photosynthesis practice",
  notes: ["The class has been learning about photosynthesis", "Seat them in their usual places"],
  phases: [
    { stage: "starter", title: "Quick recall", minutes: 10, say: "Good morning, I'm covering today.", teacher: "1. Write three questions on the board.", pupils: "Answer in books", challenge: "Write a fourth question" },
    { stage: "main", title: "Practice questions", minutes: 50, say: "Turn to the task sheet.", teacher: "1. Hand out the sheet. 2. Circulate.", pupils: "Complete the task", challenge: "Try the last two questions" },
    { stage: "plenary", title: "Go through answers", minutes: 10, say: "Pens down.", teacher: "1. Read the answers.", pupils: "Mark their work", challenge: "" },
  ],
  checklist: ["Collect the task sheets", "Leave a note for the teacher"],
  task: {
    title: "Photosynthesis: practice questions",
    instructions: "Answer every question in full sentences.",
    questions: [
      { type: "mcq", prompt: "What gas do plants take in?", options: ["Oxygen", "Carbon dioxide"], answers: [1], marks: 1 },
      { type: "short", prompt: "Where does photosynthesis happen?", lines: 2, answer: "In the chloroplasts", marks: 1 },
    ],
  },
};

const coverFor = (draft: unknown = MODEL, minutes = 60): SheetDoc =>
  normalizeDraft(draft, sheetContext("cover", { yearGroup: "Year 8", subject: "Science", topic: "Photosynthesis", lessonLength: minutes }));

const phases = (d: SheetDoc) => d.sections.flatMap((s) => s.blocks.filter((b): b is PhaseBlock => b.type === "phase"));

test.describe("reading a lesson length", () => {
  test("from what the form holds", () => {
    expect(coverMinutes("60 minutes")).toBe(60);
    expect(coverMinutes("45")).toBe(45);
    expect(coverMinutes("1 hour")).toBe(60);
    expect(coverMinutes("1 hour 15 minutes")).toBe(75);
    expect(coverMinutes("1.5 hours")).toBe(90);
    expect(coverMinutes(50)).toBe(50);
  });

  test("nothing usable is null, so the request is refused rather than guessed", () => {
    expect(coverMinutes("about an hour")).toBeNull();
    expect(coverMinutes("")).toBeNull();
    expect(coverMinutes(undefined)).toBeNull();
  });
});

test.describe("arranging the lesson", () => {
  test("notes, the lesson, the checklist, then the pupil task", () => {
    expect(coverFor().sections.map((s) => s.role)).toEqual(["notes", "lesson", "checklist", "task"]);
  });

  test("the stages are fitted to the lesson, and the glance table follows them", () => {
    const d = coverFor(MODEL, 60);
    expect(phases(d).reduce((a, p) => a + p.minutes, 0)).toBe(60);
    const glance = d.sections[0].blocks.find((b) => b.type === "table");
    expect(glance).toMatchObject({ headers: ["Time", "Stage", "What pupils do"] });
    expect((glance as { rows: string[][] }).rows.at(-1)![0]).toMatch(/to 1:00$/);
  });

  test("each stage keeps the words to say; a lesson plan's phases never get a script", () => {
    expect(phases(coverFor())[0].say).toBe("Good morning, I'm covering today.");
    const lessonPhase = normalizeBlock({ type: "phase", stage: "main", title: "Model", minutes: 10, teacher: "Explain" }, "b1") as PhaseBlock;
    expect("say" in lessonPhase).toBe(false);
  });

  test("Copy speaks to the cover teacher", () => {
    const md = sheetToMarkdown(coverFor());
    expect(md).toContain("**What to say to the class:** Good morning, I'm covering today.");
    expect(md).toContain("**What you do:** 1. Write three questions on the board.");
    expect(md).toContain("**If pupils finish early:** Write a fourth question");
    expect(md).toContain("### End of lesson: Go through answers");
  });

  test("the task's answers make an answers page for the cover teacher", () => {
    const d = coverFor();
    expect(hasAnswersPage(d)).toBe(true);
    expect(answersTitle(d)).toBe("Answers to the pupil task");
    expect(sheetToMarkdown(d)).toContain("1. b) Carbon dioxide");
  });

  test("the name lines are on the pupil task, not the teacher's first page, in Word too", async () => {
    const d = coverFor();
    expect(d.design.nameDate).toBe(true);
    const xml = await (await JSZip.loadAsync(await (await buildSheetDocx(d)).arrayBuffer())).file("word/document.xml")!.async("string");
    const firstName = xml.indexOf(">Name <");
    const pageBreak = xml.indexOf('<w:br w:type="page"/>');
    const task = xml.indexOf("Photosynthesis: practice questions");
    expect(pageBreak).toBeGreaterThan(0);
    // The only name line comes after the page break, just before the task.
    expect(firstName).toBeGreaterThan(pageBreak);
    expect(firstName).toBeLessThan(task);
    expect(xml.indexOf(">Name <", firstName + 1)).toBe(-1);
  });
});

test.describe("schemas", () => {
  test("only the cover tool's phases carry a script; the lesson plan's schema is unchanged", () => {
    const phaseOf = (tool: "cover" | "lesson") => sheetBlockVariants({ tool, kinds: [], passage: false }).find((v) => JSON.stringify(v).includes('"enum":["phase"]'))!;
    expect(Object.keys((phaseOf("cover").properties as object))).toContain("say");
    expect(Object.keys((phaseOf("lesson").properties as object))).not.toContain("say");
    expect(JSON.stringify(joSheetResponseFormat("lesson"))).not.toContain('"say"');
  });

  test("the task offers only questions any adult can run and mark", () => {
    const text = JSON.stringify(coverResponseFormat());
    for (const k of COVER_KINDS) expect(text).toContain(`"enum":["${k}"]`);
    for (const k of ["crossword", "wordsearch", "calc", "picture", "passage"]) expect(text).not.toContain(`"enum":["${k}"]`);
  });
});

test.describe("the request", () => {
  const body: CoverLessonRequest = { curriculum: "2014 National Curriculum", yearGroup: "Year 8", subject: "Science", topic: "Photosynthesis", lessonLength: "50 minutes", resources: "Basic stationery only (pen and paper)" };
  const text = (r: ReturnType<typeof coverRequest>) => ("error" in r ? "" : r.messages.map((m) => m.content).join("\n"));

  test("refuses a request missing what a cover lesson needs, or with no length in it", () => {
    for (const missing of ["curriculum", "yearGroup", "subject", "topic", "resources"] as const) {
      expect(coverRequest({ ...body, [missing]: " " })).toEqual({ error: "Missing required fields" });
    }
    expect(coverRequest({ ...body, lessonLength: "a while" })).toEqual({ error: "Missing required fields" });
  });

  test("the length reaches the prompt as minutes, held to 20 to 180", () => {
    expect(text(coverRequest(body))).toContain("must add up to 50 minutes");
    expect(text(coverRequest({ ...body, lessonLength: "5 minutes" }))).toContain("must add up to 20 minutes");
  });

  test("no long dashes in what the model is told, with or without bands", () => {
    expect(text(coverRequest(body))).not.toMatch(DASHES);
    expect(text(coverRequest({ ...body, differentiate: "yes", differentiationLevels: ["WTS", "GDS"], additionalContext: "Top set" }))).not.toMatch(DASHES);
  });
});
