// Intervention ideas as a sheet.
//
// A teacher or SENCO describes one pupil's attitudes, aptitudes and
// attainment (scores and needs, never names), and gets evidence-informed
// strategies to close a gap: what the information suggests, then each
// strategy with how to do it, who runs it and how often, and how you will
// know it is working; then a blank table to track them. In UK schools these
// usually feed a SEN support plan or a pupil progress meeting.
//
// Built in code, never by the model and never sent to it: the details table
// and the monitoring table's blank cells. The child is "[PUPIL]" when the
// teacher gave a first name (app/lib/sheets/pupil.ts).
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { PLACEHOLDER } from "@/app/lib/reports/privacy";
import type { PupilFact } from "./behaviour";

/** The parts of an intervention plan Design can switch off. */
export const INTERVENTION_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Pupil details" },
  { id: "monitoring", label: "Monitoring table" },
];

/** The section holding the focus for a practice worksheet, read by the
 *  "Make a worksheet" handoff (app/lib/lesson-handoffs.ts). */
export const PRACTICE_ROLE = "practice";

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** The model's strategies (complete or mid-stream) as a generic sheet draft. */
export function arrangeIntervention(raw: unknown, facts: PupilFact[], named: boolean): Raw {
  const r = obj(undash(raw));
  const strategies = arr(r.strategies)
    .map(obj)
    .map((s) => ({ name: str(s.name), summary: str(s.summary), steps: strs(s.steps), who: str(s.whoAndWhen), measure: str(s.measure) }))
    .filter((s) => s.name);
  const findings = strs(r.findings);
  const practice = str(r.practiceFocus);

  const sections: Raw[] = [
    {
      role: "details",
      title: "Pupil details",
      emoji: "🧾",
      instructions: "",
      blocks: [{ type: "table", headers: [], rows: [["Pupil", named ? PLACEHOLDER : ""], ...facts.filter((f) => f.value).map((f) => [f.label, f.value])] }],
    },
    {
      role: "findings",
      title: "What the information suggests",
      emoji: "🔎",
      instructions: "",
      blocks: findings.length ? [{ type: "list", title: "", style: "bullet", items: findings }] : [],
    },
    ...strategies.map((s, i) => ({
      role: "strategy",
      title: `${i + 1}. ${s.name}`,
      emoji: "",
      instructions: "",
      blocks: [
        ...(s.summary ? [{ type: "text", text: s.summary }] : []),
        ...(s.steps.length ? [{ type: "list", title: "How to do it", style: "number", items: s.steps }] : []),
        ...(s.who ? [{ type: "text", text: `**Who and how often:** ${s.who}` }] : []),
        ...(s.measure ? [{ type: "callout", variant: "tip", label: "How you will know it is working", emoji: "📈", text: s.measure }] : []),
      ],
    })),
    {
      role: PRACTICE_ROLE,
      title: "Practice to set",
      emoji: "✏️",
      instructions: "",
      blocks: practice ? [{ type: "text", text: practice }] : [],
    },
    {
      role: "monitoring",
      title: "Tracking the strategies",
      emoji: "🗒️",
      instructions: "Fill in by hand as the strategies run.",
      blocks: strategies.length
        ? [{ type: "table", headers: ["Strategy", "Start date", "Who", "Review date", "Impact"], rows: strategies.map((s) => [s.name, "", "", "", ""]) }]
        : [],
    },
  ];

  return {
    title: named ? `Intervention ideas: ${PLACEHOLDER}` : "Intervention ideas",
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
