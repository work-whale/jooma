// Keeping several pupils' names away from the model: a newsletter's
// celebrations.
//
// The teacher types the pupils into a table (name, class, why). Each pupil is
// numbered in table order, and anywhere their name appears in the notes it is
// sent as "[PUPIL 1]", "[PUPIL 2]" and so on. The saved document keeps the
// placeholders, with the names beside it in `doc.roster`, which no model
// request carries; the page, Print, PDF and Word swap the names back in
// (withPupilName in app/lib/sheets/pupil.ts). Ask Jo therefore sees
// placeholders only.
//
// Best effort, and the form says so: a name typed into the notes that is not
// in the table, or a surname when only a first name is in the table, is not
// caught.
//
// Pure: read by the form, the sheet and the unit tests.

import { nameRegExp } from "@/app/lib/reports/privacy";

/** "[PUPIL 3]" for the third pupil in the table. */
export function rosterPlaceholder(n: number): string {
  return `[PUPIL ${n}]`;
}

const PLACEHOLDER_RE = /\[PUPIL (\d{1,3})\]/g;

/** The names worth looking for: each pupil's name as typed and each part of
 *  it of two letters or more, with its number, longest first so "Amira Khan"
 *  is replaced whole before "Amira". */
function rosterParts(roster: string[]): { part: string; n: number }[] {
  const out: { part: string; n: number }[] = [];
  const seen = new Set<string>();
  roster.forEach((raw, i) => {
    const whole = raw.trim().replace(/\s+/g, " ");
    if (!whole) return;
    for (const part of [whole, ...whole.split(" ")]) {
      const key = part.toLowerCase();
      if (part.replace(/[^\p{L}]/gu, "").length < 2 || seen.has(key)) continue;
      seen.add(key);
      out.push({ part, n: i + 1 });
    }
  });
  return out.sort((a, b) => b.part.length - a.part.length);
}

/** `text` with every pupil in the roster as their numbered placeholder. A
 *  name shared by two pupils goes to the first. */
export function scrubRoster(text: string, roster: string[]): string {
  let out = text;
  for (const { part, n } of rosterParts(roster)) out = out.replace(nameRegExp(part), rosterPlaceholder(n));
  return out;
}

/** The names put back as typed in the table; a number with no pupil (a
 *  placeholder the model invented) reads "a pupil". */
export function swapRoster(text: string, roster: string[]): string {
  return text.replace(PLACEHOLDER_RE, (_, d: string) => roster[parseInt(d, 10) - 1]?.trim() || "a pupil");
}

/** Whether a string holds any numbered placeholder. */
export function hasRosterPlaceholder(text: string): boolean {
  return /\[PUPIL \d{1,3}\]/.test(text);
}
