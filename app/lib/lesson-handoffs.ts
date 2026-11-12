// "Make slides", "Make a worksheet", "Make a quiz" and "Set homework" on a
// lesson plan.
//
// Each opens the other tool with its form filled in from the plan, through
// the same ?prefill= path the assistant and the timetable use. Every payload
// goes through validatePrefill, so a field the target tool does not take is
// dropped rather than sent, and a link that would open a half-filled form is
// not offered at all.

import { prefillHref, validatePrefill } from "@/app/lib/toolPrefill";
import { SLIDESHOW_YEARS } from "@/app/lib/assistant-tools";
import type { SheetDoc, UnitLesson } from "@/app/lib/sheets/types";
import { PRACTICE_ROLE } from "@/app/lib/sheets/intervention";

export interface LessonHandoff {
  id: "slides" | "worksheet" | "quiz" | "homework" | "modelAnswers" | "practiceWorksheet";
  label: string;
  href: string;
}

/** Prefilled strings are capped at 600 characters by validatePrefill. */
const cap = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The plan's key words, from its keywords table. */
function keywords(doc: SheetDoc): string[] {
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (b.type === "table" && /keyword/i.test(b.headers[0] ?? "")) return b.rows.map((r) => r[0]).filter(Boolean);
    }
  }
  return [];
}

export function lessonHandoffs(doc: SheetDoc): LessonHandoff[] {
  const meta = doc.lesson;
  if (!meta) return [];
  const year = meta.yearGroup && meta.yearGroup !== "Mixed" ? meta.yearGroup : undefined;
  const topic = meta.topic || doc.title;
  const objective = doc.objective || topic;
  const words = keywords(doc);
  const curriculum = { ...(meta.curriculum ? { curriculum: meta.curriculum } : {}), ...(year ? { yearGroup: year } : {}), ...(meta.subject ? { subject: meta.subject } : {}) };

  const candidates: { id: LessonHandoff["id"]; label: string; slug: string; fields: Record<string, string> }[] = [
    {
      id: "slides",
      label: "Make slides",
      slug: "slideshow",
      fields: {
        topic: cap(topic),
        ...(year && (SLIDESHOW_YEARS as readonly string[]).includes(year) ? { year } : {}),
        additionalInstructions: cap([`Learning objective: ${objective}`, words.length ? `Key words: ${words.join(", ")}` : ""].filter(Boolean).join(". ")),
      },
    },
    { id: "worksheet", label: "Make a worksheet", slug: "worksheet-generator", fields: { ...curriculum, learningObjective: cap(objective) } },
    { id: "quiz", label: "Make a quiz", slug: "quiz-generator", fields: { ...curriculum, topic: cap(topic) } },
    // The homework type and length are left to the teacher, as the
    // assistant's prefill leaves them: they are choices, not facts in the plan.
    { id: "homework", label: "Set homework", slug: "homework-generator", fields: { ...curriculum, learningObjective: cap(objective) } },
  ];

  return candidates.flatMap((c) => {
    const prefill = validatePrefill({ slug: c.slug, fields: c.fields });
    return prefill ? [{ id: c.id, label: c.label, href: prefillHref(prefill) }] : [];
  });
}

/**
 * "Plan this lesson" on a row of a unit plan (Topic Map, Term Plan): opens
 * Lesson Plan filled in with the unit's curriculum, year and subject, the
 * lesson as the topic and its objective. Null when the plan does not know its
 * unit (an old run) or the link would not validate.
 */
export function unitLessonHref(doc: SheetDoc, lesson: UnitLesson, index: number): string | null {
  const meta = doc.unit;
  if (!meta) return null;
  const year = meta.yearGroup && meta.yearGroup !== "Mixed" ? meta.yearGroup : undefined;
  const title = lesson.title.trim() || `Lesson ${index + 1}`;
  const topic = meta.topic.trim() ? `${meta.topic.trim()}: ${title}` : title;
  const fields: Record<string, string> = {
    ...(meta.curriculum ? { curriculum: meta.curriculum } : {}),
    ...(year ? { yearGroup: year } : {}),
    ...(meta.subject ? { subject: meta.subject } : {}),
    topic: cap(topic),
    ...(lesson.objective.trim() ? { learningObjective: cap(lesson.objective.trim()) } : {}),
  };
  const prefill = validatePrefill({ slug: "lesson-planner", fields });
  return prefill ? prefillHref(prefill) : null;
}

/**
 * "Write model answers" on an exam paper: opens Model Answers with the paper's
 * questions ready to pick. By the run's id rather than a prefill, so a whole
 * paper fits (a prefill is capped at a few hundred characters a field) and the
 * paper is read back through the teacher's own access to it. Offered once the
 * paper is saved.
 */
export function examHandoffs(doc: SheetDoc, runId: string | null | undefined): LessonHandoff[] {
  if (!doc.exam || !runId) return [];
  return [{ id: "modelAnswers", label: "Write model answers", href: `/tools/model-answer-generator?from=${encodeURIComponent(runId)}` }];
}

/**
 * "Make a practice worksheet" on a set of intervention ideas: opens Worksheets
 * with the plan's curriculum, year and subject, and the practice the strategies
 * call for as the objective. Never the pupil: the link carries the subject and
 * the practice focus only. Empty when the plan has no focus or no curriculum.
 */
export function interventionHandoffs(doc: SheetDoc): LessonHandoff[] {
  if (doc.tool !== "intervention" || !doc.unit) return [];
  const focus = doc.sections
    .find((s) => s.role === PRACTICE_ROLE)
    ?.blocks.find((b) => b.type === "text");
  const objective = focus && focus.type === "text" ? focus.text.replace(/\[PUPIL\]/g, "the pupil").trim() : "";
  if (!objective) return [];
  const meta = doc.unit;
  const year = meta.yearGroup && meta.yearGroup !== "Mixed" ? meta.yearGroup : undefined;
  const fields: Record<string, string> = {
    ...(meta.curriculum ? { curriculum: meta.curriculum } : {}),
    ...(year ? { yearGroup: year } : {}),
    ...(meta.subject ? { subject: meta.subject } : {}),
    learningObjective: cap(objective),
  };
  const prefill = validatePrefill({ slug: "worksheet-generator", fields });
  return prefill ? [{ id: "practiceWorksheet", label: "Make a practice worksheet", href: prefillHref(prefill) }] : [];
}
