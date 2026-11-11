// Jo's edits to a worksheet or comprehension, as pure functions over the
// document. The panel plays each op through these and hands the result to the
// sheet editor, so an edit from Jo is the same kind of change as one the
// teacher makes by hand.
//
// Ops arrive from a model, so nothing is trusted: an id that does not exist, a
// path to a field that is not text, or a block that normalises to nothing
// makes the op a no-op (null) rather than a broken sheet.

import { cleanMathText } from "@/app/lib/math-text";
import { deleteBlock, deleteSection, insertBlock, updateBlock, updateSection } from "@/app/lib/sheets/edit";
import { newSheetId, normalizeBlock } from "@/app/lib/sheets/normalize";
import { puzzleDefaultsFromSubtitle, type PuzzleDefaults } from "@/app/lib/sheets/puzzles";
import { sheetToolProfile } from "@/app/lib/sheets/tools";
import { PRIVATE_ROLES } from "@/app/lib/sheets/behaviour";
import type { SheetBlock, SheetDesign, SheetDoc, SheetSection } from "@/app/lib/sheets/types";
import type { SheetOp } from "./types";

/** Where an op lands, as SheetDocument's `data-jo` key. */
export type SheetFocus = string;

const clean = (v: string): string => cleanMathText(v).replace(/©/g, "(c)").trim();

function findBlock(doc: SheetDoc, blockId: string): { si: number; bi: number } | null {
  for (let si = 0; si < doc.sections.length; si++) {
    const bi = doc.sections[si].blocks.findIndex((b) => b.id === blockId);
    if (bi !== -1) return { si, bi };
  }
  return null;
}

function findSection(doc: SheetDoc, sectionId: string): number {
  return doc.sections.findIndex((s) => s.id === sectionId);
}

/**
 * A compact copy of the sheet for the model: every id and every word, none of
 * the layout. Blocks are already plain data, so they go as they are.
 */
export function sheetSnapshot(doc: SheetDoc) {
  return {
    tool: doc.tool,
    title: doc.title,
    subtitle: doc.subtitle,
    objective: doc.objective,
    intro: doc.intro?.text ?? null,
    design: {
      fontScale: doc.design.fontScale,
      answers: doc.design.answers,
      nameDate: doc.design.nameDate,
      lineNumbers: doc.design.lineNumbers,
      paper: doc.design.paper,
      objective: doc.design.objective !== false,
      intro: doc.design.intro !== false,
      diffNote: doc.design.diffNote !== false,
      pictures: doc.design.pictures !== false,
      ...(sheetToolProfile(doc.tool)?.landscape ? { landscape: doc.design.landscape === true } : {}),
    },
    // The parts built from what the teacher typed about a child (details,
    // incident log, signatures, links) are not Jo's to read or change.
    sections: doc.sections.filter((s) => !PRIVATE_ROLES.includes(s.role ?? "")).map((s) => ({
      id: s.id,
      title: s.title,
      emoji: s.emoji,
      instructions: s.instructions,
      // A picture as what it shows, not where it is stored: Jo can move or
      // delete one, but choosing pictures is the teacher's.
      // A puzzle as its words: the grid is built from them, so Jo changes the
      // words, items or clues and never sees or writes a grid.
      blocks: s.blocks.map((b) => {
        if (b.type === "image") return { id: b.id, type: b.type, alt: b.alt, size: b.size };
        if (b.type === "wordsearch") return { id: b.id, type: b.type, prompt: b.prompt, marks: b.marks, words: b.words };
        if (b.type === "crossword") return { id: b.id, type: b.type, prompt: b.prompt, marks: b.marks, entries: b.entries };
        if (b.type === "sort") return { id: b.id, type: b.type, prompt: b.prompt, marks: b.marks, categories: b.categories };
        return b;
      }),
    })),
  };
}

