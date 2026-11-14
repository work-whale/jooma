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
import { arrangeHomework } from "./homework";
import { arrangeModelText, MODEL_TEXT_PARTS } from "./model-text";
import { arrangeTargets, TARGETS_PARTS } from "./targets";
import { arrangeIntervention, INTERVENTION_PARTS } from "./intervention";
import { arrangePhonics } from "./phonics";
import { arrangeEyfs, EYFS_PARTS } from "./eyfs";
import { phonicsScheme, schemeNote } from "@/app/lib/phonics-schemes";
import { arrangePupilPremium, PP_PARTS, PP_START_HIDDEN } from "./pupil-premium";
import { arrangeEyfsActionPlan, EYFS_ACTION_PARTS, eyfsTimescale } from "./eyfs-action-plan";
import { arrangeRisk, RISK_PARTS } from "./risk";
import { arrangeSensory, SENSORY_PARTS } from "./sensory";
import { arrangeNewsletter, diaryDate, NEWSLETTER_PARTS } from "./newsletter";
import { arrangeEct, ECT_PARTS } from "./ect";
import { APPRAISAL_PARTS, arrangeAppraisal } from "./appraisal";
import { arrangeLearningWalk, arrangeLessonObservation, LEARNING_WALK_PARTS, LESSON_OBS_PARTS } from "./observation";
import { arrangeSip, SIP_PARTS } from "./sip";
import { arrangeInspection, INSPECTION_PARTS } from "./inspection";
import { arrangePolicy, POLICY_PARTS } from "./policy";
import { arrangeMeeting, MEETING_PARTS } from "./meeting";
import { arrangeAssembly, ASSEMBLY_SHEET_PARTS } from "./assembly";

export const SHEET_TOOLS = [
  "worksheet", "comprehension", "lesson", "exam", "modelAnswer", "letter", "topicMap", "termPlan", "behaviourPlan", "pupilProfile", "cover",
  "homework", "modelText", "targets", "intervention", "phonics", "eyfsPlan",
  "pupilPremium", "eyfsActionPlan", "riskAssessment", "sensory", "newsletter",
  "ectReport", "appraisal", "lessonObservation", "learningWalk", "sip",
  "inspection", "policy", "meeting", "assembly",
] as const;
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

/** A staff document about one child, printed plainly: no name lines,
 *  objective, hook, answers page or pictures. */
const pupilDocDesign = () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false });

/** Whether the teacher gave the child's first name (the name itself never
 *  leaves the browser). */
const isNamed = (info: SheetRequestInfo) => !!info.pupil?.name.trim();

