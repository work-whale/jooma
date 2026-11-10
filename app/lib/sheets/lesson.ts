// A lesson plan as a sheet.
//
// The model writes one fixed shape (lessonResponseFormat): the objective,
// success criteria, keywords, misconceptions, the phases with their timings,
// a starter and an exit quiz. Code, not the model, arranges that into the
// sections of a page, in one of two layouts:
//
//   three-part  Overview, Starter, Main teaching, Plenary, Assessment,
//               Resources: the classic UK plan.
//   cycles      Overview, Starter quiz, Learning cycle 1 to 3, Exit quiz,
//               Resources: prior knowledge quiz, explain / check / practise /
//               feedback cycles, exit quiz.
//
// Both hold the same blocks, so relayoutLesson can switch a finished plan from
// one to the other without asking the model again, edits included. Sections
// carry a `role` so they can be found again; anything the teacher adds keeps
// its place at the end.
//
// Pure, and free of React and of normalize.ts (which imports this through the
// tool registry): it returns raw drafts that normalizeDraft then validates.

import type { LessonLayout, LessonMeta, PhaseBlock, SheetBlock, SheetDoc, SheetSection } from "./types";

export const LESSON_LAYOUTS: { id: LessonLayout; label: string; description: string }[] = [
  { id: "three-part", label: "UK 3-part", description: "Starter, main teaching and plenary, with timings." },
  { id: "cycles", label: "Learning cycles", description: "Starter quiz, two or three learning cycles, exit quiz." },
];

export const DEFAULT_LESSON_LAYOUT: LessonLayout = "three-part";
export const DEFAULT_LESSON_MINUTES = 60;
export const MIN_LESSON_MINUTES = 20;
export const MAX_LESSON_MINUTES = 180;
/** The shortest a phase is ever given when timings are fitted. */
export const MIN_PHASE_MINUTES = 2;

export function isLessonLayout(v: unknown): v is LessonLayout {
  return v === "three-part" || v === "cycles";
}

/** A lesson length from a form or a request: whole minutes, in range. */
export function lessonMinutes(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LESSON_MINUTES;
  return Math.min(MAX_LESSON_MINUTES, Math.max(MIN_LESSON_MINUTES, Math.round(n)));
}

// ── Timings ───────────────────────────────────────────────────────────────

/**
 * Minutes for each phase that add up to exactly `total`.
 *
 * The model's timings are a good guide but rarely sum to the lesson. Each
 * phase keeps its share, scaled to the total and at least MIN_PHASE_MINUTES;
 * whatever rounding leaves over goes to (or comes from) the longest phases, so
 * starters and plenaries keep the short times they were given. When there are
 * too many phases for every one to get the minimum, each still gets it and the
 * total is exceeded rather than a phase being given no time at all.
 */
export function fitTimings(minutes: number[], total: number): number[] {
  if (minutes.length === 0) return [];
  const asked = minutes.map((m) => (Number.isFinite(m) && m > 0 ? m : 0));
  const sum = asked.reduce((a, b) => a + b, 0);
  // Nothing usable from the model: share the lesson out evenly.
  const weights = sum > 0 ? asked : asked.map(() => 1);
  const weightSum = sum > 0 ? sum : asked.length;
  const out = weights.map((w) => Math.max(MIN_PHASE_MINUTES, Math.round((w / weightSum) * total)));
  let diff = total - out.reduce((a, b) => a + b, 0);
  // Longest first, so a 5 minute starter is not where the difference lands.
  const order = out.map((m, i) => ({ m, i })).sort((a, b) => b.m - a.m || a.i - b.i).map((x) => x.i);
  for (let guard = 0; diff !== 0 && guard < 1000; guard++) {
    let moved = false;
    for (const i of order) {
      if (diff === 0) break;
      if (diff > 0) { out[i]++; diff--; moved = true; }
      else if (out[i] > MIN_PHASE_MINUTES) { out[i]--; diff++; moved = true; }
    }
    if (!moved) break;
  }
  return out;
}