/**
 * Whether a sheet snapshot may go to a model. A document about one child goes
 * with "[PUPIL]" in its text and no `pupil` field; one that arrives with the
 * child's details on it is refused rather than passed on. (Not carriesName
 * from Reports: a sort question's groups have a "name" key.)
 */
export function isSendableSheetSnapshot(snap: Record<string, unknown>): boolean {
  return !("pupil" in snap);
}

/** The `data-jo` key of the piece an op changes, or null for a whole sheet
 *  change such as a design setting. Read BEFORE the op is applied, so a delete
 *  can point at what is about to go. */
export function sheetOpFocus(doc: SheetDoc, op: SheetOp): SheetFocus | null {
  switch (op.op) {
    case "setText": {
      const [head] = op.target.split(".");
      if (head === "title" || head === "objective" || head === "subtitle") return "head";
      if (head === "intro") return doc.intro ? "intro" : "head";
      if (findSection(doc, head) !== -1) return `sh:${head}`;
      return findBlock(doc, head) ? head : null;
    }
    case "replaceBlock":
    case "deleteBlock":
      return findBlock(doc, op.blockId) ? op.blockId : null;
    case "insertBlock":
      return findSection(doc, op.sectionId) !== -1 ? `sh:${op.sectionId}` : null;
    case "addSection":
      return op.afterSectionId && findSection(doc, op.afterSectionId) !== -1 ? `sh:${op.afterSectionId}` : null;
    case "deleteSection":
      return findSection(doc, op.sectionId) !== -1 ? `sh:${op.sectionId}` : null;
    case "setDesign":
      return null;
  }
}

/** The text a setText op's target holds now, or null when the path does not
 *  lead to text. */
export function sheetTextAt(doc: SheetDoc, target: string): string | null {
  const parts = target.split(".");
  const [head, field, index] = parts;
  if (parts.length === 1) {
    if (head === "title") return doc.title;
    if (head === "objective") return doc.objective;
    if (head === "subtitle") return doc.subtitle;
    if (head === "intro") return doc.intro?.text ?? null;
    return null;
  }
  const si = findSection(doc, head);
  if (si !== -1) {
    if (parts.length !== 2) return null;
    const s = doc.sections[si];
    if (field === "title") return s.title;
    if (field === "instructions") return s.instructions;
    if (field === "emoji") return s.emoji;
    return null;
  }
  const at = findBlock(doc, head);
  if (!at) return null;
  const found = doc.sections[at.si].blocks[at.bi];
  // A picture's only words are its description. Where it is stored, and what
  // it was searched for, are not Jo's to write.
  if (found.type === "image" && field !== "alt") return null;
  const value = (found as unknown as Record<string, unknown>)[field];
  if (parts.length === 2) return typeof value === "string" ? value : null;
  // One cell of a lesson table: "<blockId>.lessons.<n>.<field>". A list cell
  // (key knowledge, resources) is rewritten with replaceBlock instead.
  if (parts.length === 4) {
    if (found.type !== "sequence" || field !== "lessons") return null;
    const lesson = found.lessons[Number(index)];
    const cell = lesson ? (lesson as unknown as Record<string, unknown>)[parts[3]] : undefined;
    return Number.isInteger(Number(index)) && typeof cell === "string" ? cell : null;
  }
  if (parts.length !== 3 || !Array.isArray(value)) return null;
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0 || n > value.length) return null;
  if (n === value.length) return "";
  const item = value[n];
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") return (item as { text: string }).text;
  return null;
}

/**
 * The sheet with one piece of text replaced, or null when the target is not a
 * piece of text. A list index one past the end appends, so "add a paragraph"
 * and "add an option" need no op of their own.
 *
 * `raw` skips cleaning and trimming, for the typing animation, which shows the
 * text a few letters at a time and must not lose a trailing space.
 */
