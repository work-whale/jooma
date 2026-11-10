// The styles an Exam Paper can be written in.
//
// A style is how a paper is set out and pitched, never its content: the
// questions are always new, and nothing here is copied from a board's papers.
// The board names are used only to say whose style a practice paper follows,
// with a line on the cover that it is not an official paper and not endorsed
// by the board.
//
// GCSE: AQA, Pearson Edexcel, OCR and WJEC Eduqas, the four boards English
// schools use, with Foundation and Higher tier for the subjects tiered at
// GCSE. KS2: the Year 6 national tests. And a generic school test for every
// other year and purpose.

import type { ExamMeta, QuestionType } from "./types";

export type ExamPhase = "gcse" | "ks2" | "school";

export interface ExamStyle {
  id: string;
  /** What the teacher picks: "GCSE, AQA style". */
  label: string;
  phase: ExamPhase;
  /** The board, for the cover's disclaimer. Null for KS2 and school tests. */
  board: string | null;
  /** Shown on the cover: "GCSE (9 to 1)", "Key Stage 2". */
  level: string;
  /** Year groups it is for; empty means any. */
  years: string[];
  /** Minutes allowed when the teacher does not say. */
  minutes: number;
  /** The question kinds its papers use. */
  kinds: QuestionType[];
  /** A reading paper: the model writes the text the questions are on. */
  passage: boolean;
  /** How its papers are put together, for the prompt, in our own words. */
  guide: string;
  /** The cover's instructions to candidates, in our own words. */
  instructions: string[];
  /** Fixed subject, for the KS2 papers. */
  subject?: string;
}

const GCSE_YEARS = ["Year 9", "Year 10", "Year 11"];
const GCSE_KINDS: QuestionType[] = ["mcq", "short", "long", "calc", "fillblanks", "matching", "label"];
const GCSE_INSTRUCTIONS = [
  "Use black ink or black ball-point pen.",
  "Answer all questions in the spaces provided.",
  "Show your working where a question asks you to.",
  "The marks for each question are shown in brackets.",
];

function gcse(id: string, board: string, guide: string): ExamStyle {
  return {
    id,
    label: `GCSE, ${board} style`,
    phase: "gcse",
    board,
    level: "GCSE (9 to 1)",
    years: GCSE_YEARS,
    minutes: 75,
    kinds: GCSE_KINDS,
    passage: false,
    guide,
    instructions: GCSE_INSTRUCTIONS,
  };
}

