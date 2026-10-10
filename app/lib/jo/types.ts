// Ask Jo, the editor: what a turn sends and what comes back.
//
// Jo does not regenerate a document. It answers with a short list of small,
// targeted edits ("ops"), each addressed by a stable id, which the browser
// plays through the editor's own state one at a time. That one choice gives
// the teacher targeted changes, a visible "Jo is working here" moment for each,
// a summary of what changed, and a single undo for the whole turn.

import type { SheetBlock } from "@/app/lib/sheets/types";

/** The kind of document Jo is editing. Each has its own op vocabulary. */
export type JoDocKind = "sheet" | "slides" | "markdown" | "quiz" | "staffSlides";

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

// ── Slide ops ───────────────────────────────────────────────────────────────

/** The words of an AI slide, as its layout knows them (SlideSpec). A list
 *  field (bullets) is one item per line. */
export const SLIDE_TEXT_KEYS = [
  "title",
  "subtitle",
  "subHook",
  "body",
  "bulletsLeadIn",
  "bullets",
  "calloutVariant",
  "calloutLabel",
  "calloutBody",
  "badgeText",
  "blockquoteText",
  "blockquoteAttribution",
  "attribution",
  "statValue",
  "statCaption",
  "twoColLeftTitle",
  "twoColLeftBody",
  "twoColRightTitle",
  "twoColRightBody",
  "col1Title",
  "col1Body",
  "col2Title",
  "col2Body",
  "col3Title",
  "col3Body",
] as const;
export type SlideTextKey = (typeof SLIDE_TEXT_KEYS)[number];

/** Layouts Jo may add a slide in: the deck's own content layouts. Each takes
 *  one picture, found from imageQuery once the slide is in. */
export const ADDABLE_LAYOUTS = [
  "paper-image-right",
  "paper-image-left",
  "paper-banner-image-top",
  "paper-image-right-badge",
  "paper-quote",
] as const;
export type AddableLayout = (typeof ADDABLE_LAYOUTS)[number];

export interface SlideField {
  key: SlideTextKey;
  value: string;
}

/** One text box on a slide with no layout to rebuild from. */
export interface SetSlideTextOp extends OpBase { op: "setSlideText"; slideId: string; textId: string; text: string }
/** New words for an AI slide, rebuilt in its layout and the deck's theme. */
export interface RewriteSlideOp extends OpBase { op: "rewriteSlide"; slideId: string; fields: SlideField[] }
/** `afterSlideId` "" puts it first. */
export interface AddSlideOp extends OpBase {
  op: "addSlide";
  afterSlideId: string;
  layout: AddableLayout;
  fields: SlideField[];
  imageQuery: string;
}
export interface DeleteSlideOp extends OpBase { op: "deleteSlide"; slideId: string }
/** `afterSlideId` "" moves it to the front. */
export interface MoveSlideOp extends OpBase { op: "moveSlide"; slideId: string; afterSlideId: string }
export interface SetThemeOp extends OpBase { op: "setTheme"; themeId: string }

export type SlideOp = SetSlideTextOp | RewriteSlideOp | AddSlideOp | DeleteSlideOp | MoveSlideOp | SetThemeOp;

// ── Markdown ops (the text tools) ──────────────────────────────────────────

/** New text for one section; `heading` "" keeps its heading. */
export interface ReplaceSectionOp extends OpBase { op: "replaceSection"; sectionId: string; heading: string; markdown: string }
/** A new section after afterSectionId ("" for the top), level 1 to 3. */
export interface InsertSectionOp extends OpBase { op: "insertSection"; afterSectionId: string; level: number; heading: string; markdown: string }
export interface DeleteMdSectionOp extends OpBase { op: "deleteSection"; sectionId: string }
/** One phrase in a section changed, for a small edit in a long section. */
export interface EditTextOp extends OpBase { op: "editText"; sectionId: string; find: string; replace: string }

export type MdOp = ReplaceSectionOp | InsertSectionOp | DeleteMdSectionOp | EditTextOp;

// ── List ops (Quiz questions, Staff Slides) ─────────────────────────────────

/** One item (a question or a slide) rewritten whole. */
export interface ReplaceItemOp extends OpBase { op: "replaceItem"; itemId: string; item: unknown }
/** A new item after afterItemId ("" for the start). */
export interface InsertItemOp extends OpBase { op: "insertItem"; afterItemId: string; item: unknown }
export interface DeleteItemOp extends OpBase { op: "deleteItem"; itemId: string }
/** `afterItemId` "" moves it to the start. */
export interface MoveItemOp extends OpBase { op: "moveItem"; itemId: string; afterItemId: string }

export type ListOp = ReplaceItemOp | InsertItemOp | DeleteItemOp | MoveItemOp;

export type JoOp = SheetOp | SlideOp | MdOp | ListOp;

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