export function setSheetText(doc: SheetDoc, target: string, value: string, raw = false): SheetDoc | null {
  if (sheetTextAt(doc, target) === null) return null;
  const text = raw ? value : clean(value);
  const parts = target.split(".");
  const [head, field, index] = parts;

  if (parts.length === 1) {
    if (head === "intro") return doc.intro ? { ...doc, intro: { ...doc.intro, text } } : null;
    return { ...doc, [head]: text };
  }
  const si = findSection(doc, head);
  if (si !== -1) return updateSection(doc, si, { [field]: text } as Partial<SheetSection>);

  const at = findBlock(doc, head)!;
  const block = doc.sections[at.si].blocks[at.bi] as unknown as Record<string, unknown>;
  if (parts.length === 2) return updateBlock(doc, at.si, at.bi, { [field]: text } as Partial<SheetBlock>);
  if (parts.length === 4) {
    const n = Number(index);
    const lessons = (block.lessons as Record<string, unknown>[]).map((l, i) => (i === n ? { ...l, [parts[3]]: text } : l));
    return updateBlock(doc, at.si, at.bi, { lessons } as unknown as Partial<SheetBlock>);
  }

  const list = [...(block[field] as unknown[])];
  const n = Number(index);
  const old = list[n];
  if (old && typeof old === "object") list[n] = { ...(old as object), text };
  else if (n === list.length && list.some((x) => x && typeof x === "object")) return null;
  else list[n] = text;
  return updateBlock(doc, at.si, at.bi, { [field]: list } as Partial<SheetBlock>);
}

function design(doc: SheetDoc, key: string, value: string): SheetDoc | null {
  const v = value.trim().toLowerCase();
  const patch: Partial<SheetDesign> = {};
  switch (key) {
    case "fontScale":
      if (!["s", "m", "l", "xl"].includes(v)) return null;
      patch.fontScale = v as SheetDesign["fontScale"];
      break;
    case "paper":
      if (v !== "a4" && v !== "letter") return null;
      patch.paper = v;
      break;
    case "landscape":
      // Only where Design offers it (the unit planners).
      if (!sheetToolProfile(doc.tool)?.landscape || (v !== "true" && v !== "false")) return null;
      patch.landscape = v === "true";
      break;
    case "answers":
    case "nameDate":
    case "lineNumbers":
    case "objective":
    case "intro":
    case "diffNote":
    case "pictures":
      if (v !== "true" && v !== "false") return null;
      patch[key] = v === "true";
      break;
    default:
      return null;
  }
  return { ...doc, design: { ...doc.design, ...patch } };
}

export interface AppliedSheetOp {
  doc: SheetDoc;
  /** Where the change landed, for the highlight and "show me". */
  focus: SheetFocus | null;
}

/** What a rewritten puzzle keeps from the one it replaces: its level, word
 *  bank and seed, which Jo never writes. Anything else takes the sheet's year. */
function keepPuzzle(doc: SheetDoc, old: SheetBlock | undefined): PuzzleDefaults {
  const base = puzzleDefaultsFromSubtitle(doc.subtitle);
  if (old?.type === "wordsearch") return { ...base, level: old.level, seed: old.seed };
  if (old?.type === "crossword") return { ...base, wordBank: old.wordBank, seed: old.seed };
  if (old?.type === "sort") return { ...base, seed: old.seed };
  return base;
}

/** Whether an op lands in a part Jo is not shown (a plan's details, log or
 *  signatures). Such an op is refused even if Jo guessed the id. */
function touchesPrivate(doc: SheetDoc, op: SheetOp): boolean {
  const isPrivate = (si: number) => si !== -1 && PRIVATE_ROLES.includes(doc.sections[si].role ?? "");
  const blockSection = (id: string) => findBlock(doc, id)?.si ?? -1;
  switch (op.op) {
    case "setText": {
      const head = op.target.split(".")[0];
      return isPrivate(findSection(doc, head)) || isPrivate(blockSection(head));
    }
    case "replaceBlock":
    case "deleteBlock":
      return isPrivate(blockSection(op.blockId));
    case "insertBlock":
    case "deleteSection":
      return isPrivate(findSection(doc, op.sectionId));
    default:
      return false;
  }
}

