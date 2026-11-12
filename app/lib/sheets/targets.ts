// SMART targets as a sheet.
//
// In UK schools, SMART targets (Specific, Measurable, Achievable, Relevant,
// Time-bound) are set for a pupil with special educational needs, often on a
// SEN support plan, and reviewed each term with the pupil and their parents.
// So the page is the targets table the school expects, then a review table to
// fill in by hand and signature lines for the pupil, a parent or carer and
// a member of staff.
//
// Built in code, never by the model and never sent to it: the details table
// (dates from the form), the review table's blank cells and the signatures.
// The model writes the targets only, with "[PUPIL]" for the child's name
// (app/lib/sheets/pupil.ts).
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { PLACEHOLDER } from "@/app/lib/reports/privacy";
import type { PupilFact } from "./behaviour";

/** The parts of a targets sheet Design can switch off. */
export const TARGETS_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Pupil details" },
  { id: "review", label: "Review table" },
  { id: "signatures", label: "Signatures" },
];

/** The SMART table's columns, in order: [model field, heading]. */
export const SMART_COLUMNS: [string, string][] = [
  ["target", "Target"],
  ["specific", "Specific"],
  ["measurable", "Measurable"],
  ["achievable", "Achievable"],
  ["relevant", "Relevant"],
  ["timeBound", "Time-bound"],
];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The pupil's details as one row: the labels across the top, the values
 *  under them. An empty fact is left out; the pupil cell is blank to write in
 *  when no name was given. */
export function detailsRow(facts: PupilFact[], named: boolean): Raw {
  const shown = facts.filter((f) => f.value);
  return { type: "table", headers: ["Pupil", ...shown.map((f) => f.label)], rows: [[named ? PLACEHOLDER : "", ...shown.map((f) => f.value)]] };
}

/**
 * The model's targets (complete or mid-stream) as a generic sheet draft.
 * `named` is whether the teacher gave a first name: the title then carries
 * "[PUPIL]", which the page swaps for the name.
 */
export function arrangeTargets(raw: unknown, facts: PupilFact[], named: boolean): Raw {
  const r = obj(undash(raw));
  const targets = arr(r.targets)
    .map(obj)
    .map((t) => SMART_COLUMNS.map(([field]) => str(t[field])))
    .filter((row) => row[0]);

  const sections: Raw[] = [
    {
      role: "details",
      title: "Pupil details",
      emoji: "🧾",
      instructions: "",
      // One row across the landscape page, so the targets table can share
      // the first page with it.
      blocks: [detailsRow(facts, named)],
    },
    {
      role: "targets",
      title: "Targets",
      emoji: "🎯",
      instructions: "",
      blocks: targets.length ? [{ type: "table", headers: SMART_COLUMNS.map(([, h]) => h), rows: targets }] : [],
    },
    {
      role: "review",
      title: "Review",
      emoji: "🔁",
      instructions: "Fill in at the review meeting.",
      blocks: targets.length ? [{ type: "table", headers: ["Target", "Achieved", "Partly", "Not yet", "Notes"], rows: targets.map((row) => [row[0], "", "", "", ""]) }] : [],
    },
    {
      role: "signatures",
      title: "Agreed by",
      emoji: "✍️",
      instructions: "",
      blocks: [{ type: "table", headers: ["Pupil", "Parent or carer", "Member of staff"], rows: [["Name:", "Name:", "Name:"], ["Signature:", "Signature:", "Signature:"], ["Date:", "Date:", "Date:"]] }],
    },
  ];

  return {
    title: named ? `SMART targets: ${PLACEHOLDER}` : "SMART targets",
    objective: "",
    intro: null,
    // The code-built parts wait for the first target, so a sheet never shows
    // blank tables with nothing to review.
    sections: targets.length ? sections : sections.filter((s) => s.role === "details"),
    teacherNotes: [],
  };
}