/** Every phase in page order, wherever it sits. */
export function lessonPhases(doc: SheetDoc): PhaseBlock[] {
  return doc.sections.flatMap((s) => s.blocks.filter((b): b is PhaseBlock => b.type === "phase"));
}

/** Each phase's start and end, in minutes from the start of the lesson,
 *  worked out from the phases before it. */
export function phaseClock(doc: SheetDoc): Map<string, { start: number; end: number }> {
  const out = new Map<string, { start: number; end: number }>();
  let t = 0;
  for (const p of lessonPhases(doc)) {
    out.set(p.id, { start: t, end: t + p.minutes });
    t += p.minutes;
  }
  return out;
}

/** "0:08", from minutes. */
export function clockText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** The phases' total against the lesson's length, for the editor's warning.
 *  Null when they agree or the sheet is not a lesson plan. */
export function timingMismatch(doc: SheetDoc): { planned: number; lesson: number } | null {
  if (!doc.lesson) return null;
  const planned = lessonPhases(doc).reduce((a, p) => a + p.minutes, 0);
  return planned === doc.lesson.minutes || planned === 0 ? null : { planned, lesson: doc.lesson.minutes };
}

// ── Arranging the model's draft ───────────────────────────────────────────

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

/** The pieces of a plan, as raw blocks, ready to be put into sections. */
interface LessonParts {
  overview: Raw[];
  starter: Raw[];
  main: Raw[];
  plenary: Raw[];
  starterQuiz: Raw[];
  exitQuiz: Raw[];
  assessment: Raw[];
  resources: Raw[];
}

function quizBlock(q: unknown): Raw | null {
  const r = obj(q);
  const options = strs(r.options);
  if (!str(r.prompt) && options.length === 0) return null;
  const answer = typeof r.answer === "number" ? r.answer : 0;
  return { type: "mcq", prompt: str(r.prompt), options, answers: [answer], marks: 1 };
}

/** The model's draft (complete or mid-stream) as the plan's pieces. */
function partsFromDraft(raw: unknown, minutes: number): LessonParts {
  const r = obj(raw);
  const overview: Raw[] = [];
  const list = (title: string, style: "bullet" | "number" | "check", v: unknown) => {
    const items = strs(v);
    if (items.length) overview.push({ type: "list", title, style, items });
  };
  list("Success criteria", "check", r.successCriteria);
  const keywords = arr(r.keywords).map(obj).filter((k) => str(k.term));
  if (keywords.length) overview.push({ type: "table", headers: ["Keyword", "Meaning"], rows: keywords.map((k) => [str(k.term), str(k.definition)]) });
  list("Prior knowledge", "bullet", r.priorKnowledge);
  list("Key learning points", "number", r.keyLearningPoints);
  const misconceptions = arr(r.misconceptions).map(obj).filter((m) => str(m.misconception));
  if (misconceptions.length) {
    overview.push({ type: "table", headers: ["Common misconception", "How to address it"], rows: misconceptions.map((m) => [str(m.misconception), str(m.response)]) });
  }

  const phases = arr(r.phases).map(obj).filter((p) => str(p.title) || str(p.teacher));
  // Fitted to the lesson on every pass, so mid-stream the times settle as
  // each new phase arrives and the finished plan always adds up.
  const fitted = fitTimings(phases.map((p) => (typeof p.minutes === "number" ? p.minutes : 0)), minutes);
  const parts: LessonParts = { overview, starter: [], main: [], plenary: [], starterQuiz: [], exitQuiz: [], assessment: [], resources: [] };
  phases.forEach((p, i) => {
    const stage = p.stage === "starter" || p.stage === "plenary" ? p.stage : "main";
    parts[stage].push({ ...p, type: "phase", stage, minutes: fitted[i] });
  });
  parts.starterQuiz = arr(r.starterQuiz).map(quizBlock).filter((b): b is Raw => !!b);
  parts.exitQuiz = arr(r.exitQuiz).map(quizBlock).filter((b): b is Raw => !!b);
  const assessment = strs(r.assessment);
  if (assessment.length) parts.assessment.push({ type: "list", title: "Assessment", style: "bullet", items: assessment });
  const resources = strs(r.resources);
  if (resources.length) parts.resources.push({ type: "list", title: "Resources", style: "bullet", items: resources });
  return parts;
}