export const EXAM_STYLES: ExamStyle[] = [
  gcse(
    "gcse-aqa",
    "AQA",
    "Questions are built from short parts that climb in demand: recall (state, give, name), then explanation (describe, explain), then application and extended answers (suggest, compare, evaluate) worth 4 to 6 marks, with 6 mark answers marked by levels. Practical and data based contexts are common.",
  ),
  gcse(
    "gcse-edexcel",
    "Pearson Edexcel",
    "Each question opens with a short context and runs through lettered parts, from 1 mark recall to extended answers; multiple choice parts tell candidates to put a cross in the box. Command words are used precisely (state, describe, explain, calculate, evaluate) and every question ends with its total.",
  ),
  gcse(
    "gcse-ocr",
    "OCR",
    "Papers mix short structured parts with longer answers that ask candidates to apply knowledge to an unfamiliar context; extended responses are marked by levels and often marked with an asterisk. Calculations ask for working and units.",
  ),
  gcse(
    "gcse-eduqas",
    "WJEC Eduqas",
    "Structured questions built around a context or a source, rising from short recall to extended explanation and evaluation, with clear mark allocations for each part and some questions assessing quality of extended response.",
  ),
  {
    id: "ks2-reading",
    label: "KS2 SATs style: reading",
    phase: "ks2",
    board: null,
    level: "Key Stage 2",
    years: ["Year 6"],
    minutes: 60,
    kinds: ["mcq", "short", "long", "truefalse", "matching", "order"],
    passage: true,
    subject: "English reading",
    guide: "A reading booklet of one or two texts (fiction, non-fiction or poetry), then questions on it covering retrieval, vocabulary in context, inference, summarising, prediction and the author's choices. Most questions are worth 1 mark, some 2, a few 3; answers are written in the booklet.",
    instructions: ["Read the text, then answer the questions.", "Write your answers in the spaces provided.", "You may look back at the text as often as you like."],
  },
  {
    id: "ks2-maths-arithmetic",
    label: "KS2 SATs style: maths arithmetic",
    phase: "ks2",
    board: null,
    level: "Key Stage 2",
    years: ["Year 6"],
    minutes: 30,
    kinds: ["calc"],
    passage: false,
    subject: "Mathematics",
    guide: "Context free calculations only, getting harder through the paper: the four operations with whole numbers and decimals, long multiplication and division, fractions, percentages and order of operations. 1 mark each, 2 marks for long multiplication and long division, which need working.",
    instructions: ["Answer each question in the box.", "Show your working for the long multiplication and long division questions.", "You may not use a calculator."],
  },
  {
    id: "ks2-maths-reasoning",
    label: "KS2 SATs style: maths reasoning",
    phase: "ks2",
    board: null,
    level: "Key Stage 2",
    years: ["Year 6"],
    minutes: 40,
    kinds: ["calc", "short", "mcq", "matching", "order", "fillblanks"],
    passage: false,
    subject: "Mathematics",
    guide: "Problem solving and reasoning in everyday contexts across number, measurement, geometry and statistics, with some questions asking pupils to explain or show how they know. Mostly 1 or 2 marks, a few 3.",
    instructions: ["Answer the questions in the spaces provided.", "Show your working where you see a box for it.", "You may not use a calculator."],
  },
  {
    id: "ks2-spag",
    label: "KS2 SATs style: grammar, punctuation and spelling",
    phase: "ks2",
    board: null,
    level: "Key Stage 2",
    years: ["Year 6"],
    minutes: 45,
    kinds: ["mcq", "short", "fillblanks", "matching", "truefalse"],
    passage: false,
    subject: "English grammar, punctuation and spelling",
    guide: "Short questions on grammatical terms, word classes, sentence types, tense, punctuation and vocabulary, each worth 1 mark, often asking pupils to tick, circle, underline or write a word.",
    instructions: ["Answer every question.", "Write your answers in the spaces provided.", "Check your spelling and punctuation."],
  },
  {
    id: "school-test",
    label: "School test (any year)",
    phase: "school",
    board: null,
    level: "",
    years: [],
    minutes: 45,
    kinds: ["mcq", "short", "long", "calc", "truefalse", "fillblanks", "matching", "label", "order"],
    passage: false,
    guide: "An end of unit or end of term test: a mix of quick recall questions and longer questions that ask pupils to explain and apply what they have learned, getting harder through the paper.",
    instructions: ["Answer all the questions.", "Write your answers in the spaces provided.", "The marks for each question are shown next to it."],
  },
];

export const DEFAULT_EXAM_STYLE = "school-test";

export function examStyle(id: unknown): ExamStyle {
  return EXAM_STYLES.find((s) => s.id === id) ?? EXAM_STYLES.find((s) => s.id === DEFAULT_EXAM_STYLE)!;
}

export function isExamStyle(id: unknown): boolean {
  return EXAM_STYLES.some((s) => s.id === id);
}

/** The subjects tiered at GCSE: Foundation or Higher. */
const TIERED = /\b(math|maths|mathematics|statistics|science|biology|chemistry|physics|french|spanish|german|italian|mandarin|chinese|latin)\b/i;

export function isTieredSubject(subject: string): boolean {
  return TIERED.test(subject);
}

/** Whether this style and subject offer a tier. */
export function offersTier(style: ExamStyle, subject: string): boolean {
  return style.phase === "gcse" && isTieredSubject(subject);
}

