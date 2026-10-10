// Jo's edits to a markdown document (the text tools: lesson plans, letters,
// reports and the rest), as pure functions.
//
// A document is read as sections, one per heading, plus whatever comes before
// the first heading. Each gets an id for the length of a turn, so a turn's ops
// keep pointing at the right place while earlier ops add or remove sections.
// Splitting and joining is exact: a document that Jo does not touch comes back
// byte for byte, so an op only ever changes the section it names.

import type { MdOp } from "./types";

export interface MdSection {
  id: string;
  /** 0 for the text before the first heading. */
  level: number;
  /** The heading line exactly as written, or null for the opening text. */
  headingLine: string | null;
  lines: string[];
}

export interface MdDoc {
  sections: MdSection[];
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

export function parseMarkdownDoc(markdown: string): MdDoc {
  const sections: MdSection[] = [{ id: "s0", level: 0, headingLine: null, lines: [] }];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    const m = !inFence && HEADING.exec(line);
    if (m) {
      sections.push({ id: `s${sections.length}`, level: m[1].length, headingLine: line, lines: [] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return { sections };
}

export function serializeMarkdownDoc(doc: MdDoc): string {
  return doc.sections.flatMap((s) => (s.headingLine === null ? s.lines : [s.headingLine, ...s.lines])).join("\n");
}

function headingText(s: MdSection): string {
  if (s.headingLine === null) return "";
  return HEADING.exec(s.headingLine)?.[2] ?? s.headingLine;
}

/** What the model sees: each section's id, heading and text. */
export function markdownSnapshot(doc: MdDoc) {
  return {
    sections: doc.sections
      .filter((s) => s.headingLine !== null || s.lines.some((l) => l.trim()))
      .map((s) => ({ id: s.id, level: s.level, heading: headingText(s), markdown: s.lines.join("\n").trim() })),
  };
}

let fresh = 0;
const newSectionId = () => `n${Date.now().toString(36)}${(fresh++).toString(36)}`;

/** Body lines for new text, with one blank line kept before what follows. */
function bodyLines(markdown: string, last: boolean): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\s+$/, "").split("\n");
  // A body always opens on its own line under the heading, as written ones do.
  if (lines[0]?.trim()) lines.unshift("");
  if (!last) lines.push("");
  return lines;
}

function headingLineFor(level: number, text: string): string {
  return `${"#".repeat(Math.min(6, Math.max(1, level)))} ${text.replace(/\s+/g, " ").trim()}`;
}

export interface AppliedMdOp {
  doc: MdDoc;
  /** The section the op landed in, or null for a delete. */
  focus: string | null;
}

/**
 * One op applied, or null when it does not fit this document.
 *
 * `partial`, for the typing animation, is how much of the op's new text to
 * show (0 to 1). Only the op's own section changes with it. `newId` keeps a
 * new section's id the same across those frames.
 */
export function applyMdOp(doc: MdDoc, op: MdOp, partial = 1, newId?: string): AppliedMdOp | null {
  const index = (id: string) => doc.sections.findIndex((s) => s.id === id);
  const cut = (text: string) => (partial >= 1 ? text : text.slice(0, Math.round(text.length * Math.max(0, partial))));

  switch (op.op) {
    case "replaceSection": {
      const i = index(op.sectionId);
      if (i === -1 || !op.markdown.trim()) return null;
      const s = doc.sections[i];
      const heading = op.heading.trim() && s.headingLine !== null ? headingLineFor(s.level, op.heading) : s.headingLine;
      const lines = s.headingLine === null ? bodyLines(cut(op.markdown), i === doc.sections.length - 1).slice(1) : bodyLines(cut(op.markdown), i === doc.sections.length - 1);
      const sections = doc.sections.map((x, j) => (j === i ? { ...x, headingLine: heading, lines } : x));
      return { doc: { sections }, focus: s.id };
    }
    case "insertSection": {
      if (!op.heading.trim()) return null;
      let at = 1;
      if (op.afterSectionId) {
        const after = index(op.afterSectionId);
        if (after === -1) return null;
        at = after + 1;
      }
      const last = at >= doc.sections.length;
      const before = doc.sections.slice(0, at);
      // The section before needs a blank line between it and the new heading.
      const prev = before[before.length - 1];
      if (prev && prev.lines.length && prev.lines[prev.lines.length - 1].trim()) {
        before[before.length - 1] = { ...prev, lines: [...prev.lines, ""] };
      }
      const level = Number.isInteger(op.level) ? op.level : 2;
      const section: MdSection = {
        id: newId ?? newSectionId(),
        level,
        headingLine: headingLineFor(level, op.heading),
        lines: bodyLines(cut(op.markdown), last),
      };
      return { doc: { sections: [...before, section, ...doc.sections.slice(at)] }, focus: section.id };
    }
    case "deleteSection": {
      const i = index(op.sectionId);
      if (i === -1) return null;
      if (i === 0) return { doc: { sections: [{ ...doc.sections[0], lines: [] }, ...doc.sections.slice(1)] }, focus: null };
      return { doc: { sections: doc.sections.filter((_, j) => j !== i) }, focus: null };
    }
    case "editText": {
      const i = index(op.sectionId);
      if (i === -1 || !op.find) return null;
      const s = doc.sections[i];
      const replacement = cut(op.replace);
      const body = s.lines.join("\n");
      if (body.includes(op.find)) {
        const lines = body.replace(op.find, replacement).split("\n");
        return { doc: { sections: doc.sections.map((x, j) => (j === i ? { ...x, lines } : x)) }, focus: s.id };
      }
      if (s.headingLine?.includes(op.find)) {
        const headingLine = s.headingLine.replace(op.find, replacement);
        return { doc: { sections: doc.sections.map((x, j) => (j === i ? { ...x, headingLine } : x)) }, focus: s.id };
      }
      return null;
    }
  }
}

/** Where an op points before it is applied. */
export function mdOpFocus(doc: MdDoc, op: MdOp): string | null {
  const has = (id: string) => doc.sections.some((s) => s.id === id);
  switch (op.op) {
    case "replaceSection":
    case "deleteSection":
    case "editText":
      return has(op.sectionId) ? op.sectionId : null;
    case "insertSection":
      return op.afterSectionId && has(op.afterSectionId) ? op.afterSectionId : null;
  }
}

/**
 * Which heading on the page a section starts at, counting the document's
 * headings from 0, or -1 for the opening text. The editor draws one heading
 * element per heading line, so this is how a section is found on screen.
 */
export function headingIndex(doc: MdDoc, sectionId: string): number | null {
  let n = -1;
  for (const s of doc.sections) {
    if (s.headingLine !== null) n++;
    if (s.id === sectionId) return s.headingLine === null ? -1 : n;
  }
  return null;
}

export function isMdOp(v: unknown): v is MdOp {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const s = (k: string) => typeof o[k] === "string";
  if (!s("label")) return false;
  switch (o.op) {
    case "replaceSection": return s("sectionId") && s("heading") && s("markdown");
    case "insertSection": return s("afterSectionId") && s("heading") && s("markdown") && typeof o.level === "number";
    case "deleteSection": return s("sectionId");
    case "editText": return s("sectionId") && s("find") && s("replace");
    default: return false;
  }
}
