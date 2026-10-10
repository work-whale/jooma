// Turns what the model sent (or the part of it streamed so far) into a valid
// SheetDoc, and reads a stored one back.
//
// Everything is checked rather than trusted: the schema fixes the shape, but
// not that an answer index exists, that a matching question's pairs are a
// permutation, or that a maths prompt is free of LaTeX. Every string passes
// through cleanMathText, so a `\frac` that slips past the prompt still prints
// as a fraction.

import { cleanMathText } from "@/app/lib/math-text";
import {
  SHEET_KIND,
  SHEET_VERSION,
  type SheetBlock,
  type SheetCallout,
  type SheetDesign,
  type SheetDoc,
  type SheetSection,
  type SheetTool,
} from "./types";

type Raw = Record<string, unknown>;

const CALLOUT_DEFAULTS: Record<SheetCallout["variant"], { label: string; emoji: string }> = {
  fact: { label: "Did you know?", emoji: "📢" },
  remember: { label: "Remember", emoji: "🧠" },
  tip: { label: "Top tip", emoji: "💡" },
  challenge: { label: "Challenge", emoji: "🏆" },
};

export function defaultDesign(tool: SheetTool, themeId: string): SheetDesign {
  return { themeId, fontScale: "m", nameDate: true, answers: true, paper: "a4", lineNumbers: tool === "comprehension", objective: true, intro: true, diffNote: true };
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

/** One block, or null when it is empty or (mid-stream) not yet typed. */
export function normalizeBlock(raw: unknown, id: string): SheetBlock | null {
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
    default:
      return null;
  }
}

export interface NormalizeContext {
  tool: SheetTool;
  subtitle: string;
  design: SheetDesign;
  /** Placed by the server ahead of the model's sections, e.g. the teacher's
   *  own passage. Never sent through the model. */
  leadingSections?: SheetSection[];
}

/**
 * A draft from the model, complete or partial, as a SheetDoc.
 *
 * Ids are positional ("s0b2") so that re-normalising a longer stream keeps the
 * same ids for the blocks already on screen, which keeps React from remounting
 * them on every chunk. Blocks added later by the editor get fresh ids.
 */
export function normalizeDraft(raw: unknown, ctx: NormalizeContext): SheetDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const sections: SheetSection[] = (Array.isArray(r.sections) ? r.sections : [])
    .map((s, si): SheetSection | null => {
      if (!s || typeof s !== "object") return null;
      const sr = s as Raw;
      const blocks = (Array.isArray(sr.blocks) ? sr.blocks : [])
        .map((b, bi) => normalizeBlock(b, `s${si}b${bi}`))
        .filter((b): b is SheetBlock => !!b);
      const title = text(sr.title);
      if (!title && blocks.length === 0) return null;
      return { id: `s${si}`, title, emoji: text(sr.emoji), instructions: text(sr.instructions), blocks };
    })
    .filter((s): s is SheetSection => !!s);

  const teacherNotes = (Array.isArray(r.teacherNotes) ? r.teacherNotes : [])
    .map((n) => (n && typeof n === "object" ? { title: text((n as Raw).title), points: list((n as Raw).points) } : null))
    .filter((n): n is { title: string; points: string[] } => !!n && n.points.length > 0);

  return {
    kind: SHEET_KIND,
    version: SHEET_VERSION,
    tool: ctx.tool,
    title: text(r.title),
    subtitle: ctx.subtitle,
    objective: text(r.objective),
    intro: callout(r.intro),
    sections: [...(ctx.leadingSections ?? []), ...sections],
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
