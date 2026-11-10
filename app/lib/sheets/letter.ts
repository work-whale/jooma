// Letters home, as designed pages (a sheet with `doc.letter`).
//
// The model writes only what needs writing: the "Re:" line and the
// paragraphs. Everything with a fixed right answer is built here instead, so
// it is never wrong and never invented: the date, "Dear Parents and Carers,",
// the sign-off that goes with it, a trip's details table and the tear-off
// consent slip.
//
// A letter about one child (attendance, behaviour) never sends the child's
// name: the facts go to the model with "[PUPIL]" (app/lib/reports/privacy.ts)
// and the name is put back in the browser as the letter arrives.
//
// Pure: read by the route, the stream reader and the renderers alike.

import { PLACEHOLDER, scrubText, swapIn } from "@/app/lib/reports/privacy";
import type { LetterMeta, ReplySlip } from "./types";

export const LETTER_TYPES = [
  { id: "trip", label: "Trip or visit", hint: "Details table and a consent slip" },
  { id: "attendance", label: "Attendance", hint: "About one child's attendance" },
  { id: "behaviour", label: "Behaviour", hint: "About one incident" },
  { id: "general", label: "General", hint: "Anything else" },
] as const;
export type LetterType = (typeof LETTER_TYPES)[number]["id"];

export function isLetterType(v: unknown): v is LetterType {
  return typeof v === "string" && LETTER_TYPES.some((t) => t.id === v);
}

export const LETTER_TONES = ["Formal", "Semi-formal", "Informal"] as const;
export type LetterTone = (typeof LETTER_TONES)[number];

export function letterTone(v: unknown): LetterTone {
  return (LETTER_TONES as readonly string[]).includes(v as string) ? (v as LetterTone) : "Semi-formal";
}

/** A letter about one child: the child's name is never sent. */
export function aboutOneChild(type: LetterType): boolean {
  return type === "attendance" || type === "behaviour";
}

/** The facts for each type, in the order they are asked for and printed. */
export const LETTER_FIELDS: Record<LetterType, { key: string; label: string; kind?: "date" | "time" | "long" }[]> = {
  trip: [
    { key: "group", label: "Who is going" },
    { key: "destination", label: "Where" },
    { key: "tripDate", label: "Date of the trip", kind: "date" },
    { key: "leave", label: "Leaving school", kind: "time" },
    { key: "back", label: "Back at school", kind: "time" },
    { key: "cost", label: "Cost" },
    { key: "payment", label: "How to pay" },
    { key: "kit", label: "What to bring" },
    { key: "lunch", label: "Lunch" },
    { key: "consentBy", label: "Reply by", kind: "date" },
    { key: "purpose", label: "Why we are going", kind: "long" },
  ],
  attendance: [
    { key: "period", label: "Period" },
    { key: "attendance", label: "Attendance" },
    { key: "concern", label: "The concern", kind: "long" },
    { key: "support", label: "Support offered", kind: "long" },
    { key: "meeting", label: "Meeting" },
  ],
  behaviour: [
    { key: "incidentDate", label: "Date of the incident", kind: "date" },
    { key: "account", label: "What happened", kind: "long" },
    { key: "action", label: "Action taken", kind: "long" },
    { key: "support", label: "Support offered", kind: "long" },
    { key: "meeting", label: "Meeting" },
  ],
  general: [{ key: "content", label: "What the letter needs to say", kind: "long" }],
};

export type LetterFacts = Record<string, string>;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2027-03-12" as "12 March 2027" (with the weekday, "Friday 12 March
 *  2027"). Read as a calendar date, so no time zone can move it a day.
 *  Anything else comes back as it was typed. */
