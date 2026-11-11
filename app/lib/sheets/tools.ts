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

import type { ExamMeta, LessonMeta, LetterMeta, QuestionType, SheetDesign, UnitMeta } from "./types";
import type { UnitField } from "./unit";
import type { ThemeFamily } from "@/app/lib/slideshowThemes";
import type { SheetRequestInfo } from "./context";
import { templateById } from "./worksheet-templates";
import { arrangeLesson, DEFAULT_LESSON_LAYOUT, isLessonLayout, lessonMinutes } from "./lesson";
import { arrangeExam, EXAM_STYLES, examStyle, tierOf } from "./exam-styles";
import { arrangeModelAnswers } from "./model-answers";
import { arrangeLetter, letterMetaFor, type LetterInfo } from "./letter";
import { arrangeUnit, TERM_PLAN_COLUMNS, TOPIC_MAP_COLUMNS, UNIT_PARTS } from "./unit";
import { arrangeBehaviour, BEHAVIOUR_PARTS } from "./behaviour";
import { arrangePupilProfile, PROFILE_PARTS } from "./pupil-profile";
import { arrangeCover, COVER_KINDS, COVER_TASK_ROLE } from "./cover";

export const SHEET_TOOLS = ["worksheet", "comprehension", "lesson", "exam", "modelAnswer", "letter", "topicMap", "termPlan", "behaviourPlan", "pupilProfile", "cover"] as const;
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
  extraBlocks: ("list" | "phase" | "exemplar" | "sequence" | "twocol")[];
  /** The answers page's heading and the line under it. */
  answersTitle: string;
  answersNote: string;
  /** Number questions from 1 in each section rather than down the sheet. */
  restartNumbers: boolean;
  /** Number by section and part, as exam papers do: 1, 2(a), 2(b). */
  partNumbering: boolean;
  /** Extra rules for Jo when editing this tool's sheets. */
  joRules: string;
  /** A fixed-shape draft (the model's own schema) turned into the generic
   *  sheet draft normalizeDraft reads. Missing: the draft already is one. */
  arrange?: (raw: unknown, info: SheetRequestInfo) => unknown;
  /** Lesson plans: what the plan keeps about itself. */
  lessonMeta?: (info: SheetRequestInfo) => LessonMeta;
  /** Exam papers: style, tier and time, for the cover. */
  examMeta?: (info: SheetRequestInfo) => ExamMeta;
  /** Added to the end of the subtitle, after the year and subject. */
  subtitleSuffix?: (info: SheetRequestInfo) => string;
  /** Letters: the date, salutation, sign-off and reply slip, built in code. */
  letterMeta?: (info: LetterInfo) => LetterMeta;
  /** The theme families the Design panel offers. Missing: all of them. */
  themeFamilies?: ThemeFamily[];
  /** Design offers landscape pages. */
  landscape?: boolean;
  /** Unit plans: the lesson table's columns before the teacher changes them. */
  unitColumns?: UnitField[];
  /** Unit plans: what the plan keeps about itself, for "Plan this lesson". */
  unitMeta?: (info: SheetRequestInfo) => UnitMeta;
  /** Parts of the document Design can switch off (design.hidden), by id:
   *  section roles, or pieces built in code such as a plan's incident log. */
  parts?: { id: string; label: string }[];
  /** About one child: the name is kept in doc.pupil and "[PUPIL]" stands in
   *  for it everywhere else (app/lib/sheets/pupil.ts). */
  aboutPupil?: boolean;
  /** An empty box beside the title to stick a printed photo in (a one page
   *  profile). Switched off in Design as the part "photo". */
  photoBox?: boolean;
  /** The section role where the pupils' pages start (a cover lesson's task):
   *  it opens a new page with the name and date lines, which then do not
   *  print at the top of the teacher's pages. */
  pupilPageRole?: string;
}

const ANSWERS_NOTE = "For the teacher. Remove this page before handing the sheet out, or switch it off in Design.";

/** Every question kind any exam style uses. */
const EXAM_KINDS = [...new Set(EXAM_STYLES.flatMap((s) => s.kinds))];

