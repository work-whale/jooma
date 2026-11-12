// An EYFS action plan as a sheet.
//
// An Early Years lead in England plans how to improve one part of their
// provision (communication and language, outdoor learning, adult
// interactions) over a term or a year, usually in phases: what will be done,
// who leads it (by role), what it needs and how it will be checked. Leaders
// then mark each action red, amber or green as the year goes on and note the
// evidence of impact.
//
// The model writes the objective, success criteria, four phases of actions
// and the intended outcomes (app/lib/eyfs-action-plan-prompt.ts). Code builds
// one landscape table per phase through the action-plan helper, with the RAG
// and evidence columns blank for the school, and a review table at the end.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { actionRows, type ActionColumn } from "./action-plan";

/** The phases a plan always has. */
export const EYFS_PHASES = 4;

/** How long the plan runs, as the form offers it. */
export const EYFS_TIMESCALES = ["One term", "Two terms", "One year"] as const;

export function eyfsTimescale(v: unknown): (typeof EYFS_TIMESCALES)[number] {
  return (EYFS_TIMESCALES as readonly string[]).includes(v as string) ? (v as (typeof EYFS_TIMESCALES)[number]) : "One year";
}

export const EYFS_ACTION_PARTS: { id: string; label: string }[] = [
  { id: "criteria", label: "Success criteria" },
  { id: "outcomes", label: "Intended outcomes" },
  { id: "review", label: "Review points" },
];

export const EYFS_ACTION_COLUMNS: ActionColumn[] = [
  { key: "action", label: "Action" },
  { key: "lead", label: "Lead" },
  { key: "resources", label: "Resources" },
  { key: "monitoring", label: "Monitoring" },
  { key: "rag", label: "RAG", blank: true },
  { key: "impact", label: "Evidence of impact", blank: true },
];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** The model's plan (complete or mid-stream) as a generic sheet draft. */
export function arrangeEyfsActionPlan(raw: unknown): Raw {
  const r = obj(undash(raw));
  const objective = str(r.objective);
  const criteria = strs(r.successCriteria);
  const phases = arr(r.phases).map(obj).slice(0, EYFS_PHASES);

  const phaseSections: Raw[] = phases.map((p, i) => {
    const rows = actionRows(p.actions, EYFS_ACTION_COLUMNS);
    const when = str(p.when);
    const name = str(p.title);
    return {
      role: "phase",
      title: `Phase ${i + 1}${name ? `: ${name}` : ""}${when ? ` (${when})` : ""}`,
      emoji: "",
      instructions: "",
      blocks: rows.length ? [{ type: "table", headers: EYFS_ACTION_COLUMNS.map((c) => c.label), rows }] : [],
    };
  });

  const outcomes = strs(r.outcomes);
  const sections: Raw[] = [
    {
      role: "objective",
      title: "",
      emoji: "",
      instructions: "",
      blocks: [
        ...(objective ? [{ type: "callout", variant: "fact", label: "Objective", emoji: "🎯", text: objective }] : []),
        ...(str(r.rationale) ? [{ type: "text", text: str(r.rationale) }] : []),
      ],
    },
    { role: "criteria", title: "Success criteria", emoji: "", instructions: "", blocks: criteria.length ? [{ type: "list", title: "", style: "check", items: criteria }] : [] },
    ...phaseSections,
    { role: "outcomes", title: "Intended outcomes", emoji: "", instructions: "", blocks: outcomes.length ? [{ type: "list", title: "", style: "bullet", items: outcomes }] : [] },
    {
      role: "review",
      title: "Review points",
      emoji: "",
      instructions: "",
      // Built in code once the phases are in, never by the model: the dates
      // and judgements are the school's.
      blocks: phases.length
        ? [{ type: "table", headers: ["Review", "Date", "Progress against the success criteria", "Next steps"], rows: phases.map((_, i) => [`End of phase ${i + 1}`, "", "", ""]) }]
        : [],
    },
  ];

  return {
    title: str(r.title) || "EYFS action plan",
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
