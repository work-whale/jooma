// Turns what the model sent (or the part of it streamed so far) into a valid
// SheetDoc, and reads a stored one back.
//
// Everything is checked rather than trusted: the schema fixes the shape, but
// not that an answer index exists, that a matching question's pairs are a
// permutation, or that a maths prompt is free of LaTeX. Every string passes
// through cleanMathText, so a `\frac` that slips past the prompt still prints
// as a fraction.

import { cleanMathText } from "@/app/lib/math-text";
import type { StaffName } from "@/app/lib/staff-privacy";
import { seedFrom } from "@/app/lib/seeded-random";
import { gridLetters, refreshPuzzle, type PuzzleDefaults } from "./puzzles";
import { sheetToolProfile } from "./tools";
import { placeAnnotations } from "./model-answers";
import {
  SHEET_KIND,
  SHEET_VERSION,
  type ImageBlock,
  type LessonMeta,
  type ExamMeta,
  type LetterMeta,
  type PupilMeta,
  type UnitMeta,
  type SheetBlock,
  type SheetCallout,
  type SheetDesign,
  type SheetDoc,
  type SheetSection,
  type SheetTool,
  PUZZLE_LEVELS,
  type CrosswordEntry,
  type PuzzleLevel,
  type WordPlacement,
} from "./types";

type Raw = Record<string, unknown>;

const CALLOUT_DEFAULTS: Record<SheetCallout["variant"], { label: string; emoji: string }> = {
  fact: { label: "Did you know?", emoji: "📢" },
  remember: { label: "Remember", emoji: "🧠" },
  tip: { label: "Top tip", emoji: "💡" },
  challenge: { label: "Challenge", emoji: "🏆" },
};

export function defaultDesign(tool: SheetTool, themeId: string): SheetDesign {
  return { themeId, fontScale: "m", nameDate: true, answers: true, paper: "a4", lineNumbers: sheetToolProfile(tool).lineNumbers, objective: true, intro: true, diffNote: true };
}

// The copyright sign becomes "(c)", as the markdown tools always did.
const text = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? cleanMathText(v).replace(/©/g, "(c)").trim() : fallback;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => text(x)).filter((s) => s.length > 0) : []);
const intOf = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
};
const indices = (v: unknown, size: number): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < size))] : [];

/** A list of indices that orders `size` items exactly once each, or the
 *  identity order when the model's is not one. */
function permutation(v: unknown, size: number): number[] {
  const p = indices(v, size);
  return p.length === size ? p : Array.from({ length: size }, (_, i) => i);
}

/** Gaps written as runs of underscores, or [blank], become one "___". */
function gaps(s: string): string {
  return s.replace(/\[blank\]/gi, "___").replace(/_{2,}/g, "___");
}

function callout(raw: unknown): SheetCallout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const body = text(r.text);
  if (!body) return null;
  const variant = (["fact", "remember", "tip", "challenge"] as const).find((v) => v === r.variant) ?? "fact";
  return {
    variant,
    label: text(r.label) || CALLOUT_DEFAULTS[variant].label,
    emoji: text(r.emoji) || CALLOUT_DEFAULTS[variant].emoji,
    text: body,
  };
}

/** A stored seed, or one taken from the block's id: positional while a sheet
 *  streams in ("s0b1"), so the grid stays put as more of the sheet arrives. */
function seedOf(v: unknown, id: string): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : seedFrom(id);
}

/** The most lessons a sequence block holds. The form asks for at most 30; a
 *  little room is left for lessons a teacher or Jo adds. */
export const MAX_SEQUENCE_LESSONS = 40;

/**
 * One block, or null when it is empty or (mid-stream) not yet typed.
 *
 * `puzzle` gives a word search its level and a crossword its word bank when
 * the block does not carry them: the model never writes those, they follow
 * the year group and band (app/lib/sheets/puzzles/level.ts).
 */