interface RawSection { title: string; emoji: string; instructions: string; role: string; blocks: Raw[] }

/** Main teaching split into learning cycles: each phase starts one, and any
 *  other block (one the teacher added) stays in the cycle it follows. */
function cycles(main: Raw[]): Raw[][] {
  const out: Raw[][] = [];
  for (const b of main) {
    if (b.type === "phase" || out.length === 0) out.push([b]);
    else out[out.length - 1].push(b);
  }
  return out;
}

/** The plan's pieces as sections, in a layout. Empty sections are left out. */
function sectionsFor(parts: LessonParts, layout: LessonLayout): RawSection[] {
  const s = (role: string, title: string, emoji: string, instructions: string, blocks: Raw[]): RawSection => ({ role, title, emoji, instructions, blocks });
  const out: RawSection[] =
    layout === "cycles"
      ? [
          s("overview", "Overview", "🧭", "", parts.overview),
          s("starter", "Starter quiz", "🚀", "Check the prior knowledge this lesson builds on.", [...parts.starter, ...parts.starterQuiz]),
          ...cycles(parts.main).map((blocks, i) => s("main", `Learning cycle ${i + 1}`, "🔁", "", blocks)),
          s("plenary", "Exit quiz", "🏁", "Check what pupils have learned against the key learning points.", [...parts.plenary, ...parts.exitQuiz]),
          s("assessment", "Assessment", "✅", "", parts.assessment),
          s("resources", "Resources", "🧰", "", parts.resources),
        ]
      : [
          s("overview", "Overview", "🧭", "", parts.overview),
          s("starter", "Starter", "🚀", "", [...parts.starter, ...parts.starterQuiz]),
          s("main", "Main teaching", "📘", "", parts.main),
          s("plenary", "Plenary", "🏁", "", [...parts.plenary, ...parts.exitQuiz]),
          s("assessment", "Assessment", "✅", "", parts.assessment),
          s("resources", "Resources", "🧰", "", parts.resources),
        ];
  return out.filter((sec) => sec.blocks.length > 0);
}

/**
 * The model's lesson draft as a generic sheet draft (title, objective and
 * sections of raw blocks), for normalizeDraft. Safe on a partial stream.
 */
export function arrangeLesson(raw: unknown, meta: Pick<LessonMeta, "layout" | "minutes">): Raw {
  const r = obj(raw);
  const notes = arr(r.teacherNotes).map(obj).map((n) => ({ title: str(n.title), points: strs(n.points) }));
  return {
    title: str(r.title),
    objective: str(r.objective),
    intro: null,
    sections: sectionsFor(partsFromDraft(raw, meta.minutes), meta.layout),
    teacherNotes: notes,
  };
}

// ── Switching layout ──────────────────────────────────────────────────────

