// A document about one child (Behaviour Support Plan, One Page Profile) with
// the child's name kept out of everything a model sees.
//
// The saved document's text holds "[PUPIL]" wherever the child is named, and
// the name itself sits in `doc.pupil`, which no model request carries
// (sheetSnapshot in app/lib/jo/sheet-ops.ts sends a fixed list of fields). The
// page, Print, PDF, Word and Copy show `withPupilName(doc)`; whatever the
// teacher edits on the page goes back through `withPupilPlaceholder`, so a
// name typed into a box is stored as "[PUPIL]" too.
//
// Best effort, as for Reports: it catches the child's first name, not a
// surname or another child's name typed into a box. The forms say so.

import { PLACEHOLDER, scrubText, swapIn } from "@/app/lib/reports/privacy";
import type { PupilPronouns, SheetDoc } from "./types";

/** Keys whose strings are not words on the page and are never rewritten. */
const SKIP = new Set(["id", "kind", "tool", "pupil", "design", "role", "type", "stage", "level", "form", "variant", "src", "source", "query"]);

/** `value` with `fn` applied to every string in it, skipping SKIP keys. */
function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === "string") return fn(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SKIP.has(k) ? v : mapStrings(v, fn);
    return out as T;
  }
  return value;
}

/** The document as the teacher sees it: "[PUPIL]" replaced by the child's
 *  name, or by "the pupil" when there is none. Unchanged without `pupil`. */
export function withPupilName(doc: SheetDoc): SheetDoc {
  if (!doc.pupil) return doc;
  const name = doc.pupil.name.trim();
  return mapStrings(doc, (s) => (s.includes(PLACEHOLDER) ? (name ? swapIn(s, name) : s.split(PLACEHOLDER).join("the pupil")) : s));
}

/** The document as it is stored: the child's name, wherever it was typed,
 *  back to "[PUPIL]". Unchanged without a name. */
export function withPupilPlaceholder(doc: SheetDoc): SheetDoc {
  const name = doc.pupil?.name.trim();
  if (!name) return doc;
  return mapStrings(doc, (s) => scrubText(s, name, []));
}

/** One piece of free text from a form, safe to send: the child's name as
 *  "[PUPIL]". */
export function scrubPupilText(text: string, name: string): string {
  return name.trim() ? scrubText(text, name, []) : text;
}

export function isPupilPronouns(v: unknown): v is PupilPronouns {
  return v === "he" || v === "she" || v === "they";
}

/** Pronouns for a run saved before pronouns, from its gender field:
 *  "Male" he, "Female" she, anything else they. */
export function pronounsFromInput(input: Record<string, unknown>): PupilPronouns {
  if (isPupilPronouns(input.pronouns)) return input.pronouns;
  const g = typeof input.studentGender === "string" ? input.studentGender.trim().toLowerCase() : "";
  return g === "male" ? "he" : g === "female" ? "she" : "they";
}

/** "he/him", for the prompt. */
export function pronounLine(p: PupilPronouns): string {
  return p === "he" ? "he/him/his" : p === "she" ? "she/her/her" : "they/them/their";
}