function examMetaFor(info: SheetRequestInfo): ExamMeta {
  const style = examStyle(info.examStyle);
  const subject = style.subject ?? info.subject?.trim() ?? "";
  const minutes = typeof info.minutes === "number" && info.minutes > 0 ? Math.min(240, Math.round(info.minutes)) : style.minutes;
  return { styleId: style.id, tier: tierOf(style, subject, info.tier), minutes, subject, yearGroup: info.yearGroup ?? "" };
}

function unitMetaFor(info: SheetRequestInfo): UnitMeta {
  return {
    curriculum: info.curriculum ?? "",
    yearGroup: info.yearGroup ?? "",
    subject: info.subject?.trim() ?? "",
    topic: info.topic?.trim() ?? "",
  };
}

/** What Jo is told about a unit plan, for both planners. */
const UNIT_JO_RULES =
  "- This is a unit plan for teachers: a sequence of lessons on one topic. The lessons are one sequence block; each lesson has title, objective, starter, input, activity, plenary, summary (strings) and keyKnowledge, resources, questions, vocabulary (lists of strings). Every field is filled even when its column is hidden, so keep all of them filled and consistent when you change a lesson.\n" +
  "- To reword one cell, setText \"<blockId>.lessons.<n>.<field>\" (n counts from 0) for a string field. To change a list field, add, remove or reorder lessons, replaceBlock the whole sequence block with every lesson in it.\n" +
  "- Lessons build on each other: if you change one, check the lessons after it still follow. Never invent exam board content that was not asked for.";

/** What Jo is told about any document about one child. */
const PUPIL_JO_RULES =
  "- The child this is about is written as [PUPIL]. Always write [PUPIL] where you would use their name, never a name, and never name other children or staff. Keep the pronouns the document already uses.\n";

/** A unit plan starts landscape, for staff: no name lines, objective line,
 *  hook box or answers page. */