/** One op applied, or null when it does not fit this sheet. */
export function applySheetOp(doc: SheetDoc, op: SheetOp): AppliedSheetOp | null {
  if (touchesPrivate(doc, op)) return null;
  switch (op.op) {
    case "setText": {
      const next = setSheetText(doc, op.target, op.text);
      return next ? { doc: next, focus: sheetOpFocus(doc, op) } : null;
    }
    case "replaceBlock": {
      const at = findBlock(doc, op.blockId);
      const block = at && normalizeBlock(op.block, op.blockId, keepPuzzle(doc, doc.sections[at.si].blocks[at.bi]));
      if (!at || !block) return null;
      const sections = doc.sections.map((s, i) =>
        i === at.si ? { ...s, blocks: s.blocks.map((b, j) => (j === at.bi ? block : b)) } : s,
      );
      return { doc: { ...doc, sections }, focus: op.blockId };
    }
    case "insertBlock": {
      const si = findSection(doc, op.sectionId);
      if (si === -1) return null;
      const id = newSheetId("b");
      const block = normalizeBlock(op.block, id, puzzleDefaultsFromSubtitle(doc.subtitle));
      if (!block) return null;
      let at = 0;
      if (op.afterBlockId) {
        const after = doc.sections[si].blocks.findIndex((b) => b.id === op.afterBlockId);
        at = after === -1 ? doc.sections[si].blocks.length : after + 1;
      }
      return { doc: insertBlock(doc, si, block, at), focus: id };
    }
    case "deleteBlock": {
      const at = findBlock(doc, op.blockId);
      if (!at) return null;
      return { doc: deleteBlock(doc, at.si, at.bi), focus: null };
    }
    case "addSection": {
      const blocks = (Array.isArray(op.blocks) ? op.blocks : [])
        .map((b) => normalizeBlock(b, newSheetId("b"), puzzleDefaultsFromSubtitle(doc.subtitle)))
        .filter((b): b is SheetBlock => !!b);
      const title = clean(op.title ?? "");
      if (!title && blocks.length === 0) return null;
      const section: SheetSection = {
        id: newSheetId("s"),
        title,
        emoji: clean(op.emoji ?? ""),
        instructions: clean(op.instructions ?? ""),
        blocks,
      };
      let at = doc.sections.length;
      if (op.afterSectionId === "") at = 0;
      else {
        const after = findSection(doc, op.afterSectionId);
        if (after !== -1) at = after + 1;
      }
      const sections = [...doc.sections.slice(0, at), section, ...doc.sections.slice(at)];
      return { doc: { ...doc, sections }, focus: `sh:${section.id}` };
    }
    case "deleteSection": {
      const si = findSection(doc, op.sectionId);
      if (si === -1) return null;
      return { doc: deleteSection(doc, si), focus: null };
    }
    case "setDesign": {
      const next = design(doc, op.key, op.value);
      return next ? { doc: next, focus: null } : null;
    }
  }
}

/** True when an op is one this file knows, with the fields it needs. A guard
 *  for what came out of a half parsed stream. */
export function isSheetOp(v: unknown): v is SheetOp {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const s = (k: string) => typeof o[k] === "string";
  if (!s("label")) return false;
  switch (o.op) {
    case "setText": return s("target") && s("text");
    case "replaceBlock": return s("blockId") && !!o.block && typeof o.block === "object";
    case "insertBlock": return s("sectionId") && s("afterBlockId") && !!o.block && typeof o.block === "object";
    case "deleteBlock": return s("blockId");
    case "addSection": return s("afterSectionId") && s("title") && Array.isArray(o.blocks);
    case "deleteSection": return s("sectionId");
    case "setDesign": return s("key") && s("value");
    default: return false;
  }
}
