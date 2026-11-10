// "Make slides", "Make a worksheet" and "Make a quiz" on a lesson plan.
//
// Each opens the other tool with its form filled in from the plan, through
// the same ?prefill= path the assistant and the timetable use. Every payload
// goes through validatePrefill, so a field the target tool does not take is
// dropped rather than sent, and a link that would open a half-filled form is
// not offered at all.

import { prefillHref, validatePrefill } from "@/app/lib/toolPrefill";
import { SLIDESHOW_YEARS } from "@/app/lib/assistant-tools";
import type { SheetDoc } from "@/app/lib/sheets/types";

export interface LessonHandoff {
  id: "slides" | "worksheet" | "quiz";
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
  ];

  return candidates.flatMap((c) => {
    const prefill = validatePrefill({ slug: c.slug, fields: c.fields });
    return prefill ? [{ id: c.id, label: c.label, href: prefillHref(prefill) }] : [];
  });
}