/** The question kinds a homework can hold: a worksheet's. */
const HOMEWORK_KINDS: QuestionType[] = ["mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "label", "sort", "wordsearch", "crossword"];

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
  homework: {
    slug: "homework-generator",
    joName: "homework task (a sheet pupils complete at home)",
    docLabel: "homework",
    joStarters: [
      "Make it a little shorter",
      "Add a challenge question at the end",
      "Make the instructions simpler",
      "Add two more key words to the reminder",
    ],
    defaultKinds: ["mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order"],
    allowedKinds: HOMEWORK_KINDS,
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: true,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    startDesign: (info) => ({ intro: false, pictures: false, ...(info.includeAnswerKey === false ? { answers: false } : {}) }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: "For the teacher, to mark the homework or go through it in class. Remove this page before sending the homework home, or switch it off in Design.",
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is homework a pupil completes alone at home, with no adult to explain it: instructions must be clear enough to follow without help, and the amount must fit the time in the subtitle. If you add a question, take one out or say the time has grown.\n" +
      "- The \"Remember\" section reminds pupils of key words; the task section is the work; \"How did I do?\" is a checklist pupils tick. Keep every answer correct: the answers page is built from them.",
    arrange: (raw) => arrangeHomework(raw),
    subtitleSuffix: (info) => (typeof info.minutes === "number" && info.minutes > 0 ? `Homework · about ${info.minutes} minutes` : "Homework"),
  },
  modelText: {
    slug: "model-text-generator",
    joName: "model text (an example piece of writing for pupils, with a teacher copy marking its features)",
    docLabel: "model text",
    joStarters: [
      "Make it shorter for a younger class",
      "Add another example of a fronted adverbial",
      "Make the vocabulary more ambitious",
      "Explain each feature more simply",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: false,
    joPassage: true,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Model text",
    ownPassage: false,
    startDesign: () => ({ nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list", "exemplar"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a model text for pupils, then a teacher copy. The text is a passage block; the teacher copy is an exemplar block (purpose \"text\") holding the SAME paragraphs, with annotations: each quotes words that appear exactly in the text and says which writing feature they show and why it works.\n" +
      "- If you change the text, make the same change in both the passage and the teacher copy's parts, and keep every annotation's quote word for word from the text. Never give the teacher copy marks.",
    arrange: (raw) => arrangeModelText(raw),
    parts: MODEL_TEXT_PARTS,
  },
  targets: {
    slug: "smart-targets",
    joName: "set of SMART targets for one pupil",
    docLabel: "targets",
    joStarters: [
      "Make the targets easier for the pupil to read",
      "Make the measures more precise",
      "Add a target about independence",
      "Shorten the review dates to six weeks",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "SMART targets",
    ownPassage: false,
    startDesign: () => ({ ...pupilDocDesign(), landscape: true }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules: PUPIL_JO_RULES +
      "- These are SMART targets for one pupil, as one table: Target, Specific (an \"I will...\" statement the pupil can read), Measurable, Achievable (the support given), Relevant and Time-bound. To change a target, replaceBlock the whole table with every row. Keep the review table's first column matching the targets.",
    arrange: (raw, info) => arrangeTargets(raw, info.pupilFacts ?? [], isNamed(info)),
    themeFamilies: ["professional", "basic"],
    landscape: true,
    parts: TARGETS_PARTS,
    aboutPupil: true,
  },
  intervention: {
    slug: "targeted-intervention",
    joName: "set of intervention ideas for one pupil",
    docLabel: "intervention plan",
    joStarters: [
      "Make the strategies more practical",
      "Add a strategy a TA can run",
      "Make the measures more specific",
      "Cut it to the five strongest strategies",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Intervention ideas",
    ownPassage: false,
    startDesign: pupilDocDesign,
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules: PUPIL_JO_RULES +
      "- These are intervention strategies for one pupil, each its own section: a summary, \"How to do it\" steps, who runs it and how often, and how staff will know it is working. Keep every strategy realistic for a school and grounded in what the information says. Never invent a diagnosis, a score or a name. Keep the tracking table's first column matching the strategies.",
    arrange: (raw, info) => arrangeIntervention(raw, info.pupilFacts ?? [], isNamed(info)),
    themeFamilies: ["professional", "basic"],
    unitMeta: unitMetaFor,
    parts: INTERVENTION_PARTS,
    aboutPupil: true,
  },
  phonics: {
    slug: "phonics-support",
    joName: "phonics resource for one grapheme",
    docLabel: "phonics resource",
    joStarters: [
      "Make the decodable text shorter",
      "Add more CVC words",
      "Make activity 2 work outdoors",
      "Add more made-up words for practice",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: true,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Phonics",
    ownPassage: false,
    startDesign: () => ({ nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a phonics resource for one grapheme, for an adult teaching young children. Every word in the decodable text must be decodable with the sounds taught so far, apart from the common words listed. The made-up words must use the grapheme and must not be real words.\n" +
      "- Keep the school's phonics scheme's words if the page names a scheme, and never copy a scheme's own texts or rhymes.",
    arrange: (raw, info) => {
      const s = phonicsScheme(info.phonicsScheme);
      return arrangePhonics(raw, { schemeNote: schemeNote(info.phonicsScheme, info.phonicsSchemeOther), trickyLabel: s?.tricky ?? "", pseudoLabel: s?.pseudo ?? "" });
    },
    subtitleSuffix: (info) => (typeof info.age === "number" ? `Age ${info.age}` : ""),
  },
  eyfsPlan: {
    slug: "eyfs-planner",
    joName: "Early Years (EYFS) topic plan across the seven areas of learning",
    docLabel: "early years plan",
    joStarters: [
      "Add more outdoor provision",
      "Make the maths activities more hands-on",
      "Add a week on a story",
      "Make the home learning easier for parents",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Early Years plan",
    ownPassage: false,
    // The form's checkboxes become parts switched off, never left out: the
    // plan always has them, so switching one on needs no regenerating.
    startDesign: (info) => ({ ...unitStartDesign(), hidden: [...(info.eyfsHidden ?? [])] }),
    extraBlocks: ["list", "twocol"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is an Early Years Foundation Stage topic plan for Nursery or Reception. The week grid is a table: one row per area of learning, one column per week; keep each cell to a short phrase. Each area's section has continuous provision (a twocol block: indoors beside outdoors) and adult-led activities.\n" +
      "- Quote Early Learning Goals only as the EYFS statutory framework words them, and never invent one. Activities must suit three to five year olds, be play-based and be safe.",
    arrange: (raw) => arrangeEyfs(raw),
    landscape: true,
    unitMeta: unitMetaFor,
    parts: EYFS_PARTS,
  },
  pupilPremium: {
    slug: "pupil-premium-planner",
    joName: "pupil premium strategy statement, drafted on the DfE template",
    docLabel: "statement",
    joStarters: [
      "Add an activity on attendance",
      "Make the success criteria more measurable",
      "Make the statement of intent shorter",
      "Check every challenge has an activity",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Pupil premium",
    ownPassage: false,
    startDesign: (info) => ({ ...unitStartDesign(), themeId: "classic", hidden: [...PP_START_HIDDEN, ...(info.hiddenParts ?? [])] }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a draft of a school's pupil premium strategy statement on the DfE template. Keep the template's headings and order. The activity tables have three columns: Activity, Evidence that supports this approach, Challenge number(s) addressed; every challenge number must be one in the Challenges table.\n" +
      "- Evidence names an EEF Teaching and Learning Toolkit strand, an EEF guidance report or DfE guidance by title. Never write months of progress, effect sizes, costs, budgets or pupil data the school did not give: the Budgeted cost lines and the school and funding overviews are the school's to fill in. Part B is for the school to write.",
    arrange: (raw, info) => arrangePupilPremium(raw, { schoolName: info.schoolName, facts: info.schoolFacts, challenges: info.ppChallenges }),
    landscape: true,
    parts: PP_PARTS,
  },
  eyfsActionPlan: {
    slug: "eyfs-action-plan",
    joName: "EYFS action plan for improving one area of an Early Years setting's provision",
    docLabel: "action plan",
    joStarters: [
      "Add an action on working with parents",
      "Make the success criteria easier to measure",
      "Shorten the plan to one term",
      "Add more training for staff",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "EYFS action plan",
    ownPassage: false,
    startDesign: () => ({ ...unitStartDesign(), themeId: "classic" }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is an improvement action plan for an Early Years setting in England, in four phases. Each phase is a table: Action, Lead, Resources, Monitoring, RAG, Evidence of impact. Leads are roles (EYFS lead, Reception teacher, SENCO), never names. RAG and Evidence of impact are for the school to fill in: leave them blank.\n" +
      "- Quote Early Learning Goals only as the EYFS statutory framework (September 2025) words them. Never invent figures, baselines or costs.",
    arrange: (raw) => arrangeEyfsActionPlan(raw),
    subtitleSuffix: (info) => (info.timescale ? eyfsTimescale(info.timescale) : ""),
    landscape: true,
    parts: EYFS_ACTION_PARTS,
  },
  riskAssessment: {
    slug: "risk-assessment",
    joName: "risk assessment for a school trip or activity, scored on a 5 by 5 matrix",
    docLabel: "risk assessment",
    joStarters: [
      "Add a hazard for a pupil with a severe allergy",
      "Add hazards for wet weather",
      "Make the control measures more specific",
      "Add a hazard for the journey back",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Risk assessment",
    ownPassage: false,
    // Smaller type: six columns of controls are a lot of words on one page.
    startDesign: () => ({ ...unitStartDesign(), themeId: "classic", fontScale: "s" }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a school risk assessment. The hazards table has the columns Hazard, Who might be harmed and how, Risk, Control measures, Risk after controls, Further action needed. Risk is likelihood times severity, each a whole number 1 to 5, written as the score, its band and the sum: \"12 Medium (4 × 3)\". Bands: Low for 1 to 6, Medium for 8 to 12, High for 15 to 25. Risk after controls is the same, after the controls. If you change a likelihood or severity, recalculate the score and band exactly.\n" +
      "- Never name a person: use roles (trip leader, first aider, EVC). The details, emergency information and sign-off tables are the school's to fill in.",
    arrange: (raw, info) => arrangeRisk(raw, info.risk),
    landscape: true,
    parts: RISK_PARTS,
  },
  sensory: {
    slug: "sensory-activities",
    joName: "set of five multisensory activities for teaching one topic, with SEND adaptations",
    docLabel: "activities",
    joStarters: [
      "Add more movement to the activities",
      "Make one activity quieter for a pupil who finds noise hard",
      "Swap the taste activity for something else",
      "Add an activity for pupils who use a wheelchair",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: false,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: null,
    ownPassage: false,
    startDesign: () => ({ nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list", "twocol"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- These are five multisensory activities for teachers. Each activity section has a learning objective, a Senses line (from Sight, Hearing, Touch, Movement, Smell, Taste), what it is for, what you need, the steps, words to use, and a twocol box: sensory-sensitive adaptations beside sensory-seeking ones.\n" +
      "- Keep every activity teaching the topic, safe and practical. Use taste or smell only where safe, and never suggest food without an allergy check.",
    arrange: (raw) => arrangeSensory(raw),
    parts: SENSORY_PARTS,
  },
  newsletter: {
    slug: "newsletter-writer",
    joName: "school newsletter for parents and carers",
    docLabel: "newsletter",
    joStarters: [
      "Make it shorter and easier to skim",
      "Make the tone warmer",
      "Add a reminder about the uniform",
      "Make the headings more inviting",
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
    startDesign: () => ({ nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a school newsletter for parents and carers. Pupils are written as [PUPIL 1], [PUPIL 2] and so on: always keep those placeholders exactly, never write a pupil's name, and never name any other child or adult.\n" +
      "- The celebrations table and the dates for the diary are the school's: do not add to them or change them. Never invent facts, dates or events.",
    arrange: (raw, info) => arrangeNewsletter(raw, info.newsletter),
    subtitleSuffix: (info) => [info.newsletter?.schoolName?.trim(), info.newsletter?.date ? diaryDate(info.newsletter.date, true) : ""].filter(Boolean).join(" · "),
    parts: NEWSLETTER_PARTS,
  },
  ectReport: {
    slug: "ect-report-writer",
    joName: "induction progress review or formal assessment for an early career teacher, against the Teachers' Standards",
    docLabel: "report",
    joStarters: [
      "Make the targets more specific",
      "Add a next step for adaptive teaching",
      "Make the summary shorter",
      "Check every target has support by role",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "ECT induction",
    ownPassage: false,
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is an early career teacher's induction record in England, against the Teachers' Standards (DfE, 2011). The ECT is written as [ECT]: always keep [ECT] exactly, never write a name, and name colleagues by role only (mentor, induction tutor, subject lead).\n" +
      "- The outcome, the ECT's comments and the sign-off are the school's: never fill them in or change them, and never state or imply whether the ECT is on track or their performance satisfactory. Use only the evidence in the document; write [add evidence] rather than inventing any.",
    arrange: (raw, info) => arrangeEct(raw, info.ect),
    subtitleSuffix: (info) => info.ect?.subject?.trim() ?? "",
    parts: ECT_PARTS,
  },
  appraisal: {
    slug: "performance-management",
    joName: "set of appraisal (performance management) objectives for one member of staff",
    docLabel: "objectives",
    joStarters: [
      "Make the success criteria more measurable",
      "Add an objective on pupil wellbeing",
      "Make the objectives more ambitious",
      "Link each objective to a Teachers' Standard",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Appraisal",
    ownPassage: false,
    // Smaller type, as Risk Assessment: six columns are a lot of words to a page.
    startDesign: () => ({ ...unitStartDesign(), themeId: "classic", fontScale: "s" }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- These are appraisal objectives for one member of staff, referred to by role only: never write a name. The objectives table has the columns Objective, Success criteria, Support and CPD, Evidence, Mid-year review, End-of-year review. Keep objectives SMART and numbered.\n" +
      "- The review columns, the details and the sign-off are the school's: leave them blank. Evidence never includes lesson observation grades: lessons are not graded.",
    arrange: (raw, info) => arrangeAppraisal(raw, info.appraisal),
    landscape: true,
    parts: APPRAISAL_PARTS,
  },
  lessonObservation: {
    slug: "lesson-observation-report",
    joName: "developmental lesson observation report",
    docLabel: "report",
    joStarters: [
      "Make the recommendations more specific",
      "Make the tone warmer",
      "Add an action plan target on questioning",
      "Make it shorter",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Lesson observation",
    ownPassage: false,
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a developmental lesson observation report. The teacher is written as [TEACHER] and the observer as [OBSERVER]: always keep those placeholders exactly, never write a name, and name anyone else by role only.\n" +
      "- Never grade, rate or give an overall judgement on the lesson or the teacher: lessons are not graded. The details, the teacher's response and the sign-off are for people to fill in: leave them as they are.",
    arrange: (raw, info) => arrangeLessonObservation(raw, info.observation),
    parts: LESSON_OBS_PARTS,
  },
  learningWalk: {
    slug: "learning-walk-report",
    joName: "learning walk report across several classes",
    docLabel: "report",
    joStarters: [
      "Make the next steps more specific",
      "Make the summary shorter",
      "Make the tone more encouraging",
      "Add a recommendation on feedback",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Learning walk",
    ownPassage: false,
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a developmental learning walk report across several classes. Never name a teacher or anyone else: write about classes and year groups, and refer to leaders by role. Never grade a lesson or a teacher.\n" +
      "- Next steps are one table: When (Within two weeks, By the end of this half term, By the end of the term), Action, Led by (a role), Done (blank, for the school). The details, the response box and the sign-off are for people to fill in.",
    arrange: (raw, info) => arrangeLearningWalk(raw, info.learningWalk),
    subtitleSuffix: (info) => info.learningWalk?.classesVisited?.trim() ?? "",
    parts: LEARNING_WALK_PARTS,
  },
  sip: {
    slug: "school-improvement-plan",
    joName: "school improvement plan, with an action table per priority",
    docLabel: "plan",
    joStarters: [
      "Make the success criteria more measurable",
      "Add an action on governor monitoring",
      "Make the summary shorter",
      "Spread the monitoring across the year",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "School improvement plan",
    ownPassage: false,
    // Smaller type: seven columns to a priority.
    startDesign: () => ({ ...unitStartDesign(), themeId: "classic", fontScale: "s" }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a school improvement plan in England. Each priority is a section with one table: Action, Lead, Timescale, Monitoring, Success criteria, Cost, RAG. Leads are roles, never names. Cost and RAG, the details, the baseline and the monitoring Done column are the school's: leave them blank.\n" +
      "- Use Ofsted's renewed framework (evaluation areas and report cards); never the old judgements or grades, nor \"intent, implementation and impact\". Never invent data, results or costs: write [school to add].",
    arrange: (raw, info) => arrangeSip(raw, info.sip),
    landscape: true,
    parts: SIP_PARTS,
  },
  inspection: {
    slug: "inspection-prep",
    joName: "inspection preparation guide for senior leaders, area by area",
    docLabel: "guide",
    joStarters: [
      "Make the questions more challenging",
      "Add an action on governors",
      "Focus more on disadvantaged pupils",
      "Make it shorter",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Inspection preparation",
    ownPassage: false,
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is an inspection preparation guide, one section per evaluation area: self-evaluation questions, an action table (Action, Lead, By when, Done), and optional evidence and success criteria. Leads are roles, never names; the Done column, the details and the \"Where are we now?\" tick rows are the school's: leave them as they are.\n" +
      "- Never grade the school or predict a grade. For Ofsted use the renewed framework's areas and report card grades only, never the old judgements or \"outstanding\", \"good\", \"requires improvement\" or \"inadequate\". Never invent recent policy changes.",
    arrange: (raw, info) => arrangeInspection(raw, info.inspection),
    subtitleSuffix: (info) => info.inspection?.focus?.trim() ?? "",
    parts: INSPECTION_PARTS,
  },
  policy: {
    slug: "policy-generator",
    joName: "school policy with numbered sections",
    docLabel: "policy",
    joStarters: [
      "Make the language plainer for parents",
      "Add a section on online safety",
      "Make the roles more specific",
      "Shorten each section",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "School policy",
    ownPassage: false,
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a school policy. Sections are numbered (\"2. Our approach\") and each clause starts with its number (\"2.1\"): keep the numbering in order when you add, move or remove sections or clauses. People are named by role only, never by name.\n" +
      "- The details box (status, review, approval, dates, version) and the version history are filled in by the school or from DfE guidance: never change them. Keep the check note on the references, and never invent laws or guidance.",
    arrange: (raw, info) => arrangePolicy(raw, info.policy),
    parts: POLICY_PARTS,
  },
  meeting: {
    slug: "meeting-planner",
    joName: "meeting plan: a timed agenda, facilitator notes, minutes boxes and an action log",
    docLabel: "plan",
    joStarters: [
      "Give more time to the main discussion",
      "Make the facilitator notes shorter",
      "Add a decision item at the end",
      "Make it a 30 minute meeting",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Meeting",
    ownPassage: false,
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    // A meeting can be about one child (a looked-after child review): the
    // name stays in doc.pupil and the text holds [PUPIL].
    aboutPupil: true,
    joRules:
      "- This is a meeting plan for a UK school. The agenda table's times must still add up to the meeting's length when you change items. People are named by role only; if the pupil is written as [PUPIL], keep [PUPIL] exactly and never give a name.\n" +
      "- The details, the minutes boxes and the action log are for the meeting to fill in: leave them blank, and never assign actions or invent dates.",
    arrange: (raw, info) => arrangeMeeting(raw, info.meeting),
    parts: MEETING_PARTS,
  },
  assembly: {
    slug: "assembly-planner",
    joName: "assembly script: a running order, then each part with what to say and delivery tips",
    docLabel: "script",
    joStarters: [
      "Make the story more vivid",
      "Make it suit younger children",
      "Add a song to the reflection",
      "Make it a 15 minute assembly",
    ],
    defaultKinds: [],
    allowedKinds: [],
    questionDomain: false,
    vocabularyQuote: false,
    table: true,
    joPassage: false,
    pictures: false,
    lineNumbers: false,
    subtitleLabel: "Assembly",
    ownPassage: false,
    startDesign: () => ({ themeId: "classic", nameDate: false, objective: false, intro: false, answers: false, pictures: false }),
    extraBlocks: ["list"],
    answersTitle: "Answers",
    answersNote: ANSWERS_NOTE,
    restartNumbers: false,
    partNumbering: false,
    joRules:
      "- This is a school assembly script. The running order's minutes must still add up to the assembly's length when you change parts, and each part's minutes line must match. Never name a pupil or member of staff.\n" +
      "- The closing part follows the school's choice in the details (a reflection, collective worship, or a faith school's prayer): keep its heading, and never add a prayer to a reflection. The details are for the school to fill in.",
    arrange: (raw, info) => arrangeAssembly(raw, info.assembly),
    subtitleSuffix: (info) => info.assembly?.stage?.trim() ?? "",
    parts: ASSEMBLY_SHEET_PARTS,
  },
};

export function sheetToolProfile(tool: SheetTool): SheetToolProfile {
  return SHEET_TOOL_PROFILES[tool];
}

/** The sheet tool a tool_runs slug belongs to, or null for any other tool. */
export function sheetToolForSlug(slug: string): SheetTool | null {
  return SHEET_TOOLS.find((t) => SHEET_TOOL_PROFILES[t].slug === slug) ?? null;
}