export function normalizeBlock(raw: unknown, id: string, puzzle?: Partial<PuzzleDefaults>): SheetBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const q = { id, prompt: text(r.prompt), marks: intOf(r.marks, 0, 20, 1), domain: text(r.domain) };
  switch (r.type) {
    case "text": {
      const t = text(r.text);
      return t ? { id, type: "text", text: t } : null;
    }
    case "callout": {
      const c = callout(r);
      return c ? { id, type: "callout", ...c } : null;
    }
    case "passage": {
      const paragraphs = list(r.paragraphs);
      return paragraphs.length ? { id, type: "passage", title: text(r.title), paragraphs } : null;
    }
    case "wordbank": {
      const words = list(r.words);
      return words.length ? { id, type: "wordbank", title: text(r.title) || "Word bank", words } : null;
    }
    case "table": {
      const headers = list(r.headers);
      const rows = Array.isArray(r.rows)
        ? r.rows.map((row) => {
            const cells = Array.isArray(row) ? row.map((c) => text(c)) : [];
            return Array.from({ length: Math.max(headers.length, cells.length) }, (_, i) => cells[i] ?? "");
          })
        : [];
      return headers.length || rows.length ? { id, type: "table", headers, rows } : null;
    }
    case "list": {
      const items = list(r.items);
      const style = r.style === "number" || r.style === "check" ? r.style : "bullet";
      return items.length ? { id, type: "list", title: text(r.title), style, items } : null;
    }
    case "phase": {
      const title = text(r.title);
      const teacher = text(r.teacher);
      if (!title && !teacher) return null;
      const stage = r.stage === "starter" || r.stage === "plenary" ? r.stage : "main";
      return {
        id,
        type: "phase",
        stage,
        title,
        minutes: intOf(r.minutes, 1, 180, 10),
        teacher,
        pupils: text(r.pupils),
        check: list(r.check),
        feedback: text(r.feedback),
        support: text(r.support),
        challenge: text(r.challenge),
        ta: text(r.ta),
        // A cover lesson's script. Only a phase that came with one has one,
        // so a lesson plan's phases are exactly what they were.
        ...(typeof r.say === "string" ? { say: text(r.say) } : {}),
      };
    }
    case "sequence": {
      // A unit's lessons. One with neither a title nor an objective is not a
      // lesson yet (mid-stream) and is left out; past the cap is dropped.
      const lessons = (Array.isArray(r.lessons) ? r.lessons : [])
        .map((l) => {
          const lr = (l && typeof l === "object" ? l : {}) as Raw;
          return {
            title: text(lr.title),
            objective: text(lr.objective),
            starter: text(lr.starter),
            input: text(lr.input),
            activity: text(lr.activity),
            plenary: text(lr.plenary),
            summary: text(lr.summary),
            keyKnowledge: list(lr.keyKnowledge),
            resources: list(lr.resources),
            questions: list(lr.questions),
            vocabulary: list(lr.vocabulary),
          };
        })
        .filter((l) => l.title || l.objective)
        .slice(0, MAX_SEQUENCE_LESSONS);
      return lessons.length ? { id, type: "sequence", lessons } : null;
    }
    case "twocol": {
      const side = (v: unknown) => {
        const sr = (v && typeof v === "object" ? v : {}) as Raw;
        return { title: text(sr.title), items: list(sr.items) };
      };
      const left = side(r.left);
      const right = side(r.right);
      // Nothing on either side yet (mid-stream) is not a box.
      if (!left.items.length && !right.items.length && !left.title && !right.title) return null;
      return { id, type: "twocol", left, right };
    }
    case "exemplar": {
      const parts = list(r.parts);
      if (parts.length === 0) return null;
      const level = r.level === "mid" || r.level === "low" ? r.level : "full";
      const outOf = intOf(r.outOf, 0, 60, 0);
      const form = r.form === "steps" || r.form === "points" ? r.form : "prose";
      const raw = Array.isArray(r.annotations)
        ? r.annotations.map((a) => (a && typeof a === "object" ? { quote: text((a as Raw).quote), note: text((a as Raw).note) } : null)).filter((a): a is { quote: string; note: string } => !!a)
        : [];
      // A note whose quote is not in the answer cannot point at anything, so
      // it joins the commentary.
      const placed = placeAnnotations(parts, raw);
      const commentary = [text(r.commentary), ...placed.spare].filter(Boolean).join(" ");
      return {
        id, type: "exemplar", level, awarded: intOf(r.awarded, 0, outOf || 60, 0), outOf, form, parts, annotations: placed.annotations, commentary,
        // A model text's teacher copy; a model answer has no purpose field.
        ...(r.purpose === "text" ? { purpose: "text" as const } : {}),
      };
    }
    case "image": {
      // The model writes what to look for, never where a picture is: `src` is
      // filled by the picture search after the text has streamed.
      const query = text(r.query);
      return query ? { id, type: "image", query, alt: text(r.alt) || query, src: "", size: "m" } : null;
    }
    case "mcq": {
      const options = list(r.options).slice(0, 6);
      return { ...q, type: "mcq", options, answers: indices(r.answers, options.length) };
    }
    case "truefalse": {
      const statements = Array.isArray(r.statements)
        ? r.statements
            .map((s) => (s && typeof s === "object" ? { text: text((s as Raw).text), answer: (s as Raw).answer === true } : null))
            .filter((s): s is { text: string; answer: boolean } => !!s && s.text.length > 0)
        : [];
      return { ...q, type: "truefalse", statements };
    }
    case "matching": {
      const left = list(r.left);
      const right = list(r.right).slice(0, Math.max(left.length, 1) + 2);
      const pairs = left.length === right.length ? permutation(r.pairs, left.length) : indices(r.pairs, right.length).slice(0, left.length);
      return { ...q, type: "matching", left, right, pairs };
    }
    case "fillblanks":
      return { ...q, type: "fillblanks", sentences: list(r.sentences).map(gaps), answers: list(r.answers), wordBank: list(r.wordBank) };
    case "short":
      return { ...q, type: "short", lines: intOf(r.lines, 1, 6, 2), answer: text(r.answer), quote: text(r.quote) };
    case "long":
      return { ...q, type: "long", lines: intOf(r.lines, 3, 16, 6), answer: text(r.answer), criteria: list(r.criteria) };
    case "calc":
      return { ...q, type: "calc", working: r.working !== false, answer: text(r.answer) };
    case "order": {
      const items = list(r.items);
      return { ...q, type: "order", items, order: permutation(r.order, items.length) };
    }
    case "wordorder":
      return { ...q, type: "wordorder", words: list(r.words), answer: text(r.answer) };
    case "picture": {
      const options = Array.isArray(r.options)
        ? r.options
            .map((o) => (o && typeof o === "object" ? { emoji: text((o as Raw).emoji), label: text((o as Raw).label) } : null))
            .filter((o): o is { emoji: string; label: string } => !!o && (o.emoji.length > 0 || o.label.length > 0))
            .slice(0, 6)
        : [];
      return { ...q, type: "picture", options, answer: intOf(r.answer, 0, Math.max(0, options.length - 1), 0) };
    }
    case "label": {
      const items = Array.isArray(r.items)
        ? r.items
            .map((o) => (o && typeof o === "object" ? { clue: text((o as Raw).clue), answer: text((o as Raw).answer) } : null))
            .filter((o): o is { clue: string; answer: string } => !!o && o.clue.length > 0)
        : [];
      return { ...q, type: "label", items, wordBank: list(r.wordBank) };
    }
    case "sort": {
      // Each item once, in one group only: the first group to list it.
      const seen = new Set<string>();
      let room = 16;
      const categories = (Array.isArray(r.categories) ? r.categories : [])
        .map((c) => {
          const cr = (c && typeof c === "object" ? c : {}) as Raw;
          const items = list(cr.items)
            .filter((it) => {
              const k = it.toLowerCase();
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            })
            .slice(0, 8);
          return { name: text(cr.name), items };
        })
        .filter((c) => c.name || c.items.length)
        .slice(0, 4)
        .map((c) => {
          const items = c.items.slice(0, Math.max(0, room));
          room -= items.length;
          return { ...c, items };
        });
      return { ...q, type: "sort", categories, seed: seedOf(r.seed, id) };
    }
    case "wordsearch": {
      const seen = new Set<string>();
      const words = list(r.words)
        .filter((w) => {
          const k = gridLetters(w);
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 15);
      const level: PuzzleLevel = PUZZLE_LEVELS.find((l) => l === r.level) ?? puzzle?.level ?? "medium";
      const stored = r.key === undefined ? null : r;
      return refreshPuzzle({
        ...q,
        type: "wordsearch",
        words,
        level,
        seed: seedOf(r.seed ?? puzzle?.seed, id),
        key: typeof stored?.key === "string" ? stored.key : "",
        grid: Array.isArray(stored?.grid) ? (stored.grid as unknown[]).filter((g): g is string => typeof g === "string") : [],
        placements: Array.isArray(stored?.placements) ? (stored.placements as WordPlacement[]) : [],
        skipped: Array.isArray(stored?.skipped) ? list(stored.skipped) : [],
      });
    }
    case "crossword": {
      const seen = new Set<string>();
      const entries = (Array.isArray(r.entries) ? r.entries : [])
        .map((e) => (e && typeof e === "object" ? { clue: text((e as Raw).clue), answer: text((e as Raw).answer) } : null))
        .filter((e): e is { clue: string; answer: string } => {
          if (!e || !e.clue || !e.answer) return false;
          const k = gridLetters(e.answer);
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 12);
      const stored = r.key === undefined ? null : r;
      return refreshPuzzle({
        ...q,
        type: "crossword",
        entries,
        seed: seedOf(r.seed ?? puzzle?.seed, id),
        wordBank: typeof r.wordBank === "boolean" ? r.wordBank : puzzle?.wordBank ?? false,
        key: typeof stored?.key === "string" ? stored.key : "",
        width: typeof stored?.width === "number" ? stored.width : 0,
        height: typeof stored?.height === "number" ? stored.height : 0,
        placed: Array.isArray(stored?.placed) ? (stored.placed as CrosswordEntry[]) : [],
        unplaced: Array.isArray(stored?.unplaced) ? list(stored.unplaced) : [],
      });
    }
    default:
      return null;
  }
}

export interface NormalizeContext {
  tool: SheetTool;
  subtitle: string;
  design: SheetDesign;
  /** A puzzle's level and word bank, from the year group and band. */
  puzzle?: PuzzleDefaults;
  /** Placed by the server ahead of the model's sections, e.g. the teacher's
   *  own passage. Never sent through the model. */
  leadingSections?: SheetSection[];
  /** Turns a tool's own fixed-shape draft into a generic sheet draft
   *  (app/lib/sheets/tools.ts `arrange`). */
  arrange?: (raw: unknown) => unknown;
  /** Lesson plans: kept on the document. */
  lesson?: LessonMeta;
  /** Exam papers: kept on the document. */
  exam?: ExamMeta;
  /** Letters: kept on the document. */
  letter?: LetterMeta;
  /** Unit plans: kept on the document. */
  unit?: UnitMeta;
  /** Documents about one child: kept on the document, never sent. */
  pupil?: PupilMeta;
  /** Newsletters: the pupils celebrated, kept on the document, never sent. */
  roster?: string[];
  /** Staff documents: the people named in it, kept on the document, never sent. */
  staff?: StaffName[];
}

/** The most pictures a generated sheet holds: one near the top and up to two
 *  more where they help. More would crowd the questions and cost more. */
export const MAX_SHEET_PICTURES = 3;

/** Drops pictures past the cap, in reading order. */
function capPictures(sections: SheetSection[]): SheetSection[] {
  let seen = 0;
  return sections.map((s) => ({
    ...s,
    blocks: s.blocks.filter((b) => b.type !== "image" || ++seen <= MAX_SHEET_PICTURES),
  }));
}

/** Every picture on a sheet, in reading order. */
export function sheetImages(doc: SheetDoc): ImageBlock[] {
  return doc.sections.flatMap((s) => s.blocks.filter((b): b is ImageBlock => b.type === "image"));
}

/**
 * A draft from the model, complete or partial, as a SheetDoc.
 *
 * Ids are positional ("s0b2") so that re-normalising a longer stream keeps the
 * same ids for the blocks already on screen, which keeps React from remounting
 * them on every chunk. Blocks added later by the editor get fresh ids.
 */
export function normalizeDraft(raw: unknown, ctx: NormalizeContext): SheetDoc {
  const arranged = ctx.arrange ? ctx.arrange(raw) : raw;
  const r = (arranged && typeof arranged === "object" ? arranged : {}) as Raw;
  const sections: SheetSection[] = (Array.isArray(r.sections) ? r.sections : [])
    .map((s, si): SheetSection | null => {
      if (!s || typeof s !== "object") return null;
      const sr = s as Raw;
      const blocks = (Array.isArray(sr.blocks) ? sr.blocks : [])
        .map((b, bi) => normalizeBlock(b, `s${si}b${bi}`, ctx.puzzle))
        .filter((b): b is SheetBlock => !!b);
      const title = text(sr.title);
      if (!title && blocks.length === 0) return null;
      const role = text(sr.role);
      return { id: `s${si}`, title, emoji: text(sr.emoji), instructions: text(sr.instructions), blocks, ...(role ? { role } : {}) };
    })
    .filter((s): s is SheetSection => !!s);

  const teacherNotes = (Array.isArray(r.teacherNotes) ? r.teacherNotes : [])
    .map((n) => (n && typeof n === "object" ? { title: text((n as Raw).title), points: list((n as Raw).points) } : null))
    .filter((n): n is { title: string; points: string[] } => !!n && n.points.length > 0);

  return {
    kind: SHEET_KIND,
    version: SHEET_VERSION,
    tool: ctx.tool,
    ...(ctx.lesson ? { lesson: ctx.lesson } : {}),
    ...(ctx.exam ? { exam: ctx.exam } : {}),
    ...(ctx.letter ? { letter: ctx.letter } : {}),
    ...(ctx.unit ? { unit: ctx.unit } : {}),
    ...(ctx.pupil ? { pupil: ctx.pupil } : {}),
    ...(ctx.roster?.length ? { roster: ctx.roster } : {}),
    ...(ctx.staff ? { staff: ctx.staff } : {}),
    title: text(r.title),
    subtitle: ctx.subtitle,
    objective: text(r.objective),
    intro: callout(r.intro),
    sections: [...(ctx.leadingSections ?? []), ...capPictures(sections)],
    teacherNotes,
    design: ctx.design,
  };
}

/** True when a stored output is a sheet rather than markdown. Cheap enough to
 *  call on every render: a sheet is serialised with `kind` first. */
export function isSheetOutput(output: string | null | undefined): boolean {
  return typeof output === "string" && output.trimStart().startsWith(`{"kind":"${SHEET_KIND}"`);
}

export function serializeSheet(doc: SheetDoc): string {
  return JSON.stringify(doc);
}

/** A stored sheet, or null when the output is not one or will not parse. */
export function parseSheet(output: string | null | undefined): SheetDoc | null {
  if (!isSheetOutput(output)) return null;
  try {
    const doc = JSON.parse(output as string) as SheetDoc;
    if (doc?.kind !== SHEET_KIND || !Array.isArray(doc.sections)) return null;
    return doc;
  } catch {
    return null;
  }
}

/** The teacher's own passage, split into paragraphs, as the sheet's first
 *  section. Kept exactly as they wrote it. */
export function ownPassageSection(ownText: string): SheetSection {
  const paragraphs = ownText
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return {
    id: "own",
    title: "Read the text",
    emoji: "📖",
    instructions: "Read the text carefully, then answer the questions.",
    blocks: [{ id: "own-passage", type: "passage", title: "", paragraphs }],
  };
}

let fresh = 0;
/** An id for a block or section the teacher adds in the editor. */
export function newSheetId(prefix: string): string {
  fresh += 1;
  return `${prefix}${Date.now().toString(36)}${fresh.toString(36)}`;
}
