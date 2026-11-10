// The tools that make sheets, and what differs between them.
//
// A sheet (app/lib/sheets/types.ts) started as the Worksheet and Comprehension
// output. Other tools are moving onto it (lesson plans, exam papers, model
// answers, letters) so they get the same designed pages, export, autosave and
// Ask Jo. Everything that used to be a `tool === "worksheet"` check lives here
// instead, one profile per tool, so adding a tool is adding a profile rather
// than hunting for every place the two names were written.
//
// Pure and free of React: read by the API routes, the stream reader and the
// browser alike.

import type { LessonMeta, QuestionType, SheetDesign } from "./types";
import type { SheetRequestInfo } from "./context";
import { templateById } from "./worksheet-templates";
import { arrangeLesson, DEFAULT_LESSON_LAYOUT, isLessonLayout, lessonMinutes } from "./lesson";

export const SHEET_TOOLS = ["worksheet", "comprehension", "lesson"] as const;
export type SheetTool = (typeof SHEET_TOOLS)[number];

export function isSheetTool(v: unknown): v is SheetTool {
  return typeof v === "string" && (SHEET_TOOLS as readonly string[]).includes(v);
}

export interface SheetToolProfile {
  /** The tool_runs slug, which is also its API route and usage label. */
  slug: string;
  /** What Jo calls it in a prompt: "reading comprehension". */
  joName: string;
  /** What the Jo panel calls it to the teacher: "comprehension". */
  docLabel: string;
  /** The suggestions the Jo panel opens with. */
  joStarters: string[];
  /** The question kinds a request gets when the teacher ticks none. */
  defaultKinds: QuestionType[];
  /** Every kind the tool can hold: the defaults and any asked for by name. */
  allowedKinds: QuestionType[];
  /** Questions carry a reading domain ("2b"). */
  questionDomain: boolean;
  /** Short questions carry a quote from the passage (vocabulary in context). */
  vocabularyQuote: boolean;
  /** The model may write a table block. */
  table: boolean;
  /** Jo may write a passage block. */
  joPassage: boolean;
  /** Pictures can be added (the picture route refuses a tool without them). */
  pictures: boolean;
  /** A new sheet numbers the lines of its passages. */
  lineNumbers: boolean;
  /** Fixed second half of the subtitle; null to use the form's subject. */
  subtitleLabel: string | null;
  /** The teacher's own text can lead the sheet, placed without the model. */
  ownPassage: boolean;
  /** Design changes the request asks for, over the year's default. */
  startDesign: (info: SheetRequestInfo) => Partial<SheetDesign>;
  /** Content blocks beyond the shared ones (text, callout, word bank, table)
   *  that Jo may write and the teacher may add. */
  extraBlocks: ("list" | "phase")[];
  /** The answers page's heading and the line under it. */
  answersTitle: string;
  answersNote: string;
  /** Number questions from 1 in each section rather than down the sheet. */
  restartNumbers: boolean;
  /** Extra rules for Jo when editing this tool's sheets. */
  joRules: string;
  /** A fixed-shape draft (the model's own schema) turned into the generic
   *  sheet draft normalizeDraft reads. Missing: the draft already is one. */
  arrange?: (raw: unknown, info: SheetRequestInfo) => unknown;
  /** Lesson plans: what the plan keeps about itself. */
  lessonMeta?: (info: SheetRequestInfo) => LessonMeta;
  /** Added to the end of the subtitle, after the year and subject. */
  subtitleSuffix?: (info: SheetRequestInfo) => string;
}

const ANSWERS_NOTE = "For the teacher. Remove this page before handing the sheet out, or switch it off in Design.";

function lessonMetaFor(info: SheetRequestInfo): LessonMeta {
  return {
    layout: isLessonLayout(info.layout) ? info.layout : DEFAULT_LESSON_LAYOUT,
    minutes: lessonMinutes(info.lessonLength),
    curriculum: info.curriculum ?? "",
    yearGroup: info.yearGroup ?? "",
    subject: info.subject?.trim() ?? "",
    topic: info.topic?.trim() ?? "",
  };
}