export function tierOf(style: ExamStyle, subject: string, tier: unknown): ExamMeta["tier"] {
  if (!offersTier(style, subject)) return "";
  return tier === "foundation" ? "foundation" : "higher";
}

/**
 * The style an old run's free text "exam type" is closest to, for reopening
 * a paper saved before styles: a board named in it, or SATs, or a school test.
 */
export function styleFromExamType(examType: unknown): string {
  const t = typeof examType === "string" ? examType.toLowerCase() : "";
  if (/\bgcse\b|\bigcse\b/.test(t)) {
    if (t.includes("edexcel") || t.includes("pearson")) return "gcse-edexcel";
    if (t.includes("ocr")) return "gcse-ocr";
    if (t.includes("eduqas") || t.includes("wjec")) return "gcse-eduqas";
    if (t.includes("aqa")) return "gcse-aqa";
  }
  if (/\bsats?\b|\bks2\b|key stage 2/.test(t)) return t.includes("read") ? "ks2-reading" : t.includes("spag") || t.includes("grammar") ? "ks2-spag" : "ks2-maths-reasoning";
  return DEFAULT_EXAM_STYLE;
}

/** "1 hour 15 minutes", "45 minutes". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} hour${h === 1 ? "" : "s"}` : "";
  const mins = m ? `${m} minute${m === 1 ? "" : "s"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

/** The cover's line on whose style this is, and that it is not official. */
export function disclaimerFor(style: ExamStyle): string {
  if (style.board) return `Practice paper written in the style of ${style.board} ${style.level}. It is not an official ${style.board} paper and is not endorsed by ${style.board}.`;
  if (style.phase === "ks2") return "Practice paper written in the style of the Key Stage 2 national tests. It is not an official test paper.";
  return "";
}

// ── Arranging the model's paper ───────────────────────────────────────────

type Raw = Record<string, unknown>;
const QUESTION_TYPES = new Set(["mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "picture", "label", "sort", "wordsearch", "crossword"]);
const isQuestionRaw = (b: unknown) => !!b && typeof b === "object" && QUESTION_TYPES.has(String((b as Raw).type));

/**
 * A paper as one section per question, whatever shape the model sent.
 *
 * Asked for "Question 1", "Question 2"... with each question's context in its
 * instructions, the model sometimes puts the whole paper in one section,
 * context as text blocks between the parts. Here a text block that comes
 * after a question has had parts starts a new question, and becomes that
 * question's context; questions are then numbered in order. A section with no
 * questions (a reading paper's text) is kept as it is. Safe on a partial
 * stream.
 */
export function arrangeExam(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Raw;
  if (!Array.isArray(r.sections)) return raw;
  const out: Raw[] = [];
  for (const sec of r.sections) {
    if (!sec || typeof sec !== "object") continue;
    const s = sec as Raw;
    const blocks = Array.isArray(s.blocks) ? s.blocks : [];
    if (!blocks.some(isQuestionRaw)) {
      out.push(s);
      continue;
    }
    let current: Raw = { ...s, blocks: [] };
    let hasParts = false;
    for (const b of blocks) {
      const isText = !!b && typeof b === "object" && (b as Raw).type === "text";
      if (isText && hasParts) {
        out.push(current);
        current = { title: "", emoji: "", instructions: "", blocks: [] };
        hasParts = false;
      }
      if (isText && !hasParts) {
        const t = String((b as Raw).text ?? "").trim();
        current.instructions = [String(current.instructions ?? "").trim(), t].filter(Boolean).join(" ");
        continue;
      }
      (current.blocks as unknown[]).push(b);
      if (isQuestionRaw(b)) hasParts = true;
    }
    out.push(current);
  }
  let n = 0;
  const sections = out.map((s) => {
    const blocks = Array.isArray(s.blocks) ? s.blocks : [];
    if (!blocks.some(isQuestionRaw)) return s;
    n++;
    return { ...s, title: `Question ${n}`, emoji: "" };
  });
  return { ...r, sections };
}
