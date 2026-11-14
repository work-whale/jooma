// A school improvement plan as a sheet.
//
// English schools set a few improvement priorities each year, usually tied to
// Ofsted's evaluation areas (renewed framework, November 2025:
// app/lib/ofsted.ts), and track them in a plan governors agree. The model
// writes a short narrative and, for each priority the school gave, an action
// table (app/lib/sip-prompt.ts) plus a half-termly monitoring calendar. Code
// builds the details, a baseline line per priority, and the Cost and RAG
// columns, all blank for the school: a plan never arrives with an invented
// budget, baseline figure or rating.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { actionTable, detailsTable, type ActionColumn } from "./action-plan";
import { OFSTED_GRADED_AREAS } from "@/app/lib/ofsted";

export const SIP_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "summary", label: "Summary" },
  { id: "context", label: "School context" },
  { id: "rationale", label: "Why these priorities" },
  { id: "baseline", label: "Where we are now" },
  { id: "monitoring", label: "Monitoring calendar" },
];

export const SIP_HALF_TERMS = ["Autumn 1", "Autumn 2", "Spring 1", "Spring 2", "Summer 1", "Summer 2"];

/** The renewed framework's graded areas, by name. */
export const SIP_OFSTED_AREAS = OFSTED_GRADED_AREAS.map((a) => a.name);

/** A plan runs 1 to 5 years, as the form allows; anything else is 1. */
export function sipYears(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

const ACTION_COLUMNS: ActionColumn[] = [
  { key: "action", label: "Action" },
  { key: "leadRole", label: "Lead" },
  { key: "timescale", label: "Timescale" },
  { key: "monitoring", label: "Monitoring" },
  { key: "successCriteria", label: "Success criteria" },
  { key: "cost", label: "Cost", blank: true },
  { key: "rag", label: "RAG", blank: true },
];

export interface SipInfo {
  schoolType?: string;
  timeframe?: number;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const section = (role: string, title: string, blocks: Raw[], instructions = ""): Raw => ({ role, title, emoji: "", instructions, blocks });
const text = (role: string, title: string, t: string): Raw[] => (t ? [section(role, title, [{ type: "text", text: t }])] : []);

/** The monitoring calendar in half-term order, with a blank Done column. */
function monitoringTable(raw: unknown): Raw | null {
  const rows = arr(raw)
    .map(obj)
    .map((m) => ({ when: str(m.halfTerm), activity: str(m.activity) }))
    .filter((m) => m.activity && SIP_HALF_TERMS.includes(m.when))
    .sort((a, b) => SIP_HALF_TERMS.indexOf(a.when) - SIP_HALF_TERMS.indexOf(b.when))
    .map((m) => [m.when, m.activity, ""]);
  return rows.length ? { type: "table", headers: ["Half term", "Monitoring", "Done"], rows } : null;
}

/** The model's plan (complete or mid-stream) as a generic sheet draft. */
export function arrangeSip(raw: unknown, info: SipInfo = {}): Raw {
  const r = obj(undash(raw));
  const years = sipYears(info.timeframe);

  const priorities = arr(r.priorities)
    .map(obj)
    .map((p) => ({ title: str(p.title), area: str(p.ofstedArea), table: actionTable(p.actions, ACTION_COLUMNS) }))
    .filter((p) => p.title);

  const monitoring = monitoringTable(r.monitoring);

  const sections: Raw[] = [
    section("details", "", [detailsTable([["School", ""], ["Type", info.schoolType?.trim() ?? ""], ["Plan period", `${years} ${years === 1 ? "year" : "years"}`], ["Headteacher", ""], ["Agreed by governors on", ""]])]),
    ...text("summary", "Summary", str(r.summary)),
    ...text("context", "School context", str(r.context)),
    ...text("rationale", "Why these priorities", str(r.rationale)),
    ...(priorities.length
      ? [section("baseline", "Where we are now", [{ type: "table", headers: ["Priority", "Where we are now (school to add)"], rows: priorities.map((p) => [p.title, ""]) }], "Add your latest data for each priority: this is the baseline the success criteria are measured against.")]
      : []),
    ...priorities.map((p, i) =>
      section("priority", `Priority ${i + 1}: ${p.title}`, p.table ? [p.table] : [], SIP_OFSTED_AREAS.includes(p.area) ? `Ofsted evaluation area: ${p.area}` : ""),
    ),
    ...(monitoring ? [section("monitoring", "Monitoring calendar", [monitoring])] : []),
  ];

  return {
    title: "School improvement plan",
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}
