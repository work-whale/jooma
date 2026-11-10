// Keeping pupils' names away from the model.
//
// The school is the data controller for its pupils' data. A report needs a
// pupil's achievements, not their name, so the browser replaces the pupil's
// own first name with "[PUPIL]" and any classmate's with "a classmate" in
// everything it sends, and puts the name back into what comes back. The
// server never receives a name (the route refuses a request carrying one),
// and nothing written by the model holds one.
//
// Best effort, and said so on the form: a surname or a sibling's name typed
// into a note is not a classmate's first name and is not caught.

import type { PupilRow, Pronouns } from "./reports";

export const PLACEHOLDER = "[PUPIL]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole word match of `name`, in any case, with or without "'s". Letters
 *  either side (Ali in Alison) do not match. */
export function nameRegExp(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu");
}

/**
 * `text` with this pupil's name as the placeholder and every other pupil's as
 * "a classmate". Longer names are replaced first, so "Ann Marie" is not left
 * half done by "Ann".
 */
export function scrubText(text: string, own: string, classmates: string[]): string {
  let out = text;
  const ownName = own.trim();
  const others = classmates.map((n) => n.trim()).filter((n) => n && n.toLowerCase() !== ownName.toLowerCase());
  const all = [...(ownName ? [{ name: ownName, with: PLACEHOLDER }] : []), ...others.map((n) => ({ name: n, with: "a classmate" }))].sort((a, b) => b.name.length - a.name.length);
  for (const { name, with: replacement } of all) out = out.replace(nameRegExp(name), replacement);
  return out;
}

/** What the model is sent about one pupil: a reference, never a name. */
export interface ModelPupil {
  ref: string;
  pronouns: Pronouns;
  attainment: Record<string, string>;
  effort: string;
  note: string;
  nextStep: string;
}

export function scrubForModel(pupils: PupilRow[], roster: string[] = pupils.map((p) => p.name)): ModelPupil[] {
  return pupils.map((p) => ({
    ref: p.id,
    pronouns: p.pronouns,
    attainment: Object.fromEntries(Object.entries(p.attainment).filter(([, v]) => v)),
    effort: p.effort,
    note: scrubText(p.note, p.name, roster),
    nextStep: scrubText(p.nextStep, p.name, roster),
  }));
}

/** The name put back: "[PUPIL]'s" becomes "Amira's". */
export function swapIn(text: string, name: string): string {
  const n = name.trim() || "This pupil";
  return text.split(PLACEHOLDER).join(n);
}

/** Every string a request would send, for checking no name is in it. */
export function payloadStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(payloadStrings);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [k, ...payloadStrings(v)]);
  return [];
}