const unitStartDesign = () => ({ landscape: true, nameDate: false, objective: false, intro: false, answers: false, pictures: false });

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
    partNumbering: false,
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
    partNumbering: false,
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
    partNumbering: false,
    joRules:
      "- This is a lesson plan for the teacher, not a pupil sheet. A phase block is one stage of the lesson: stage (starter, main, plenary), title, minutes, teacher (what the teacher does or explains), pupils (what pupils do), check (questions that check understanding), feedback, support, challenge and ta (what a teaching assistant does). In the learning cycles layout each main phase is a learning cycle: teacher is the explanation and pupils the practice.\n" +
      "- The phases' minutes must still add up to the lesson length in the subtitle. If you lengthen one phase, shorten another, and say so in the summary.\n" +
      "- To reword part of a phase, setText its field (\"<blockId>.teacher\", \"<blockId>.pupils\", \"<blockId>.support\", \"<blockId>.challenge\", \"<blockId>.ta\", \"<blockId>.feedback\", \"<blockId>.title\") or one check question (\"<blockId>.check.<n>\"). A list block's items are \"<blockId>.items.<n>\". To change a phase's minutes, replaceBlock it.\n" +
      "- The starter and exit quizzes are multiple choice questions with one right answer; keep their answers correct.",
    arrange: (raw, info) => arrangeLesson(raw, lessonMetaFor(info)),
    lessonMeta: lessonMetaFor,
    subtitleSuffix: (info) => `${lessonMinutes(info.lessonLength)} minutes`,
  },
  exam: {
    slug: "exam-question-generator",
    joName: "exam paper",
    docLabel: "exam paper",
    joStarters: [
      "Make question 2 harder",
      "Add a 6 mark extended answer question",
      "Turn question 1 into multiple choice",
      "Add more mark points to the mark scheme",
    ],
    defaultKinds: ["mcq", "short", "long", "calc"],
    allowedKinds: EXAM_KINDS,
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    // A KS2 reading paper has a text to read.
    joPassage: true,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    // The cover has the candidate's details, so no name line on the pages.
    startDesign: (info) => ({
      nameDate: false,
      objective: false,
      intro: false,
      lineNumbers: examStyle(info.examStyle).passage,
      ...(info.includeAnswerKey === false ? { answers: false } : {}),
    }),
    extraBlocks: [],
    answersTitle: "Mark scheme",
    answersNote: "For the teacher: the answers, the points that earn marks and how to award them. Remove these pages before the paper is sat, or switch them off in Design.",
    restartNumbers: false,
    partNumbering: true,
    joRules:
      "- This is an exam paper. Each section is one question; its blocks are the question's parts, numbered 1(a), 1(b) on the page. Every part has marks. The total on the cover is worked out from the parts, so never write a total.\n" +
      "- A part's answer and, for long answers, its criteria are the mark scheme: keep them matching the question, with one mark point for each mark. Answers of 6 marks or more are marked by levels in the criteria.\n" +
      "- Write original questions in the style of the paper. Never copy or paraphrase a real exam board question.",
    arrange: (raw) => arrangeExam(raw),
    examMeta: examMetaFor,
    subtitleSuffix: (info) => {
      const meta = examMetaFor(info);
      return meta.tier ? `${meta.tier === "higher" ? "Higher" : "Foundation"} tier` : "";
    },
  },
  modelAnswer: {
    slug: "model-answer-generator",
    joName: "set of model answers",
    docLabel: "model answers",
    joStarters: [
      "Add a near miss answer to question 1",
      "Make the full marks answer more concise",
      "Show the working step by step",
      "Add a note on common mistakes",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: false,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Model answers",
    ownPassage: false,
    startDesign: () => ({ nameDate: false, objective: false, intro: false, answers: false }),
    extraBlocks: ["list", "exemplar"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- Each section is one exam question (its text and marks are in the section's instructions). Its exemplar blocks are model answers at a level: full (full marks), mid or low (a near miss), each with awarded and outOf marks, the answer as parts (paragraphs, steps or points), annotations quoting a phrase from the answer with the mark scheme point it earns, and a line of commentary.\n" +
      "- Keep awarded marks honest for what the answer contains, never above outOf. An annotation's quote must be words that appear in the answer.",
    arrange: (raw) => arrangeModelAnswers(raw),
  },
  letter: {
    slug: "letter-writer",
    joName: "letter to parents",
    docLabel: "letter",
    joStarters: [
      "Make it shorter",
      "Make the tone warmer",
      "Make the first paragraph clearer",
      "Add a line about who to contact with questions",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    // A letter is printed plainly: no name lines, objective, hook or answers.
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a letter from a school, usually to parents and carers. The title is the \"Re:\" line. The letter's paragraphs are text blocks; a table block holds a trip's details. The date, the salutation (\"Dear...\"), the sign-off and the reply slip are printed by the page, so never write them into a paragraph.\n" +
      "- Keep it clear and plain for parents, in short paragraphs. Never invent a date, a time, a cost, a name or a consequence that is not already in the letter.",
    arrange: (raw, info) => arrangeLetter(raw, info.letter),
    letterMeta: letterMetaFor,
    themeFamilies: ["professional", "basic"],
  },
  topicMap: {
    slug: "topic-overview",
    joName: "topic map (a unit of lessons)",
    docLabel: "topic map",
    joStarters: [
      "Add a retrieval starter to every lesson",
      "Make lesson 3 more practical",
      "Add an assessment point halfway",
      "Add a lesson to consolidate before the end",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    startDesign: unitStartDesign,
    extraBlocks: ["list", "sequence"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules: UNIT_JO_RULES,
    arrange: (raw) => arrangeUnit(raw),
    landscape: true,
    unitColumns: TOPIC_MAP_COLUMNS,
    unitMeta: unitMetaFor,
    parts: UNIT_PARTS,
  },
  termPlan: {
    slug: "medium-term-planner",
    joName: "medium-term plan (a unit of lessons)",
    docLabel: "term plan",
    joStarters: [
      "Make the key knowledge more precise",
      "Add a lesson on exam technique",
      "Move the assessment point earlier",
      "Make the objectives build more clearly",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    startDesign: unitStartDesign,
    extraBlocks: ["list", "sequence"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules: UNIT_JO_RULES,
    arrange: (raw) => arrangeUnit(raw),
    landscape: true,
    unitColumns: TERM_PLAN_COLUMNS,
    unitMeta: unitMetaFor,
    parts: UNIT_PARTS,
  },
  behaviourPlan: {
    slug: "behaviour-support-plan",
    joName: "Behaviour Support Plan",
    docLabel: "behaviour plan",
    joStarters: [
      "Make the targets more measurable",
      "Add more de-escalation steps",
      "Add phrases for a supply teacher to use",
      "Make the language warmer",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: false,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Behaviour Support Plan",
    ownPassage: false,
    // For staff, printed plainly.
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list", "twocol"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules: PUPIL_JO_RULES +
      "- This is a Behaviour Support Plan for every adult who works with [PUPIL]. Most of it is twocol blocks: two headed lists side by side (\"What triggers it?\" beside \"How do we get there?\"). To change a box, replaceBlock it with both sides. Keep each point short, specific and observable, and describe behaviour, never the child.",
    arrange: (raw, info) => arrangeBehaviour(raw, info.pupilFacts ?? []),
    themeFamilies: ["professional", "basic"],
    parts: BEHAVIOUR_PARTS,
    aboutPupil: true,
  },
  pupilProfile: {
    slug: "one-page-profile",
    joName: "one page profile, written in the pupil's own voice",
    docLabel: "profile",
    joStarters: [
      "Make it sound more like a younger child",
      "Add a point about lunchtimes",
      "Make the support points more specific",
      "Shorten every box to three points",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: false,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "One page profile",
    ownPassage: false,
    startDesign: () => ({ nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list", "twocol"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules: PUPIL_JO_RULES +
      "- This is a one page profile in the pupil's own voice: every point is in the first person (\"I like...\", \"It helps me when...\"), warm and simple. The boxes are twocol blocks; to change one, replaceBlock it with both sides. Keep it to one page: short points, 3 to 5 a box.",
    arrange: (raw, info) => arrangePupilProfile(raw, { dates: info.pupilFacts ?? [], links: info.pupilLinks ?? [] }),
    parts: PROFILE_PARTS,
    aboutPupil: true,
    photoBox: true,
  },
  cover: {
    slug: "cover-lesson",
    joName: "cover lesson (a plan for a non-specialist cover teacher, then a pupil task sheet)",
    docLabel: "cover lesson",
    joStarters: [
      "Make the instructions simpler",
      "Add two harder questions at the end",
      "Make the starter work without the board",
      "Add a quiet reading task for early finishers",
    ],
    defaultKinds: [...COVER_KINDS],
    allowedKinds: [...COVER_KINDS],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    // Name and date lines go on the pupil task page, not the teacher's.
    startDesign: () => ({ objective: false, intro: false, pictures: false }),
    extraBlocks: ["list", "phase"],
    answersTitle: "Answers to the pupil task",
    answersNote: "For the cover teacher, to go through the task with the class. Remove this page before handing the task out, or switch it off in Design.",
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a cover lesson for a cover teacher who is not a subject specialist, then a pupil task. Each phase block is one stage: say (the words to say to the class), teacher (numbered steps for the cover teacher), pupils, challenge (what early finishers do) and minutes. The phases' minutes must still add up to the lesson; if you lengthen one, shorten another and say so.\n" +
      "- The last section is the pupil task: its blocks are the questions pupils answer on their own. Keep every answer correct. Never assume the cover teacher knows the subject.",
    arrange: (raw, info) => arrangeCover(raw, lessonMinutes(info.lessonLength)),
    subtitleSuffix: (info) => `Cover lesson · ${lessonMinutes(info.lessonLength)} minutes`,
    pupilPageRole: COVER_TASK_ROLE,
  },
};

export function sheetToolProfile(tool: SheetTool): SheetToolProfile {
  return SHEET_TOOL_PROFILES[tool];
}

/** The sheet tool a tool_runs slug belongs to, or null for any other tool. */
export function sheetToolForSlug(slug: string): SheetTool | null {
  return SHEET_TOOLS.find((t) => SHEET_TOOL_PROFILES[t].slug === slug) ?? null;
}
