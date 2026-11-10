// Ask Jo on a class's reports, without a single name reaching the model.
//
// Jo sees the written reports as a numbered list ("r1", "r2"...): each with
// the pupil's pronouns, the judgements and the teacher's note it was written
// from (names scrubbed, as for generation) and the report and next step,
// which already hold "[PUPIL]" where the name goes. A report edited by hand
// can hold a classmate's name, so every one is scrubbed again on the way out.
// What the teacher types to Jo is scrubbed too: "make Amira's warmer" goes as
// "make pupil 1's warmer".
//
// Jo may only rewrite reports: adding, removing or reordering pupils is the
// grid's job. Pure.

import { activeSubjects, type PupilRow, type ReportSettings } from "./reports";
import { nameRegExp, scrubText } from "./privacy";

export interface ReportJoItem {
  pronouns: string;
  /** What the report may say about attainment and effort, and nothing more:
   *  "Maths: Expected standard; effort: Excellent". Read only. */
  judgements: string;
  /** The teacher's note, scrubbed. Read only. */
  note: string;
  /** The report, with "[PUPIL]" for the name. */
  comment: string;
  nextStep: string;
}

/** The pupils Jo works on: those with a written report, in order. */
export function writtenPupils(pupils: PupilRow[]): PupilRow[] {
  return pupils.filter((p) => p.comment.trim());
}

function judgementsText(p: PupilRow, settings: ReportSettings): string {
  const subjects = activeSubjects(settings);
  const parts = subjects.filter((s) => p.attainment[s]).map((s) => `${s}: ${p.attainment[s]}`);
  if (p.effort) parts.push(`effort: ${p.effort}`);
  return parts.length ? parts.join("; ") : "none given";
}

/** The written reports as Jo sees them. */
export function toJoReports(pupils: PupilRow[], settings: ReportSettings): ReportJoItem[] {
  const roster = pupils.map((p) => p.name).filter((n) => n.trim());
  return writtenPupils(pupils).map((p) => ({
    pronouns: p.pronouns === "he" ? "he/him" : p.pronouns === "she" ? "she/her" : "they/them",
    judgements: judgementsText(p, settings),
    note: scrubText(p.note, p.name, roster),
    comment: scrubText(p.comment, p.name, roster),
    nextStep: scrubText(p.target, p.name, roster),
  }));
}

/**
 * Jo's list put back: the n-th written pupil takes the n-th report and next
 * step. Only those two change; Jo cannot touch a judgement or a note. A
 * report Jo left empty keeps what it had, and so does one Jo did not change
 * (`before` is what Jo was shown): otherwise a name the teacher typed into an
 * untouched report would come back as "a classmate".
 */
export function applyJoReports(pupils: PupilRow[], items: ReportJoItem[], before?: ReportJoItem[]): PupilRow[] {
  const written = writtenPupils(pupils);
  const byId = new Map(written.map((p, i) => [p.id, i]));
  return pupils.map((p) => {
    const i = byId.get(p.id);
    const item = i === undefined ? undefined : items[i];
    if (!item || !item.comment.trim()) return p;
    const was = i === undefined ? undefined : before?.[i];
    if (was && was.comment === item.comment && was.nextStep === item.nextStep) return p;
    return { ...p, comment: item.comment.trim(), target: item.nextStep.trim() };
  });
}

/**
 * The teacher's message to Jo with names out: a pupil with a written report
 * becomes "pupil N" (their number in Jo's list), anyone else in the class "a
 * classmate". Longer names first, so "Ann Marie" is not half replaced by "Ann".
 */
export function scrubChat(text: string, pupils: PupilRow[]): string {
  const written = writtenPupils(pupils);
  const number = new Map<string, number>();
  written.forEach((p, i) => {
    const key = p.name.trim().toLowerCase();
    if (key && !number.has(key)) number.set(key, i + 1);
  });
  const names = [...new Set(pupils.map((p) => p.name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const name of names) {
    const n = number.get(name.toLowerCase());
    out = out.replace(nameRegExp(name), n ? `pupil ${n}` : "a classmate");
  }
  return out;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** One report from Jo, or null without a report in it. */
export function normalizeJoReport(raw: unknown): ReportJoItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const comment = str(r.comment);
  if (!comment) return null;
  return { pronouns: str(r.pronouns), judgements: str(r.judgements), note: str(r.note), comment, nextStep: str(r.nextStep) };
}