export const SHEET_TOOL_PROFILES: Record<SheetTool, SheetToolProfile> = {
  worksheet: {
    slug: "worksheet-generator",
    joName: "worksheet",
    docLabel: "worksheet",
    joStarters: [
      "Make it easier for a lower ability group",
      "Add a challenge question at the end",
      "Add a word bank to the first section",
      "Turn question 1 into multiple choice",
    ],
    defaultKinds: ["mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "picture", "label"],
    // The puzzles are left out of the defaults: a mix should never turn up a
    // word search unasked.
    allowedKinds: ["mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "picture", "label", "sort", "wordsearch", "crossword"],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: true,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    // The worksheet type's starting design (an exam paper drops the
    // objective line).
    startDesign: (info) => templateById(info.template).design ?? {},
    extraBlocks: [],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    joRules: "",
  },
  comprehension: {
    slug: "comprehension-generator",
    joName: "reading comprehension",
    docLabel: "comprehension",
    joStarters: [
      "Make the questions easier for lower ability",
      "Add two harder inference questions",
      "Shorten the passage a little",
      "Add a vocabulary section",
    ],
    defaultKinds: ["mcq", "truefalse", "fillblanks", "short", "long"],
    allowedKinds: ["mcq", "truefalse", "fillblanks", "short", "long"],
    questionDomain: true,
    vocabularyQuote: true,
    table: false,
    joPassage: true,
    pictures: true,
    lineNumbers: true,
    subtitleLabel: "Reading comprehension",
    ownPassage: true,
    startDesign: (info) => (info.includeAnswerKey === false ? { answers: false } : {}),
    extraBlocks: [],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    joRules: "",
  },
  lesson: {
    slug: "lesson-planner",
    joName: "lesson plan",
    docLabel: "lesson plan",
    joStarters: [
      "Make the starter more active",
      "Add a TA task to every phase",
      "Add a hinge question to the main teaching",
      "Make the challenge harder for the most able",
    ],
    // The starter and exit quizzes. The teacher can add other kinds by hand.
    defaultKinds: ["mcq"],
    allowedKinds: ["mcq", "truefalse", "short"],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    // A plan is for the teacher: no name and date lines, and no hook box.
    startDesign: () => ({ nameDate: false, intro: false }),
    extraBlocks: ["list", "phase"],
    answersTitle: "Quiz answers and teacher notes",
    answersNote: "The answers to the starter and exit quizzes, and notes for whoever teaches the lesson.",
    restartNumbers: true,
    joRules:
      "- This is a lesson plan for the teacher, not a pupil sheet. A phase block is one stage of the lesson: stage (starter, main, plenary), title, minutes, teacher (what the teacher does or explains), pupils (what pupils do), check (questions that check understanding), feedback, support, challenge and ta (what a teaching assistant does). In the learning cycles layout each main phase is a learning cycle: teacher is the explanation and pupils the practice.\n" +
      "- The phases' minutes must still add up to the lesson length in the subtitle. If you lengthen one phase, shorten another, and say so in the summary.\n" +
      "- To reword part of a phase, setText its field (\"<blockId>.teacher\", \"<blockId>.pupils\", \"<blockId>.support\", \"<blockId>.challenge\", \"<blockId>.ta\", \"<blockId>.feedback\", \"<blockId>.title\") or one check question (\"<blockId>.check.<n>\"). A list block's items are \"<blockId>.items.<n>\". To change a phase's minutes, replaceBlock it.\n" +
      "- The starter and exit quizzes are multiple choice questions with one right answer; keep their answers correct.",
    arrange: (raw, info) => arrangeLesson(raw, lessonMetaFor(info)),
    lessonMeta: lessonMetaFor,
    subtitleSuffix: (info) => `${lessonMinutes(info.lessonLength)} minutes`,
  },
};

export function sheetToolProfile(tool: SheetTool): SheetToolProfile {
  return SHEET_TOOL_PROFILES[tool];
}

/** The sheet tool a tool_runs slug belongs to, or null for any other tool. */
export function sheetToolForSlug(slug: string): SheetTool | null {
  return SHEET_TOOLS.find((t) => SHEET_TOOL_PROFILES[t].slug === slug) ?? null;
}
