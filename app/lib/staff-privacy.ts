// Keeping a member of staff's name away from the model.
//
// An ECT report is about one named early career teacher. The report needs
// their strengths and next steps, not their name, so the browser replaces the
// name (whole, and each part of it on its own) with "[ECT]" in everything it
// sends, and puts the name back into what comes back. The route refuses a
// request that carries a name key, so a name can only reach the model if the
// teacher types it somewhere the scrub does not know about (a colleague's
// name, a nickname), which the form says.
//
// The same pair keeps Ask Jo and Refine on the placeholder: they are handed
// the scrubbed document and their edits are swapped back before they land.
//
// Pure: read by the form, the Jo panel and the unit tests.

import { nameRegExp } from "@/app/lib/reports/privacy";

export const ECT_PLACEHOLDER = "[ECT]";

/** The whole name and each part of it, longest first, so "Sarah Johnson" is
 *  replaced whole before "Sarah" is looked for on its own. Parts of one letter
 *  ("J") are skipped: they would eat ordinary words. */
export function nameParts(full: string): string[] {
  const whole = full.trim().replace(/\s+/g, " ");
  if (!whole) return [];
  const parts = whole.split(" ").filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2);
  return [...new Set([whole, ...parts])].sort((a, b) => b.length - a.length);
}

/** `text` with the name, and every part of it, as the placeholder. */
export function scrubStaffName(text: string, full: string, placeholder = ECT_PLACEHOLDER): string {
  let out = text;
  for (const part of nameParts(full)) out = out.replace(nameRegExp(part), placeholder);
  return out;
}

/** The surname, or the only name given. */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * The name put back, as a formal report writes it: the full name in every
 * heading and at the first mention in the text, the surname after that.
 * With no name given, "the ECT" stands in.
 */
export function swapStaffName(text: string, full: string, placeholder = ECT_PLACEHOLDER): string {
  const whole = full.trim().replace(/\s+/g, " ");
  if (!whole) return text.split(placeholder).join("the ECT");
  const short = shortName(whole);
  let named = false;
  return text
    .split("\n")
    .map((line) => {
      if (!line.includes(placeholder)) return line;
      if (/^\s{0,3}#/.test(line)) return line.split(placeholder).join(whole);
      return line
        .split(placeholder)
        .reduce((acc, piece, i) => {
          if (i === 0) return piece;
          const name = named ? short : whole;
          named = true;
          return acc + name + piece;
        }, "");
    })
    .join("\n");
}

/** Keys a request about a member of staff must never carry. */
const STAFF_NAME_KEYS = /^(ectName|staffName|teacherName|name|firstName|first_name|surname|fullName)$/i;

/** Whether a request body carries a staff name key, at any depth. */
export function carriesStaffName(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  if (Array.isArray(body)) return body.some(carriesStaffName);
  return Object.entries(body as Record<string, unknown>).some(([k, v]) => STAFF_NAME_KEYS.test(k) || carriesStaffName(v));
}

/** What Ask Jo and Refine work on instead of the real text: a scrub on the
 *  way out and a swap on the way back. */
export interface TextPrivacy {
  scrub: (text: string) => string;
  swap: (text: string) => string;
}

export function staffNamePrivacy(full: string): TextPrivacy | undefined {
  if (!full.trim()) return undefined;
  return { scrub: (t) => scrubStaffName(t, full), swap: (t) => swapStaffName(t, full) };
}
