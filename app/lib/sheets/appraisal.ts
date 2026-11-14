// Appraisal (performance management) objectives as a sheet.
//
// Teachers in English state schools agree objectives with their appraiser
// each autumn, usually about three, and review them at a mid-year check-in
// and at the end of the cycle. One document lasts the year: the model writes
// the objectives with their success criteria, support and evidence
// (app/lib/performance-management-prompt.ts); the review columns, the names
// and the sign-off are blank, added in code, for the school to fill in.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { actionRows, detailsTable, type ActionColumn } from "./action-plan";
import { signOffTable } from "./signoff";

export const APPRAISAL_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "rationale", label: "Links to the standards" },
  { id: "signoff", label: "Sign-off" },
];

export const DEFAULT_OBJECTIVES = 3;

/** The number of objectives asked for: 3 unless the form chose 1 to 5. */
export function objectiveCount(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_OBJECTIVES;
  return Math.min(5, Math.max(1, Math.round(n)));
}

const COLUMNS: ActionColumn[] = [
  { key: "objective", label: "Objective" },
  { key: "successCriteria", label: "Success criteria" },
  { key: "support", label: "Support and CPD" },
  { key: "evidence", label: "Evidence" },
  { key: "midYear", label: "Mid-year review", blank: true },
  { key: "endOfYear", label: "End-of-year review", blank: true },
];

export interface AppraisalInfo {
  role?: string;
  payScale?: string;
  count?: number;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The model's objectives (complete or mid-stream) as a generic sheet draft. */
export function arrangeAppraisal(raw: unknown, info: AppraisalInfo = {}): Raw {
  const r = obj(undash(raw));
  const role = info.role?.trim() ?? "";
  const rows = actionRows(r.objectives, COLUMNS)
    .slice(0, objectiveCount(info.count))
    .map((row, i) => [`${i + 1}. ${row[0]}`, ...row.slice(1)]);
  const rationale = str(r.rationale);

  const sections: Raw[] = [
    {
      role: "details",
      title: "",
      emoji: "",
      instructions: "",
      blocks: [detailsTable([["Role", role], ["Pay range", info.payScale?.trim() ?? ""], ["Appraisal cycle", ""], ["Appraisee", ""], ["Appraiser", ""]])],
    },
    ...(rationale ? [{ role: "rationale", title: "", emoji: "", instructions: "", blocks: [{ type: "text", text: rationale }] }] : []),
    ...(rows.length
      ? [
          {
            role: "objectives",
            title: "Objectives",
            emoji: "",
            instructions: "Agree these with the appraisee. Fill in the reviews at the mid-year check-in and at the end of the cycle.",
            blocks: [{ type: "table", headers: COLUMNS.map((c) => c.label), rows }],
          },
          { role: "signoff", title: "Sign-off", emoji: "", instructions: "Signed when the objectives are agreed.", blocks: [signOffTable([["Appraisee"], ["Appraiser"]])] },
        ]
      : []),
  ];

  return {
    title: role ? `Appraisal objectives: ${role}` : "Appraisal objectives",
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}
