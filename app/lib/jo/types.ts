// Ask Jo, the editor: what a turn sends and what comes back.
//
// Jo does not regenerate a document. It answers with a short list of small,
// targeted edits ("ops"), each addressed by a stable id, which the browser
// plays through the editor's own state one at a time. That one choice gives
// the teacher targeted changes, a visible "Jo is working here" moment for each,
// a summary of what changed, and a single undo for the whole turn.

import type { SheetBlock } from "@/app/lib/sheets/types";

/** The kind of document Jo is editing. Each has its own op vocabulary. */
export type JoDocKind = "sheet";

/** A follow up question, asked instead of editing when a request is vague. */
export interface JoClarify {
  question: string;
  options: string[];
  /** More than one option may be ticked. */
  multi: boolean;
}

// ── Sheet ops ───────────────────────────────────────────────────────────────

/** Every op carries a short, teacher facing label: "Simplifying question 3". */
interface OpBase {
  label: string;
}

/**
 * Replace one piece of text.
 *
 * `target` is a path: "title", "objective", "intro", "<sectionId>.title",
 * "<sectionId>.instructions", "<blockId>.<field>" for a text field, or
 * "<blockId>.<listField>.<n>" for one item of a list (a passage paragraph, a
 * multiple choice option, a true or false statement).
 */
export interface SetTextOp extends OpBase { op: "setText"; target: string; text: string }
export interface ReplaceBlockOp extends OpBase { op: "replaceBlock"; blockId: string; block: unknown }
/** `afterBlockId` "" puts it first in the section. */
export interface InsertBlockOp extends OpBase { op: "insertBlock"; sectionId: string; afterBlockId: string; block: unknown }
export interface DeleteBlockOp extends OpBase { op: "deleteBlock"; blockId: string }
/** `afterSectionId` "" puts it first. */
export interface AddSectionOp extends OpBase {
  op: "addSection";
  afterSectionId: string;
  title: string;
  emoji: string;
  instructions: string;
  blocks: unknown[];
}
export interface DeleteSectionOp extends OpBase { op: "deleteSection"; sectionId: string }
export interface SetDesignOp extends OpBase {
  op: "setDesign";
  key: "fontScale" | "answers" | "nameDate" | "lineNumbers" | "paper";
  value: string;
}

export type SheetOp =
  | SetTextOp
  | ReplaceBlockOp
  | InsertBlockOp
  | DeleteBlockOp
  | AddSectionOp
  | DeleteSectionOp
  | SetDesignOp;

export type JoOp = SheetOp;

/** A model's whole answer for one turn, in the order it streams. */
export interface JoResponse {
  reply: string;
  clarify: JoClarify | null;
  ops: JoOp[];
  summary: string;
}

/** What the browser sends for one turn. */
export interface JoTurnBody {
  kind: JoDocKind;
  /** A compact view of the document: ids and text, no layout. */
  snapshot: unknown;
  /** Where the teacher is now, e.g. the block they last touched. */
  focus?: string | null;
  messages: { role: "user" | "assistant"; content: string }[];
  /** Follow up questions already asked for this request. */
  askCount?: number;
  /** Guests only: the free try being edited. */
  trialId?: string;
  /** Guests only: the honeypot. */
  website?: string;
}

/** Re-exported for the op appliers. */
export type { SheetBlock };
