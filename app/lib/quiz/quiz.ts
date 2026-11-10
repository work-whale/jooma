// A quiz: an ordered list of questions, each multiple choice with one right
// answer, multiple choice with several, or true or false.
//
// Stored as JSON in tool_runs.output, with `kind` first so a reader can tell it
// from markdown and from the quizzes saved before this existed, which are a bare
// array of { question, options[4], correctIndex }. parseQuiz reads both; a
// legacy quiz is converted when it is opened and saved in the new shape on its
// first edit, never rewritten just by being looked at.
//
// Pure: used by the route, the form, the present mode, the printable sheet,
// the platform exports and the Library.

import type { SheetBlock, SheetDesign, SheetDoc } from "@/app/lib/sheets/types";
import { SHEET_KIND, SHEET_VERSION } from "@/app/lib/sheets/types";
import { defaultDesign } from "@/app/lib/sheets/normalize";
import { DEFAULT_SHEET_THEME } from "@/app/lib/sheets/themes";
import { defaultFamilyForYear } from "@/app/lib/slideshowThemes";

export const QUIZ_KIND = "jooma-quiz";
export const QUIZ_VERSION = 1;

export type QuizQuestionType = "single" | "multiple" | "truefalse";
export const QUIZ_QUESTION_TYPES: QuizQuestionType[] = ["single", "multiple", "truefalse"];

/** What the teacher asks for on the form. "mixed" is all three. */
export type QuizAnswerType = QuizQuestionType | "mixed";
export const QUIZ_ANSWER_TYPES: QuizAnswerType[] = ["single", "multiple", "truefalse", "mixed"];

export interface QuizItem {
  type: QuizQuestionType;
  question: string;
  options: string[];
  /** Indices into options. One for single and true or false, two or more for
   *  multiple. */
  answers: number[];
  /** Why the answer is right, shown on reveal and on the answer key. */
  explanation: string;
}

export interface QuizDoc {
  kind: typeof QUIZ_KIND;
  version: number;
  title: string;
  /** "Year 8 · Science", built from the form. */
  subtitle: string;
  /** Seconds per question for present mode and the platform exports; null
   *  for none. */
  timeLimit: number | null;
  questions: QuizItem[];
  /** The printable version's look, chosen in its Design panel. */
  design?: Partial<SheetDesign>;
}

export const TRUE_FALSE = ["True", "False"];
export const MAX_OPTIONS = 5;
export const MAX_QUESTIONS = 40;
export const TIME_LIMITS = { min: 5, max: 300 };

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function isAnswerType(v: unknown): v is QuizAnswerType {
  return typeof v === "string" && (QUIZ_ANSWER_TYPES as string[]).includes(v);
}

/** The question types a request may produce. */
export function typesFor(answerType: unknown): QuizQuestionType[] {
  if (answerType === "mixed") return [...QUIZ_QUESTION_TYPES];
  return isAnswerType(answerType) ? [answerType as QuizQuestionType] : ["single"];
}

export function timeLimitOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(TIME_LIMITS.max, Math.max(TIME_LIMITS.min, Math.round(n)));
}

/**
 * One question from the model, from Jo or from a stored quiz, or null when it
 * cannot be made sound. Nothing is trusted: answers must point at real
 * options, a multiple answer question needs two right answers (one becomes a
 * single answer question), true or false always has exactly those options.
 */
export function normalizeQuizItem(raw: unknown): QuizItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const question = str(r.question);
  if (!question) return null;
  const explanation = str(r.explanation);
  const rawAnswers = Array.isArray(r.answers) ? r.answers : typeof r.correctIndex === "number" ? [r.correctIndex] : [];

  const looksTrueFalse =
    r.type === "truefalse" ||
    (r.type === undefined && Array.isArray(r.options) && r.options.length === 2 && r.options.map(str).join("|").toLowerCase() === "true|false");
  if (looksTrueFalse) {
    const a = rawAnswers.find((n) => n === 0 || n === 1);
    return a === undefined ? null : { type: "truefalse", question, options: [...TRUE_FALSE], answers: [a as number], explanation };
  }

  const options = (Array.isArray(r.options) ? r.options.map(str) : []).filter(Boolean).slice(0, MAX_OPTIONS);
  if (options.length < 2) return null;
  // In the order given: a one answer question with two listed keeps the first.
  const given = [...new Set(rawAnswers.filter((n): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < options.length))];
  if (given.length === 0) return null;
  if (r.type === "multiple" && given.length >= 2 && options.length >= 3) return { type: "multiple", question, options, answers: [...given].sort((x, y) => x - y), explanation };
  return { type: "single", question, options, answers: [given[0]], explanation };
}

export function newQuizItem(type: QuizQuestionType = "single"): QuizItem {
  if (type === "truefalse") return { type, question: "", options: [...TRUE_FALSE], answers: [0], explanation: "" };
  if (type === "multiple") return { type, question: "", options: ["", "", "", ""], answers: [0, 1], explanation: "" };
  return { type, question: "", options: ["", "", "", ""], answers: [0], explanation: "" };
}

