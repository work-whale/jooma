// A school newsletter as a sheet.
//
// The teacher gives a title, the school's name, a tone and a note for each
// section (a trip, sports day, a thank you), plus two tables that never go to
// the model: celebrations (the pupils being celebrated, their class and why)
// and dates for the diary. The model writes an introduction and each section
// from the notes (app/lib/newsletter-prompt.ts); code builds the two tables.
//
// Pupils' names: each pupil in the celebrations is numbered, the notes are
// sent with "[PUPIL 1]" where their name was, and the document keeps the
// placeholders with the names beside them (doc.roster, app/lib/sheets/roster.ts).
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { scrubRoster } from "./roster";

export interface Celebration {
  name: string;
  className: string;
  reason: string;
}

export interface DiaryDate {
  date: string;
  event: string;
}

export interface NewsletterInfo {
  title?: string;
  schoolName?: string;
  /** yyyy-mm-dd from the date input, or as typed. */
  date?: string;
  celebrations?: Celebration[];
  diary?: DiaryDate[];
}

export const NEWSLETTER_PARTS: { id: string; label: string }[] = [
  { id: "celebrations", label: "Celebrations" },
  { id: "diary", label: "Dates for the diary" },
];

/** The celebrations with a name, in table order: their numbers are
 *  their places in this list, plus one. */
export function celebrated(info: NewsletterInfo): Celebration[] {
  return (info.celebrations ?? []).filter((c) => c.name.trim());
}

/** The names the document swaps in for "[PUPIL n]". */
export function newsletterRoster(info: NewsletterInfo): string[] {
  return celebrated(info).map((c) => c.name.trim());
}

/** A date input's yyyy-mm-dd as "Friday 12 December"; anything else as typed. */
export function diaryDate(v: string, withYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return v.trim();
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** The model's newsletter (complete or mid-stream) as a generic sheet draft. */
export function arrangeNewsletter(raw: unknown, info: NewsletterInfo = {}): Raw {
  const r = obj(undash(raw));
  const roster = newsletterRoster(info);
  const people = celebrated(info);
  // In code, so the table always says [PUPIL n] and the reason never holds a
  // name in the saved copy either.
  const celebrationRows = people.map((c, i) => [`[PUPIL ${i + 1}]`, c.className.trim(), scrubRoster(c.reason.trim(), roster)]);
  const diaryRows = (info.diary ?? []).filter((d) => d.event.trim()).map((d) => [diaryDate(d.date), d.event.trim()]);

  const written: Raw[] = arr(r.sections)
    .map(obj)
    .map((s) => ({ heading: str(s.heading), paragraphs: strs(s.paragraphs) }))
    .filter((s) => s.heading || s.paragraphs.length)
    .map((s, i) => ({ role: "section", title: s.heading || `Section ${i + 1}`, emoji: "", instructions: "", blocks: s.paragraphs.map((p) => ({ type: "text", text: p })) }));

  const sections: Raw[] = [
    { role: "intro", title: "", emoji: "", instructions: "", blocks: strs(r.intro).map((p) => ({ type: "text", text: p })) },
    ...written,
    {
      role: "celebrations",
      title: "Celebrations",
      emoji: "🌟",
      instructions: str(r.celebrationsIntro),
      blocks: celebrationRows.length ? [{ type: "table", headers: ["Name", "Class", "Why"], rows: celebrationRows }] : [],
    },
    { role: "diary", title: "Dates for the diary", emoji: "🗓️", instructions: "", blocks: diaryRows.length ? [{ type: "table", headers: ["Date", "Event"], rows: diaryRows }] : [] },
    ...(str(r.signOff) ? [{ role: "signoff", title: "", emoji: "", instructions: "", blocks: [{ type: "text", text: str(r.signOff) }] }] : []),
  ];

  return {
    title: info.title?.trim() || str(r.title) || "Newsletter",
    objective: "",
    intro: null,
    // The tables wait for the model's writing, so they do not sit alone at
    // the top while it streams.
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0 && (written.length > 0 || (s.role !== "celebrations" && s.role !== "diary"))),
    teacherNotes: [],
  };
}