/** The plan's pieces read back out of a finished, possibly edited, sheet. */
function partsFromDoc(doc: SheetDoc): { parts: Record<keyof LessonParts, SheetBlock[]>; extra: SheetSection[]; titles: Partial<Record<string, SheetSection>> } {
  const parts: Record<keyof LessonParts, SheetBlock[]> = { overview: [], starter: [], main: [], plenary: [], starterQuiz: [], exitQuiz: [], assessment: [], resources: [] };
  const extra: SheetSection[] = [];
  const titles: Partial<Record<string, SheetSection>> = {};
  for (const sec of doc.sections) {
    const role = sec.role;
    if (!role || !(role in parts) || role === "starterQuiz" || role === "exitQuiz") {
      extra.push(sec);
      continue;
    }
    if (role !== "main") titles[role] ??= sec;
    for (const b of sec.blocks) {
      // In the starter and plenary sections, anything that is not the phase
      // itself (the quiz, or a block the teacher added) travels with it.
      if ((role === "starter" || role === "plenary") && b.type !== "phase") parts[role === "starter" ? "starterQuiz" : "exitQuiz"].push(b);
      else parts[role as keyof LessonParts].push(b);
    }
  }
  return { parts, extra, titles };
}

/**
 * The same plan in another layout. Blocks keep their ids, so the edit history
 * and Jo's references survive; sections the teacher added keep their place at
 * the end. A section whose title the teacher changed keeps that title when its
 * role has the same section in both layouts.
 */
export function relayoutLesson(doc: SheetDoc, layout: LessonLayout): SheetDoc {
  if (!doc.lesson || doc.lesson.layout === layout) return doc;
  const { parts, extra, titles } = partsFromDoc(doc);
  const raw = sectionsFor(parts as unknown as LessonParts, layout);
  // Section titles that differ between the layouts take the new layout's;
  // the others keep whatever the teacher called them.
  const differs = new Set(["starter", "main", "plenary"]);
  const sections: SheetSection[] = raw.map((r, i) => {
    const kept = !differs.has(r.role) ? titles[r.role] : undefined;
    return {
      id: kept?.id ?? `l${layout === "cycles" ? "c" : "t"}${i}`,
      title: kept?.title ?? r.title,
      emoji: kept?.emoji ?? r.emoji,
      instructions: kept?.instructions ?? r.instructions,
      role: r.role,
      blocks: r.blocks as unknown as SheetBlock[],
    };
  });
  return { ...doc, lesson: { ...doc.lesson, layout }, sections: [...sections, ...extra] };
}

// ── How a phase reads ─────────────────────────────────────────────────────

/** The fields of a phase that hold words, in the order they are shown. */
export type PhaseField = "teacher" | "pupils" | "check" | "feedback" | "support" | "challenge" | "ta";
export const PHASE_FIELDS: PhaseField[] = ["teacher", "pupils", "check", "feedback", "support", "challenge", "ta"];

/** What a phase's stage is called in a layout. */
export function stageLabel(stage: PhaseBlock["stage"], layout: LessonLayout | undefined): string {
  if (layout === "cycles") return stage === "starter" ? "Starter quiz" : stage === "plenary" ? "Exit quiz" : "Learning cycle";
  return stage === "starter" ? "Starter" : stage === "plenary" ? "Plenary" : "Main";
}

/** What each field of a phase is called. A learning cycle reads explain,
 *  check, practise, feedback. */
export function phaseFieldLabel(field: PhaseField, stage: PhaseBlock["stage"], layout: LessonLayout | undefined): string {
  const cycle = layout === "cycles" && stage === "main";
  switch (field) {
    case "teacher": return cycle ? "Explain" : "Teacher";
    case "pupils": return cycle ? "Practise" : "Pupils";
    case "check": return cycle ? "Check for understanding" : "Checking understanding";
    case "feedback": return "Feedback";
    case "support": return "Support";
    case "challenge": return "Challenge";
    case "ta": return "Teaching assistant";
  }
}

/** A phase's fields that have something in them, labelled, for the Word file
 *  and Copy. */
export function phaseRows(p: PhaseBlock, layout: LessonLayout | undefined): { field: PhaseField; label: string; text: string; items: string[] }[] {
  return PHASE_FIELDS.map((field) => ({
    field,
    label: phaseFieldLabel(field, p.stage, layout),
    text: field === "check" ? "" : p[field],
    items: field === "check" ? p.check : [],
  })).filter((r) => r.text || r.items.length);
}
