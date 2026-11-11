// A cover lesson as a sheet.
//
// In UK schools a cover lesson is set for a class whose teacher is absent,
// and taught by a cover supervisor or supply teacher who is usually not a
// subject specialist. So the plan speaks to that adult: notes before going
// in, a lesson at a glance, each stage with the words to say and what to do,
// and a checklist before leaving. Then a separate pupil task sheet with real
// questions, on a new page with name and date lines, and the answers after it.
//
// The model fills one fixed shape (coverResponseFormat in
// app/lib/cover-prompt.ts); code fits the timings to the lesson
// (fitTimings) and arranges the sections. Pure, free of React and of
// normalize.ts.

import { undash } from "./undash";
import { clockText, fitTimings } from "./lesson";

/** The question kinds a cover task uses: ones any adult can run and mark. */
export const COVER_KINDS = ["mcq", "truefalse", "short", "long", "fillblanks", "matching"] as const;

/** The section that starts the pupil's pages. */
export const COVER_TASK_ROLE = "task";

/** The minutes in a length typed or picked as text: "60 minutes", "1 hour",
 *  "50". Null when there is no number in it. */
export function coverMinutes(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== "string") return null;
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i.exec(v);
  if (hours) {
    // "1 hour 15 minutes": the minutes after the hours.
    const rest = /(\d+)\s*(?:minutes?|mins?)/i.exec(v.slice(hours.index + hours[0].length));
    return Math.round(Number(hours[1]) * 60 + (rest ? Number(rest[1]) : 0));
  }
  const n = /(\d+)/.exec(v);
  return n ? Number(n[1]) : null;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

/**
 * The model's cover lesson (complete or mid-stream) as a generic sheet draft
 * for normalizeDraft. The stages' minutes are fitted to the lesson on every
 * pass, so the times settle as stages arrive and the finished plan adds up.
 */
export function arrangeCover(raw: unknown, minutes: number): Raw {
  // Long dashes out of what the model wrote (app/lib/sheets/undash.ts).
  const r = obj(undash(raw));
  const phases = arr(r.phases).map(obj).filter((p) => str(p.title) || str(p.teacher) || str(p.say));
  const fitted = fitTimings(phases.map((p) => (typeof p.minutes === "number" ? p.minutes : 0)), minutes);
  const phaseBlocks = phases.map((p, i) => ({
    type: "phase",
    stage: p.stage === "starter" || p.stage === "plenary" ? p.stage : "main",
    title: str(p.title),
    minutes: fitted[i],
    say: str(p.say),
    teacher: str(p.teacher),
    pupils: str(p.pupils),
    check: [],
    feedback: "",
    support: "",
    challenge: str(p.challenge),
    ta: "",
  }));

  // The lesson at a glance, from the fitted timings.
  let t = 0;
  const glance = phaseBlocks.map((p) => {
    const row = [`${clockText(t)} to ${clockText(t + p.minutes)}`, p.title, p.pupils];
    t += p.minutes;
    return row;
  });

  const notes = strs(r.notes);
  const checklist = strs(r.checklist);
  const task = obj(r.task);
  const questions = arr(task.questions).filter((q) => q && typeof q === "object");

  const sections: Raw[] = [
    {
      role: "notes",
      title: "Before you go in",
      emoji: "🧭",
      instructions: "",
      blocks: [
        ...(notes.length ? [{ type: "list", title: "Notes for the cover teacher", style: "bullet", items: notes }] : []),
        ...(glance.length ? [{ type: "table", headers: ["Time", "Stage", "What pupils do"], rows: glance }] : []),
      ],
    },
    { role: "lesson", title: "The lesson", emoji: "📘", instructions: "", blocks: phaseBlocks },
    { role: "checklist", title: "Before you leave", emoji: "✅", instructions: "", blocks: checklist.length ? [{ type: "list", title: "", style: "check", items: checklist }] : [] },
    { role: COVER_TASK_ROLE, title: str(task.title) || "Your task", emoji: "✏️", instructions: str(task.instructions), blocks: questions },
  ];

  return {
    title: str(r.title),
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
