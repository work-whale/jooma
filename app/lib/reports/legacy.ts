// A report saved before the class grid was one pupil's markdown, made from a
// name, a gender, free-text tone and word count, and per subject strengths,
// areas for development and targets. It opens as it was; this seeds the grid
// with that pupil so the teacher can carry on from it. Pure.

import { defaultSettings, newPupil, type Pronouns, type PupilRow, type ReportLength, type ReportSettings, type ReportTone } from "./reports";

interface LegacySubject {
  subject?: unknown;
  strengths?: unknown;
  areasForDevelopment?: unknown;
  targets?: unknown;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function pronounsFromGender(gender: unknown): Pronouns {
  const g = text(gender).toLowerCase();
  return g === "male" ? "he" : g === "female" ? "she" : "they";
}

export function toneFromText(tone: unknown): ReportTone {
  const t = text(tone).toLowerCase();
  if (t.includes("formal")) return "formal";
  if (t.includes("encourag") || t.includes("positive")) return "encouraging";
  if (t.includes("concise") || t.includes("brief") || t.includes("short")) return "concise";
  return "warm";
}

export function lengthFromWords(words: unknown): ReportLength {
  const n = parseInt(String(words ?? ""), 10);
  if (!Number.isFinite(n)) return "standard";
  return n <= 70 ? "short" : n >= 130 ? "long" : "standard";
}

export function legacyReportSeed(input: Record<string, unknown>): { settings: ReportSettings; pupil: PupilRow } {
  const subjects = (Array.isArray(input.subjects) ? (input.subjects as LegacySubject[]) : []).filter((s) => s && typeof s === "object");
  const names = subjects.map((s) => text(s.subject)).filter(Boolean);
  const base = defaultSettings("");
  const settings: ReportSettings = {
    ...base,
    // Several subjects is a primary class teacher's report; one, a subject
    // teacher's. The year group was never asked for, so it stays blank.
    phase: names.length > 1 ? "primary" : "secondary",
    scale: names.length > 1 ? "primary" : "target",
    subjects: names.length ? names : [""],
    tone: toneFromText(input.tone),
    length: lengthFromWords(input.wordCount),
    nextSteps: input.includeTargets === undefined ? true : Boolean(input.includeTargets),
  };
  const note = subjects
    .flatMap((s) => {
      const label = text(s.subject);
      const parts = [text(s.strengths), text(s.areasForDevelopment) && `To develop: ${text(s.areasForDevelopment)}`].filter(Boolean);
      return parts.length ? [`${label ? `${label}: ` : ""}${parts.join(". ")}`] : [];
    })
    .join("\n");
  const nextStep = subjects.map((s) => text(s.targets)).filter(Boolean).join("; ");
  const pupil: PupilRow = { ...newPupil(text(input.name)), pronouns: pronounsFromGender(input.gender), note, nextStep };
  return { settings, pupil };
}
