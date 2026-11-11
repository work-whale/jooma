// A One Page Profile as a sheet.
//
// In UK schools a one page profile is the child's own voice ("I like...",
// "Please help me by...") on a single page, usually with a photo at the top,
// so any adult new to the child knows them at a glance. The model writes the
// boxes in the first person (pupilProfileResponseFormat in
// app/lib/pupil-profile-prompt.ts); code arranges them as pairs.
//
// Built in code, never by the model and never sent to it: the title with the
// child's name ("[PUPIL]"), the review dates, and the links to intervention
// groups and outside agencies. The photo box is empty, to stick a printed
// photo in: no child's photo is uploaded or stored.
//
// Pure, and free of React and of normalize.ts.

import { undash } from "./undash";
import { PLACEHOLDER } from "@/app/lib/reports/privacy";
import type { PupilFact } from "./behaviour";

/** The parts of a profile Design can switch off. */
export const PROFILE_PARTS: { id: string; label: string }[] = [
  { id: "photo", label: "Photo box" },
  { id: "details", label: "Review dates" },
  { id: "links", label: "Links to additional support" },
];

/** The boxes, in page order: [left field, left heading, right field, right heading]. */
export const PROFILE_PAIRS: [string, string, string, string][] = [
  ["likes", "What people like and admire about me", "happy", "What makes me happy"],
  ["difficult", "What I find difficult", "support", "How to support me"],
  ["strategies", "Other strategies that may help me", "accommodations", "Changes to lessons that help me"],
];

/** Every list field the model fills. "strategies" and "accommodations" come
 *  back empty unless the teacher asked for professional suggestions. */
export const PROFILE_LIST_FIELDS = [...PROFILE_PAIRS.flatMap(([l, , r]) => [l, r]), "hopes"];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** What the page builds from the form: review dates first, links last. */
export interface ProfileFacts {
  dates: PupilFact[];
  links: PupilFact[];
}

/**
 * The model's profile (complete or mid-stream) as a generic sheet draft for
 * normalizeDraft. A pair appears once either side has something; hopes
 * stand alone, full width.
 */
export function arrangePupilProfile(raw: unknown, facts: ProfileFacts): Raw {
  // Long dashes out of what the model wrote (app/lib/sheets/undash.ts).
  const r = obj(undash(raw));
  const boxes: Raw[] = PROFILE_PAIRS.map(([l, lt, rf, rt]) => ({ type: "twocol", left: { title: lt, items: strs(r[l]) }, right: { title: rt, items: strs(r[rf]) } }))
    .filter((b) => b.left.items.length || b.right.items.length);
  const hopes = strs(r.hopes);
  if (hopes.length) boxes.push({ type: "twocol", left: { title: "My hopes for the future", items: hopes }, right: { title: "", items: [] } });

  const table = (rows: PupilFact[]) => ({ type: "table", headers: [], rows: rows.map((f) => [f.label, f.value]) });
  return {
    title: `${PLACEHOLDER}'s one page profile`,
    objective: "",
    intro: null,
    sections: [
      ...(facts.dates.length ? [{ role: "details", title: "", emoji: "", instructions: "", blocks: [table(facts.dates)] }] : []),
      { role: "", title: "All about me", emoji: "🌟", instructions: "", blocks: boxes },
      ...(facts.links.length ? [{ role: "links", title: "Links to additional support", emoji: "🔗", instructions: "", blocks: [table(facts.links)] }] : []),
    ],
    teacherNotes: [],
  };
}
