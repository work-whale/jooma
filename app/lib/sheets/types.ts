// A designed worksheet or comprehension: the structure the Worksheet and
// Comprehension tools generate, edit and export.
//
// These tools used to produce markdown, which could only ever be shown as a
// plain document. A sheet is a structure instead (sections of typed blocks:
// a passage, a word bank, a multiple choice question, answer lines), so it can
// be drawn as a designed A4 page, edited a block at a time and exported with
// its look intact. It is stored as JSON in tool_runs.output, the same way decks
// and quizzes already store theirs. Older runs stay markdown and open as they
// always did; isSheetOutput() tells the two apart.

export const SHEET_KIND = "jooma-sheet";
export const SHEET_VERSION = 1;

export type SheetTool = "worksheet" | "comprehension";

export interface SheetDesign {
  /** A sheet theme id (app/lib/sheets/themes.ts). */
  themeId: string;
  fontScale: "s" | "m" | "l" | "xl";
  /** Name and date lines at the top of the first page. */
  nameDate: boolean;
  /** Answers and teacher notes on their own page at the end. */
  answers: boolean;
  paper: "a4" | "letter";
  /** Line numbers down the side of a reading passage. */
  lineNumbers: boolean;
  /** The learning objective under the title. Missing means on. */
  objective?: boolean;
  /** The hook box at the top, e.g. "Did you know?". Missing means on. */
  intro?: boolean;
  /** The note on the answers page saying who this version is pitched at.
   *  Missing means on. */
  diffNote?: boolean;
}

export interface SheetDoc {
  kind: typeof SHEET_KIND;
  version: number;
  tool: SheetTool;
  title: string;
  /** "Year 5 · Maths", built from the form, not written by the model. */
  subtitle: string;
  /** Pupil-facing: "I am learning to...". Empty when there is none. */
  objective: string;
  /** One hook at the top, e.g. "Did you know?". Null when there is none. */
  intro: SheetCallout | null;
  sections: SheetSection[];
  /** Teacher-facing notes, printed with the answers: misconceptions,
   *  differentiation. */
  teacherNotes: SheetNote[];
  design: SheetDesign;
}

export interface SheetSection {
  id: string;
  title: string;
  emoji: string;
  instructions: string;
  blocks: SheetBlock[];
}

export interface SheetNote {
  title: string;
  points: string[];
}

export interface SheetCallout {
  /** fact (Did you know?), remember, tip, challenge. */
  variant: "fact" | "remember" | "tip" | "challenge";
  label: string;
  text: string;
  emoji: string;
}

// ── Blocks ────────────────────────────────────────────────────────────────

interface BlockBase {
  id: string;
}

export interface TextBlock extends BlockBase { type: "text"; text: string }
export interface CalloutBlock extends BlockBase, SheetCallout { type: "callout" }
export interface PassageBlock extends BlockBase { type: "passage"; title: string; paragraphs: string[] }
export interface WordBankBlock extends BlockBase { type: "wordbank"; title: string; words: string[] }
export interface TableBlock extends BlockBase { type: "table"; headers: string[]; rows: string[][] }

interface QuestionBase extends BlockBase {
  prompt: string;
  marks: number;
  /** A comprehension question's reading domain, e.g. "2b". Empty otherwise. */
  domain: string;
}

/** One answer, or several when `answers` has more than one index. */
export interface ChoiceQuestion extends QuestionBase { type: "mcq"; options: string[]; answers: number[] }
export interface TrueFalseQuestion extends QuestionBase { type: "truefalse"; statements: { text: string; answer: boolean }[] }
/** `right` is in shuffled order; pairs[i] is the index in `right` that
 *  matches left[i]. */
export interface MatchingQuestion extends QuestionBase { type: "matching"; left: string[]; right: string[]; pairs: number[] }
/** Sentences with ___ for each gap; answers in gap order across sentences. */
export interface FillBlanksQuestion extends QuestionBase { type: "fillblanks"; sentences: string[]; answers: string[]; wordBank: string[] }
/** `quote` is a word or phrase from the passage, for vocabulary in context. */
export interface ShortQuestion extends QuestionBase { type: "short"; lines: number; answer: string; quote: string }
export interface LongQuestion extends QuestionBase { type: "long"; lines: number; answer: string; criteria: string[] }
export interface CalcQuestion extends QuestionBase { type: "calc"; working: boolean; answer: string }
/** `items` in shuffled order; `order` lists item indices in the right order. */
export interface OrderQuestion extends QuestionBase { type: "order"; items: string[]; order: number[] }
export interface WordOrderQuestion extends QuestionBase { type: "wordorder"; words: string[]; answer: string }
export interface PictureQuestion extends QuestionBase { type: "picture"; options: { emoji: string; label: string }[]; answer: number }
export interface LabelQuestion extends QuestionBase { type: "label"; items: { clue: string; answer: string }[]; wordBank: string[] }

export type SheetQuestion =
  | ChoiceQuestion | TrueFalseQuestion | MatchingQuestion | FillBlanksQuestion | ShortQuestion
  | LongQuestion | CalcQuestion | OrderQuestion | WordOrderQuestion | PictureQuestion | LabelQuestion;

export type SheetBlock = TextBlock | CalloutBlock | PassageBlock | WordBankBlock | TableBlock | SheetQuestion;

export type QuestionType = SheetQuestion["type"];
export type BlockType = SheetBlock["type"];

export const QUESTION_TYPES: QuestionType[] = [
  "mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "picture", "label",
];

export function isQuestion(block: SheetBlock): block is SheetQuestion {
  return (QUESTION_TYPES as string[]).includes(block.type);
}

/** What each question type is called where a teacher can see it. */
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  truefalse: "True or false",
  matching: "Matching",
  fillblanks: "Fill in the blanks",
  short: "Short answer",
  long: "Extended answer",
  calc: "Calculation",
  order: "Ordering",
  wordorder: "Word order",
  picture: "Picture choice",
  label: "Labelling",
};
