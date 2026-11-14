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

// Which tool made a sheet. The list and what differs per tool live in
// app/lib/sheets/tools.ts.
import type { StaffName } from "@/app/lib/staff-privacy";
import type { SheetTool } from "./tools";
export type { SheetTool };

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
  /** The pictures on the sheet. Missing means on. */
  pictures?: boolean;
  /** An exam paper's cover page. Missing means on. */
  cover?: boolean;
  /** A letter's reply slip. Missing means on. */
  slip?: boolean;
  /** Pages turned on their side. Missing means portrait. Offered only by
   *  tools whose profile allows it (the unit planners). */
  landscape?: boolean;
  /** A lesson sequence's visible columns (app/lib/sheets/unit.ts), in table
   *  order. Missing means the tool's defaults. */
  columns?: string[];
  /** Parts of a document switched off in Design, by id: a unit plan's
   *  "overview", a behaviour plan's "log". Missing means all shown. */
  hidden?: string[];
}

/** How a lesson plan is laid out (app/lib/sheets/lesson.ts). Both are the
 *  same plan arranged differently, so a teacher can switch without
 *  regenerating. */
export type LessonLayout = "three-part" | "cycles";

/** What a lesson plan knows about itself beyond its pages: the layout it is
 *  arranged in, the length its timings add up to, and the form's details,
 *  which the "make slides / worksheet / quiz" buttons carry over. */
export interface LessonMeta {
  layout: LessonLayout;
  minutes: number;
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
}

/** What an exam paper knows about itself: the style it is written in
 *  (app/lib/sheets/exam-styles.ts), its tier and the time allowed. The total
 *  marks are always worked out from the questions, never stored. */
export interface ExamMeta {
  styleId: string;
  tier: "" | "foundation" | "higher";
  minutes: number;
  subject: string;
  yearGroup: string;
}

/** A letter's tear-off reply slip, built in code (app/lib/sheets/letter.ts). */
export interface ReplySlip {
  title: string;
  /** "I give permission for my child to go on the trip to..." */
  statement: string;
  /** The lines to fill in: "Child's name", "Signature"... */
  fields: string[];
  /** "Friday 5 March 2027", or "" when no date was given. */
  returnBy: string;
}

/** What a letter knows about itself beyond its paragraphs: everything built
 *  in code rather than written by the model, all editable on the page. */
export interface LetterMeta {
  type: "trip" | "attendance" | "behaviour" | "general";
  /** "2026-11-10", printed as "10 November 2026". */
  date: string;
  salutation: string;
  signOff: string;
  senderName: string;
  senderRole: string;
  school: string;
  /** The child a letter is about, by first name. Ask Jo is off while it is
   *  set, so the name never reaches a model. */
  pupil: string;
  slip: ReplySlip | null;
}

/** What a unit plan (Topic Map, Term Plan) keeps about itself: the form's
 *  details, which "Plan this lesson" carries over to Lesson Plan. */
export interface UnitMeta {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
}

/** He, she or they: how the model and the page refer to a pupil. */
export type PupilPronouns = "he" | "she" | "they";

/**
 * The child a document is about (Behaviour Support Plan, One Page Profile).
 * The name lives here and in the teacher's saved copy only: the text holds
 * "[PUPIL]" (app/lib/reports/privacy.ts), swapped for the name when the page
 * is drawn or exported (app/lib/sheets/pupil.ts), and nothing sent to a model
 * carries this field.
 */
export interface PupilMeta {
  name: string;
  pronouns: PupilPronouns;
}

