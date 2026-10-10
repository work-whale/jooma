// Jo's edits to a list document: a quiz's questions or a Staff Slides deck's
// slides. Both are an ordered list of items drawn as cards, so they share one
// op vocabulary; what an item may hold is checked per tool, the same way the
// generators check what the model sends them.

import type { QuizQuestion } from "@/app/api/quiz-generator/route";
import type { SlideData } from "@/app/api/cpd-slideshow/route";
import type { ListOp } from "./types";

export type ListTool = "quiz" | "staffSlides";

export interface ListItem<T> {
  id: string;
  value: T;
}

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+$/, "").trim() : "");

/** A question with four options and one right answer, or null. */
export function normalizeQuizQuestion(raw: unknown): QuizQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const question = str(r.question);
  const options = Array.isArray(r.options) ? r.options.map(str) : [];
  if (!question || options.length !== 4 || options.some((o) => !o)) return null;
  const correct = typeof r.correctIndex === "number" && Number.isInteger(r.correctIndex) ? r.correctIndex : -1;
  if (correct < 0 || correct > 3) return null;
  return { question, options: options as [string, string, string, string], correctIndex: correct };
}

const SLIDE_TYPES: SlideData["type"][] = ["title", "content", "quote", "stat", "two-column", "activity"];
const CALLOUTS = ["key-point", "reflection", "try-this", "discussion"] as const;

/** A Staff Slides slide, keeping only the fields its type uses, or null. */
export function normalizeStaffSlide(raw: unknown, presentationTitle: string): SlideData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const type = SLIDE_TYPES.find((t) => t === r.type);
  const title = str(r.title);
  if (!type || !title) return null;
  const slide: SlideData = { type, title, presentationTitle };
  const keep = (key: keyof SlideData) => {
    const v = str(r[key]);
    if (v) (slide as unknown as Raw)[key] = v;
  };
  for (const key of ["subtitle", "body", "imageSuggestion", "quote", "quoteAuthor", "stat", "statLabel", "statContext", "leftTitle", "leftContent", "rightTitle", "rightContent", "activityPrompt", "activitySubtask"] as const) {
    keep(key);
  }
  const bullets = Array.isArray(r.bullets) ? r.bullets.map(str).filter(Boolean) : [];
  if (bullets.length) slide.bullets = bullets;
  const c = r.callout as Raw | null | undefined;
  const calloutType = c && CALLOUTS.find((t) => t === c.type);
  if (calloutType && str(c!.text)) slide.callout = { type: calloutType, text: str(c!.text) };
  return slide;
}

export function normalizeListItem(tool: ListTool, raw: unknown, items: ListItem<unknown>[]): unknown | null {
  if (tool === "quiz") return normalizeQuizQuestion(raw);
  const deckTitle = (items[0]?.value as SlideData | undefined)?.presentationTitle ?? "";
  return normalizeStaffSlide(raw, deckTitle);
}

/** Ids for a turn: q1, q2... for questions, s1, s2... for slides. */
export function toListItems<T>(tool: ListTool, values: T[]): ListItem<T>[] {
  const prefix = tool === "quiz" ? "q" : "s";
  return values.map((value, i) => ({ id: `${prefix}${i + 1}`, value }));
}

export function listSnapshot(tool: ListTool, items: ListItem<unknown>[]) {
  return { tool, items: items.map((it, i) => ({ id: it.id, number: i + 1, ...(it.value as object) })) };
}

let fresh = 0;
const newItemId = () => `n${Date.now().toString(36)}${(fresh++).toString(36)}`;

export interface AppliedListOp<T> {
  items: ListItem<T>[];
  focus: string | null;
}

/** One op applied, or null when it does not fit. `newId` keeps an inserted
 *  item's id the same across the typing frames. */
export function applyListOp<T>(tool: ListTool, items: ListItem<T>[], op: ListOp, newId?: string): AppliedListOp<T> | null {
  const index = (id: string) => items.findIndex((it) => it.id === id);
  switch (op.op) {
    case "replaceItem": {
      const i = index(op.itemId);
      const value = i === -1 ? null : (normalizeListItem(tool, op.item, items as ListItem<unknown>[]) as T | null);
      if (i === -1 || !value) return null;
      return { items: items.map((it, j) => (j === i ? { ...it, value } : it)), focus: op.itemId };
    }
    case "insertItem": {
      const value = normalizeListItem(tool, op.item, items as ListItem<unknown>[]) as T | null;
      if (!value) return null;
      let at = items.length;
      if (op.afterItemId === "") at = 0;
      else if (index(op.afterItemId) !== -1) at = index(op.afterItemId) + 1;
      const item = { id: newId ?? newItemId(), value };
      return { items: [...items.slice(0, at), item, ...items.slice(at)], focus: item.id };
    }
    case "deleteItem": {
      const i = index(op.itemId);
      if (i === -1 || items.length <= 1) return null;
      return { items: items.filter((_, j) => j !== i), focus: null };
    }
    case "moveItem": {
      const i = index(op.itemId);
      if (i === -1) return null;
      const moving = items[i];
      const rest = items.filter((_, j) => j !== i);
      let at = 0;
      if (op.afterItemId) {
        const after = rest.findIndex((it) => it.id === op.afterItemId);
        if (after === -1) return null;
        at = after + 1;
      }
      return { items: [...rest.slice(0, at), moving, ...rest.slice(at)], focus: op.itemId };
    }
  }
}

export function listOpFocus(items: ListItem<unknown>[], op: ListOp): string | null {
  const has = (id: string) => items.some((it) => it.id === id);
  switch (op.op) {
    case "replaceItem":
    case "deleteItem":
    case "moveItem":
      return has(op.itemId) ? op.itemId : null;
    case "insertItem":
      return op.afterItemId && has(op.afterItemId) ? op.afterItemId : null;
  }
}

/** The text that types itself in, per tool: a question's stem, a slide's title. */
export function typedField(tool: ListTool): "question" | "title" {
  return tool === "quiz" ? "question" : "title";
}

export function isListOp(v: unknown): v is ListOp {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const s = (k: string) => typeof o[k] === "string";
  if (!s("label")) return false;
  switch (o.op) {
    case "replaceItem": return s("itemId") && !!o.item && typeof o.item === "object";
    case "insertItem": return s("afterItemId") && !!o.item && typeof o.item === "object";
    case "deleteItem": return s("itemId");
    case "moveItem": return s("itemId") && s("afterItemId");
    default: return false;
  }
}