export function formatLetterDate(iso: string, weekday = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso.trim();
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return iso.trim();
  const day = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${weekday ? `${day} ` : ""}${d} ${MONTHS[mo - 1]} ${y}`;
}

/** "08:45" as "8.45am", the way UK schools write times. */
export function formatLetterTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value.trim();
  const h = Number(m[1]);
  if (h > 23) return value.trim();
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === "00" ? `${h12}${suffix}` : `${h12}.${m[2]}${suffix}`;
}

/** One fact as it is printed: dates and times in UK style. */
export function factValue(type: LetterType, key: string, value: string): string {
  const field = LETTER_FIELDS[type].find((f) => f.key === key);
  if (field?.kind === "date") return formatLetterDate(value, true);
  if (field?.kind === "time") return formatLetterTime(value);
  return value.trim();
}

const PARENTS_AND_CARERS = /^parents?\s*(?:and|&|\/)\s*carers?\b/i;

/**
 * The salutation, built rather than written so it is always right:
 * a named recipient ("Dear Mrs Khan,"), the parent of one child
 * ("Dear Parent/Carer,"), "Dear Parents and Carers," however that was typed,
 * "Dear Sir or Madam," when nobody is named, otherwise the recipient as typed
 * with a capital letter.
 */
export function salutationFor(o: { recipient: string; recipientName?: string; type: LetterType }): string {
  const name = o.recipientName?.trim();
  if (name) return `Dear ${name},`;
  if (aboutOneChild(o.type)) return "Dear Parent/Carer,";
  const r = o.recipient.trim().replace(/[,.]+$/, "");
  if (!r || /^(sir|madam|sir or madam|sir\/madam)$/i.test(r)) return "Dear Sir or Madam,";
  if (PARENTS_AND_CARERS.test(r)) return `Dear ${r.replace(PARENTS_AND_CARERS, "Parents and Carers")},`;
  return `Dear ${r.charAt(0).toUpperCase()}${r.slice(1)},`;
}

/**
 * The sign-off that goes with the salutation and tone: "Kind regards," for
 * an informal letter, "Yours faithfully," after "Dear Sir or Madam," and
 * "Yours sincerely," after anything else. That is UK school practice: a
 * letter to "Parents and Carers" is signed "Yours sincerely".
 */
export function signOffFor(salutation: string, tone: LetterTone): string {
  if (tone === "Informal") return "Kind regards,";
  if (/^Dear Sir or Madam,?$/i.test(salutation.trim())) return "Yours faithfully,";
  return "Yours sincerely,";
}

/** A trip's details as table rows, empty ones left out. */
export function tripDetails(facts: LetterFacts): string[][] {
  const order = ["destination", "tripDate", "leave", "back", "cost", "payment", "kit", "lunch", "consentBy"];
  return order
    .map((key) => {
      const value = facts[key]?.trim();
      if (!value) return null;
      const label = LETTER_FIELDS.trip.find((f) => f.key === key)!.label;
      return [label, factValue("trip", key, value)];
    })
    .filter((r): r is string[] => !!r);
}

/** A trip letter's tear-off consent slip. Null for every other letter. */
export function replySlipFor(type: LetterType, facts: LetterFacts): ReplySlip | null {
  if (type !== "trip") return null;
  const where = facts.destination?.trim();
  const when = facts.tripDate?.trim() ? factValue("trip", "tripDate", facts.tripDate) : "";
  const cost = facts.cost?.trim();
  const statement =
    `I give permission for my child to go on the trip${where ? ` to ${where}` : ""}${when ? ` on ${when}` : ""}.` +
    (cost ? ` I understand the cost is ${cost}.` : "");
  return {
    title: where ? `Consent slip: ${where}` : "Consent slip",
    statement,
    fields: ["Child's name", "Class", "Medical needs or allergies", "Emergency contact number", "Parent or carer's name", "Signature", "Date"],
    returnBy: facts.consentBy?.trim() ? factValue("trip", "consentBy", facts.consentBy) : "",
  };
}

/** What the form knows about a letter beyond its facts. Kept in the browser:
 *  names never go to the model. */
export interface LetterInfo {
  type: LetterType;
  /** "2026-11-10". */
  date: string;
  recipient: string;
  recipientName?: string;
  tone: LetterTone;
  senderName?: string;
  senderRole?: string;
  school?: string;
  /** The child an attendance or behaviour letter is about. */
  pupil?: string;
  facts: LetterFacts;
}

export function letterMetaFor(info: LetterInfo): LetterMeta {
  const salutation = salutationFor(info);
  return {
    type: info.type,
    date: info.date,
    salutation,
    signOff: signOffFor(salutation, info.tone),
    senderName: info.senderName?.trim() ?? "",
    senderRole: info.senderRole?.trim() ?? "",
    school: info.school?.trim() ?? "",
    pupil: aboutOneChild(info.type) ? info.pupil?.trim() ?? "" : "",
    slip: replySlipFor(info.type, info.facts),
  };
}

/** The facts as the model is sent them: labelled, dates in UK style, and the
 *  child's name taken out of a letter about one child. Empty facts are left
 *  out, so the model cannot be told a blank. */
export function factsForModel(type: LetterType, facts: LetterFacts, pupil = ""): { label: string; value: string }[] {
  return LETTER_FIELDS[type]
    .map((f) => {
      const raw = facts[f.key]?.trim();
      if (!raw) return null;
      const value = factValue(type, f.key, raw);
      return { label: f.label, value: aboutOneChild(type) && pupil.trim() ? scrubText(value, pupil, []) : value };
    })
    .filter((f): f is { label: string; value: string } => !!f);
}

/**
 * The model's letter ({ subject, paragraphs }) as the generic sheet draft:
 * the subject is the title (the "Re:" line), the paragraphs one untitled
 * section of text blocks, and a trip's details table after the first
 * paragraph. The child's name goes back in here, in the browser.
 */
export function arrangeLetter(raw: unknown, info: LetterInfo | undefined): unknown {
  const r = (raw && typeof raw === "object" ? raw : {}) as { subject?: unknown; paragraphs?: unknown };
  const pupil = info && aboutOneChild(info.type) ? info.pupil?.trim() ?? "" : "";
  const put = (s: string) => (pupil ? swapIn(s, pupil) : s.split(PLACEHOLDER).join("your child"));
  const paragraphs = (Array.isArray(r.paragraphs) ? r.paragraphs : []).filter((p): p is string => typeof p === "string" && !!p.trim()).map((p) => put(p.trim()));
  const blocks: unknown[] = paragraphs.map((text) => ({ type: "text", text }));
  // After the first paragraph, so it waits for one while the letter streams
  // in rather than landing at the top.
  if (info?.type === "trip" && blocks.length) {
    const rows = tripDetails(info.facts);
    if (rows.length) blocks.splice(1, 0, { type: "table", headers: ["Trip details", ""], rows });
  }
  return {
    title: typeof r.subject === "string" ? put(r.subject.trim()) : "",
    sections: blocks.length ? [{ title: "", blocks }] : [],
  };
}