export interface SheetDoc {
  kind: typeof SHEET_KIND;
  version: number;
  tool: SheetTool;
  /** Unit plans only. */
  unit?: UnitMeta;
  /** Documents about one child only. Never sent to a model. */
  pupil?: PupilMeta;
  /** Newsletters: the pupils in its celebrations, in order. The text holds
   *  "[PUPIL 1]", "[PUPIL 2]" (app/lib/sheets/roster.ts), swapped for these
   *  names when drawn or exported. Never sent to a model. */
  roster?: string[];
  /** Staff documents (ECT report, lesson observation): the people named in
   *  it. The text holds their placeholders ("[ECT]", "[TEACHER]"), swapped
   *  for these names when drawn or exported (app/lib/staff-privacy.ts).
   *  Never sent to a model. */
  staff?: StaffName[];
  /** Lesson plans only. */
  lesson?: LessonMeta;
  /** Exam papers only. */
  exam?: ExamMeta;
  /** Letters only. The title is the "Re:" line. */
  letter?: LetterMeta;
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
  /** What part of a fixed-shape document this section is (a lesson plan's
   *  "overview", "starter", "cycle"...), so it can be rearranged. Missing on
   *  worksheets and on sections the teacher adds. */
  role?: string;
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
/** A titled list: success criteria (ticks), resources (bullets), steps
 *  (numbers). */
export interface ListBlock extends BlockBase { type: "list"; title: string; style: "bullet" | "number" | "check"; items: string[] }

/** One stage of a lesson, with its timing. In the learning cycles layout a
 *  "main" phase is a learning cycle: `teacher` is the explanation, `check` the
 *  check for understanding, `pupils` the practice and `feedback` the feedback.
 *  Its clock time is worked out from the phases before it, never stored. */
export interface PhaseBlock extends BlockBase {
  type: "phase";
  stage: "starter" | "main" | "plenary";
  title: string;
  minutes: number;
  teacher: string;
  pupils: string;
  check: string[];
  feedback: string;
  support: string;
  challenge: string;
  /** What a teaching assistant does in this phase. */
  ta: string;
  /** Cover lessons only: the words the cover teacher can say to the class.
   *  Missing on a lesson plan's phases, which never show it. */
  say?: string;
}

/** One lesson in a unit plan. Every field is filled, so any column of the
 *  table can be switched on without asking the model again. */
export interface UnitLesson {
  title: string;
  objective: string;
  starter: string;
  input: string;
  activity: string;
  plenary: string;
  /** Term Plan's "summary of the lesson". */
  summary: string;
  keyKnowledge: string[];
  resources: string[];
  questions: string[];
  vocabulary: string[];
}

/** A unit's lessons, drawn as a table one row per lesson. Splits across pages
 *  between rows, repeating the header row. */
export interface SequenceBlock extends BlockBase {
  type: "sequence";
  lessons: UnitLesson[];
}

/** One side of a two-column box: a heading and its points. */
export interface TwoColSide {
  title: string;
  items: string[];
}

/** Two titled lists side by side, as a behaviour plan pairs them: "What does
 *  it look like?" beside "What are we working towards?". */
export interface TwoColBlock extends BlockBase {
  type: "twocol";
  left: TwoColSide;
  right: TwoColSide;
}

export type ImageSize = "s" | "m" | "l";
export type ImageSource = "web" | "ai" | "upload";

/**
 * A picture on its own row. It supports the sheet and no question depends on
 * it, so it can be swapped or deleted freely. The model writes only `query`
 * and `alt`; `src` is a Storage URL found after the text has streamed, and
 * empty until then (or when no picture was found).
 */
export interface ImageBlock extends BlockBase {
  type: "image";
  query: string;
  alt: string;
  src: string;
  width?: number;
  height?: number;
  size: ImageSize;
  source?: ImageSource;
  /** Being searched for right now. Transient: cleared once the search ends,
   *  found or not, and before the sheet is first saved. */
  finding?: boolean;
}

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

// ── Puzzles ──
// The model writes the words, clues and groups; the grids are built from them
// by app/lib/sheets/puzzles and stored, with a `key` saying what they were
// built from, so a saved sheet never changes unless its words do.

/** How hard a word search is: its size and the directions words run in. */
export type PuzzleLevel = "easy" | "medium" | "hard";
export const PUZZLE_LEVELS: PuzzleLevel[] = ["easy", "medium", "hard"];

/** Sort into groups: every item belongs to exactly one category. Pupils see
 *  all the items in one shuffled bank (shuffled by `seed`). */
export interface SortQuestion extends QuestionBase { type: "sort"; categories: { name: string; items: string[] }[]; seed: number }

/** A word hidden in a word search: its first letter's cell and its direction. */
export interface WordPlacement { word: string; row: number; col: number; dr: -1 | 0 | 1; dc: -1 | 0 | 1 }
export interface WordSearchQuestion extends QuestionBase {
  type: "wordsearch";
  words: string[];
  level: PuzzleLevel;
  seed: number;
  /** What `grid` was built from. A mismatch means rebuild. */
  key: string;
  /** Rows of capital letters. */
  grid: string[];
  placements: WordPlacement[];
  /** Words that could not go in the grid. Shown while editing only. */
  skipped: string[];
}

/** One answer in a crossword grid. `letters` is what fills the squares;
 *  `answer` is the word as written, for the word bank and the answers. */
export interface CrosswordEntry { number: number; dir: "across" | "down"; row: number; col: number; letters: string; answer: string; clue: string }
export interface CrosswordQuestion extends QuestionBase {
  type: "crossword";
  entries: { clue: string; answer: string }[];
  seed: number;
  /** The answers listed under the grid, for younger pupils. */
  wordBank: boolean;
  key: string;
  width: number;
  height: number;
  placed: CrosswordEntry[];
  /** Answers that would not cross any other. Shown while editing only. */
  unplaced: string[];
}

export type SheetQuestion =
  | ChoiceQuestion | TrueFalseQuestion | MatchingQuestion | FillBlanksQuestion | ShortQuestion
  | LongQuestion | CalcQuestion | OrderQuestion | WordOrderQuestion | PictureQuestion | LabelQuestion
  | SortQuestion | WordSearchQuestion | CrosswordQuestion;

/** One model answer to an exam question, at a level: the answer itself (as
 *  prose, numbered steps or points), the marks it would get, and notes tying
 *  phrases in it to the mark scheme. */
export interface ExemplarBlock extends BlockBase {
  type: "exemplar";
  level: "full" | "mid" | "low";
  awarded: number;
  outOf: number;
  form: "prose" | "steps" | "points";
  parts: string[];
  annotations: { quote: string; note: string }[];
  commentary: string;
  /** "text": a model text's teacher copy (Model Texts), annotated with its
   *  writing features and carrying no marks. Missing: a marked model answer. */
  purpose?: "text";
}

export type SheetBlock = TextBlock | CalloutBlock | PassageBlock | WordBankBlock | TableBlock | ListBlock | PhaseBlock | ExemplarBlock | SequenceBlock | TwoColBlock | ImageBlock | SheetQuestion;

export type QuestionType = SheetQuestion["type"];
export type BlockType = SheetBlock["type"];

export const QUESTION_TYPES: QuestionType[] = [
  "mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "picture", "label",
  "sort", "wordsearch", "crossword",
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
  sort: "Sort into groups",
  wordsearch: "Word search",
  crossword: "Crossword",
};