/** A question switched to another type, keeping what it can. */
export function retypeQuizItem(q: QuizItem, type: QuizQuestionType): QuizItem {
  if (type === q.type) return q;
  if (type === "truefalse") return { ...q, type, options: [...TRUE_FALSE], answers: [0] };
  const options = q.type === "truefalse" ? ["", "", "", ""] : q.options;
  if (type === "multiple") {
    const answers = q.answers.length >= 2 ? q.answers : [q.answers[0] ?? 0, (q.answers[0] ?? 0) === 0 ? 1 : 0].sort((a, b) => a - b);
    return { ...q, type, options: options.length >= 3 ? options : [...options, ""], answers };
  }
  return { ...q, type, options, answers: [q.answers[0] ?? 0] };
}

export function makeQuiz(fields: { title: string; subtitle: string; timeLimit: number | null; questions: QuizItem[]; design?: Partial<SheetDesign> }): QuizDoc {
  return { kind: QUIZ_KIND, version: QUIZ_VERSION, ...fields };
}

export function isQuizOutput(output: string | null | undefined): boolean {
  return typeof output === "string" && output.trimStart().startsWith(`{"kind":"${QUIZ_KIND}"`);
}

export function serializeQuiz(doc: QuizDoc): string {
  return JSON.stringify(doc);
}

/** "Year 8 · Science", "Mixed years · Science", from a form's input. */
export function quizSubtitle(input: Record<string, unknown> | undefined): string {
  const year = typeof input?.yearGroup === "string" ? input.yearGroup : "";
  const subject = typeof input?.subject === "string" ? input.subject.trim() : "";
  return [input?.mixed || year === "Mixed" ? "Mixed years" : year, subject].filter(Boolean).join(" · ");
}

/**
 * A stored quiz in the current shape, or null when the output is not a quiz.
 * A legacy array is converted, using the run's input for the title, subtitle
 * and time limit it never stored.
 */
export function parseQuiz(output: string | null | undefined, input?: Record<string, unknown>): QuizDoc | null {
  if (typeof output !== "string" || !output.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(output);
  } catch {
    return null;
  }
  if (Array.isArray(raw)) {
    return makeQuiz({
      title: str(input?.topic) || str(input?.subject) || "Quiz",
      subtitle: quizSubtitle(input),
      timeLimit: timeLimitOf(input?.timeLimit),
      questions: raw.map(normalizeQuizItem).filter((q): q is QuizItem => !!q),
    });
  }
  const r = raw as Raw;
  if (!r || r.kind !== QUIZ_KIND || !Array.isArray(r.questions)) return null;
  return makeQuiz({
    title: str(r.title) || "Quiz",
    subtitle: str(r.subtitle),
    timeLimit: timeLimitOf(r.timeLimit),
    questions: r.questions.map(normalizeQuizItem).filter((q): q is QuizItem => !!q),
    ...(r.design && typeof r.design === "object" ? { design: r.design as Partial<SheetDesign> } : {}),
  });
}

/** True for anything parseQuiz would read: the current shape or a legacy
 *  array from the Quiz tool. */
export function isQuizSlugOutput(slug: string, output: string | null | undefined): boolean {
  return slug === "quiz-generator" && parseQuiz(output) !== null;
}

/**
 * The `step` a request is recorded under. Only a whole new quiz counts as a
 * generation: adding or refining a question is part of editing that quiz.
 * is_counted_generation (supabase/migrations/20260810000100_cost_ceiling.sql)
 * ignores any row with a step, so this needs no change to the database.
 */
export function quizUsageStep(action: unknown): string | null {
  if (action === "add") return "Quiz add";
  if (action === "refine") return "Quiz refine";
  return null;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** The right answer in words: "b) Mars", "a) True", "a) Iron, c) Nickel". */
export function answerLabel(q: QuizItem): string {
  return q.answers.map((i) => `${LETTERS[i]}) ${q.options[i] ?? ""}`).join(", ");
}

/**
 * The quiz as a printable sheet: every question a multiple choice block
 * (true or false as two options), "Tick N" on the multiple answer ones, and
 * the answer key and explanations on the answers page. Read only: it is
 * rebuilt from the quiz each time, so the quiz stays the one thing edited.
 */
export function quizToSheet(doc: QuizDoc): SheetDoc {
  const year = doc.subtitle.split(" · ")[0] ?? "";
  const blocks: SheetBlock[] = doc.questions.map((q, i) => ({
    id: `qz${i}`,
    type: "mcq",
    // "Tick 2" only when the question does not already say how many.
    prompt: q.type === "multiple" && !/\b(choose|tick|select|pick)\b/i.test(q.question) ? `${q.question} (Tick ${q.answers.length}.)` : q.question,
    options: q.options,
    answers: q.answers,
    marks: q.type === "multiple" ? q.answers.length : 1,
    domain: "",
  }));
  const explained = doc.questions.map((q, i) => (q.explanation ? `${i + 1}. ${q.explanation}` : "")).filter(Boolean);
  return {
    kind: SHEET_KIND,
    version: SHEET_VERSION,
    tool: "worksheet",
    title: doc.title || "Quiz",
    subtitle: doc.subtitle,
    objective: "",
    intro: null,
    sections: blocks.length ? [{ id: "qz", title: "Questions", emoji: "❓", instructions: "Choose the right answer for each question.", blocks }] : [],
    teacherNotes: explained.length ? [{ title: "Explanations", points: explained }] : [],
    design: { ...defaultDesign("worksheet", DEFAULT_SHEET_THEME[defaultFamilyForYear(year)]), objective: false, intro: false, ...doc.design },
  };
}
