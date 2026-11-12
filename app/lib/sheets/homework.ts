// Homework as a sheet.
//
// A pupil takes this home, so it reads like a worksheet with a little more
// guidance: what to do, a "Remember" box with the key words, the task, and a
// "How did I do?" checklist to tick before handing it in. The answers page
// is the sheet's own, switched on when the teacher asked for answers.
//
// The task depends on the homework type. Question types (worksheet-style,
// exam-style, reading, mixed, short written) are questions pupils answer on
// the sheet. Project types (creative, practical, research) are a brief: the
// steps to follow and what a good piece of work includes, with at most a
// couple of questions to reflect on.
//
// The model fills one fixed shape (homeworkResponseFormat in
// app/lib/homework-prompt.ts); code arranges it. Pure, free of React,
// normalize.ts and schema.ts.

import { undash } from "./undash";

/** The homework types the form offers. */
export const HOMEWORK_TYPES = [
  "Worksheet-style questions",
  "Short written task",
  "Creative task",
  "Practical investigation",
  "Research homework",
  "Reading comprehension",
  "Mixed tasks",
  "Exam-style practice",
] as const;

/** Types whose task is a brief to follow rather than questions to answer. */
export const PROJECT_TYPES: readonly string[] = ["Creative task", "Practical investigation", "Research homework"];

export function isProjectType(type: string | undefined): boolean {
  return !!type && PROJECT_TYPES.includes(type);
}

/** The minutes in a length option: "Standard task (20 minutes)" is 20. Null
 *  when there is no number in it. */
export function homeworkMinutes(length: unknown): number | null {
  if (typeof length !== "string") return null;
  const m = /(\d+)\s*min/i.exec(length);
  return m ? Number(m[1]) : null;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/**
 * The model's homework (complete or mid-stream) as a generic sheet draft for
 * normalizeDraft. A part with nothing in it yet is left out.
 */
export function arrangeHomework(raw: unknown): Raw {
  const r = obj(undash(raw));
  const remember = obj(r.remember);
  const keyWords = arr(remember.keyWords)
    .map(obj)
    .map((k) => ({ term: str(k.term), meaning: str(k.meaning) }))
    .filter((k) => k.term);
  const reminder = str(remember.reminder);
  const task = obj(r.task);
  const stimulus = obj(task.stimulus);
  const paragraphs = strs(stimulus.paragraphs);
  const steps = strs(task.steps);
  const criteria = strs(task.successCriteria);
  const questions = arr(task.questions).filter((q) => q && typeof q === "object");
  const checklist = strs(r.checklist);

  const sections: Raw[] = [
    {
      role: "instructions",
      title: "What to do",
      emoji: "📝",
      instructions: "",
      blocks: str(r.instructions) ? [{ type: "text", text: str(r.instructions) }] : [],
    },
    {
      role: "remember",
      title: "Remember",
      emoji: "💡",
      instructions: "",
      blocks: [
        ...(keyWords.length ? [{ type: "list", title: "Key words", style: "bullet", items: keyWords.map((k) => (k.meaning ? `**${k.term}**: ${k.meaning}` : `**${k.term}**`)) }] : []),
        ...(reminder ? [{ type: "callout", variant: "remember", label: "Remember", emoji: "💡", text: reminder }] : []),
      ],
    },
    {
      role: "task",
      title: str(task.title) || "Your task",
      emoji: "✏️",
      instructions: str(task.instructions),
      blocks: [
        ...(paragraphs.length ? [{ type: "passage", title: str(stimulus.title), paragraphs }] : []),
        ...(steps.length ? [{ type: "list", title: "Steps to follow", style: "number", items: steps }] : []),
        ...(criteria.length ? [{ type: "list", title: "A great piece of work will", style: "check", items: criteria }] : []),
        ...questions,
      ],
    },
    {
      role: "checklist",
      title: "How did I do?",
      emoji: "✅",
      instructions: checklist.length ? "Tick each one before you hand your homework in." : "",
      blocks: checklist.length ? [{ type: "list", title: "", style: "check", items: checklist }] : [],
    },
  ];

  return {
    title: str(r.title),
    objective: str(r.objective),
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: arr(r.teacherNotes).map(obj).filter((n) => str(n.title)),
  };
}
