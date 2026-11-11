// A unit plan as a sheet: Topic Map and Term Plan.
//
// Both tools plan a sequence of lessons on one topic, so they share one shape:
// the model fills every field of every lesson (objective, starter, input,
// activity, plenary, summary, key knowledge, resources, questions,
// vocabulary), plus a unit overview, assessment points and the unit's key
// vocabulary. Code arranges that into sections. The lessons are one
// `sequence` block, drawn as a landscape table whose columns the teacher turns
// on and off in Design: Topic Map opens with the teaching columns, Term Plan
// with the knowledge columns, and any other column can be shown without asking
// the model again.
//
// Pure, and free of React and of normalize.ts (which imports this through the
// tool registry): it returns raw drafts that normalizeDraft validates.

import { undash } from "./undash";
import type { SheetDoc, UnitLesson } from "./types";

export const MIN_UNIT_LESSONS = 1;
export const MAX_UNIT_LESSONS = 30;
export const DEFAULT_UNIT_LESSONS = 6;

/** A lesson count from a form or a request: whole lessons, in range. */
export function unitLessonCount(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_UNIT_LESSONS;
  return Math.min(MAX_UNIT_LESSONS, Math.max(MIN_UNIT_LESSONS, Math.round(n)));
}

// ── Columns ───────────────────────────────────────────────────────────────

export type UnitField = Exclude<keyof UnitLesson, "title">;

export interface UnitColumn {
  id: UnitField;
  label: string;
  /** Share of the table's width, as a CSS fr weight. */
  weight: number;
  /** Drawn as a list rather than a paragraph. */
  list: boolean;
}

/** Every column a lesson table can show, in table order. The lesson's title
 *  is always the first column and is not in this list. */
export const UNIT_COLUMNS: UnitColumn[] = [
  { id: "objective", label: "Learning objective", weight: 1.3, list: false },
  { id: "summary", label: "Summary of the lesson", weight: 2.4, list: false },
  { id: "starter", label: "Starter", weight: 1.1, list: false },
  { id: "input", label: "Teaching input", weight: 1.4, list: false },
  { id: "activity", label: "Activity", weight: 1.4, list: false },
  { id: "plenary", label: "Plenary", weight: 1.1, list: false },
  { id: "keyKnowledge", label: "Key knowledge", weight: 2.1, list: true },
  { id: "resources", label: "Resources", weight: 1, list: true },
  { id: "questions", label: "Key questions", weight: 1.3, list: true },
  { id: "vocabulary", label: "Key vocabulary", weight: 1, list: true },
];

export const UNIT_COLUMN_IDS = UNIT_COLUMNS.map((c) => c.id);

/** The lesson title column's weight. */
export const LESSON_COLUMN_WEIGHT = 1.1;

export const TOPIC_MAP_COLUMNS: UnitField[] = ["objective", "starter", "input", "activity", "plenary", "resources", "questions", "vocabulary"];
export const TERM_PLAN_COLUMNS: UnitField[] = ["objective", "summary", "keyKnowledge"];

function isUnitField(v: unknown): v is UnitField {
  return typeof v === "string" && (UNIT_COLUMN_IDS as string[]).includes(v);
}

/**
 * The columns a sheet shows, in table order: the teacher's choice from Design,
 * or the tool's defaults. Unknown ids are dropped and the order is always the
 * table's, whatever order they were switched on in.
 */
export function visibleColumns(doc: Pick<SheetDoc, "design">, defaults: UnitField[]): UnitColumn[] {
  const chosen = Array.isArray(doc.design.columns) ? doc.design.columns.filter(isUnitField) : defaults;
  return UNIT_COLUMNS.filter((c) => chosen.includes(c.id));
}

/** A lesson field's text for a cell, a copy or a Word file. Lists are joined
 *  by the caller; this gives the items. */
export function lessonItems(lesson: UnitLesson, field: UnitField): string[] {
  const v = lesson[field];
  return Array.isArray(v) ? v : v ? [v] : [];
}

/** A blank lesson, for "+ Lesson" in the editor. */
export function emptyLesson(): UnitLesson {
  return { title: "New lesson", objective: "", starter: "", input: "", activity: "", plenary: "", summary: "", keyKnowledge: [], resources: [], questions: [], vocabulary: [] };
}

/** "Lesson 3: Rivers in flood", the label the first column and the handoff use. */
export function lessonLabel(lesson: UnitLesson, index: number): string {
  return lesson.title ? `Lesson ${index + 1}: ${lesson.title}` : `Lesson ${index + 1}`;
}

// ── Parts a teacher can switch off ────────────────────────────────────────

/** The unit plan's sections that can be switched off in Design, by role. */
export const UNIT_PARTS: { id: string; label: string }[] = [
  { id: "overview", label: "Unit overview" },
  { id: "assessment", label: "Assessment points" },
  { id: "vocabulary", label: "Key vocabulary" },
];

// ── Arranging the model's draft ───────────────────────────────────────────

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

/**
 * The model's unit draft as a generic sheet draft for normalizeDraft: the
 * overview, the lessons as one sequence block, the assessment points and the
 * unit's vocabulary, each a section with a role so Design can switch it off.
 * Safe on a partial stream: a section appears as soon as it has something in it.
 */
export function arrangeUnit(raw: unknown): Raw {
  // Long dashes out of what the model wrote (app/lib/sheets/undash.ts).
  const r = obj(undash(raw));

  const overview: Raw[] = [];
  if (str(r.overview)) overview.push({ type: "text", text: str(r.overview) });
  const before = strs(r.beforeUnit);
  if (before.length) overview.push({ type: "list", title: "Before this unit", style: "bullet", items: before });
  const after = strs(r.afterUnit);
  if (after.length) overview.push({ type: "list", title: "After this unit", style: "bullet", items: after });

  const lessons = arr(r.lessons).map(obj).filter((l) => str(l.title) || str(l.objective));

  const assessment = arr(r.assessment).map(obj).filter((a) => str(a.when) || str(a.how));
  const vocabulary = strs(r.vocabulary);

  const sections: Raw[] = [
    { role: "overview", title: "Unit overview", emoji: "🧭", instructions: "", blocks: overview },
    { role: "lessons", title: "Lessons", emoji: "📚", instructions: "", blocks: lessons.length ? [{ type: "sequence", lessons }] : [] },
    {
      role: "assessment",
      title: "Assessment points",
      emoji: "✅",
      instructions: "",
      blocks: assessment.length
        ? [{ type: "table", headers: ["When", "How", "What it shows"], rows: assessment.map((a) => [str(a.when), str(a.how), str(a.purpose)]) }]
        : [],
    },
    { role: "vocabulary", title: "Key vocabulary", emoji: "🔤", instructions: "", blocks: vocabulary.length ? [{ type: "wordbank", title: "Key vocabulary", words: vocabulary }] : [] },
  ];

  return {
    title: str(r.title),
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
