// A pupil premium strategy statement as a sheet.
//
// In England every school that receives pupil premium (extra funding for
// disadvantaged pupils) publishes a strategy statement on its website by 31
// December each year, on the DfE's template. The template has a school
// overview and a funding overview, then Part A (the statement of intent, the
// challenges, intended outcomes, and the year's activities in three areas,
// each with its budgeted cost), then Part B (a review of the previous year,
// and any programmes bought in from outside providers).
//
// The model drafts the writing (app/lib/pupil-premium-prompt.ts); code builds
// everything else in the template's order and headings, landscape. The
// school's facts are the ones typed into the form, every cost and amount is
// left blank for the school, and Part B is left for the school to write,
// since it needs last year's results.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { actionRows, detailsTable, type ActionColumn } from "./action-plan";

/** The template's three areas of spending: [model field, heading, examples]. */
export const PP_AREAS: [string, string, string][] = [
  ["teaching", "Teaching", "for example, CPD, recruitment and retention"],
  ["targeted", "Targeted academic support", "for example, tutoring, one-to-one support, structured interventions"],
  ["wider", "Wider strategies", "for example, related to attendance, behaviour, wellbeing"],
];

/** The most challenges a statement is drafted for. */
export const MAX_CHALLENGES = 8;

/** The parts of a statement Design can switch off. */
export const PP_PARTS: { id: string; label: string }[] = [
  { id: "note", label: "Draft note" },
  { id: "overview", label: "School overview" },
  { id: "funding", label: "Funding overview" },
  { id: "review", label: "Part B: review of last year" },
  { id: "service", label: "Service pupil premium" },
  { id: "further", label: "Further information" },
];

/** Switched off at the start: only some schools receive service pupil premium,
 *  and further information is optional. */
export const PP_START_HIDDEN = ["service", "further"];

/** The school overview's rows, in the template's words: [form key, label]. */
export const PP_OVERVIEW: [string, string][] = [
  ["pupils", "Number of pupils in school"],
  ["proportion", "Proportion (%) of pupil premium eligible pupils"],
  ["years", "Academic year/years that our current pupil premium strategy plan covers"],
  ["published", "Date this statement was published"],
  ["review", "Date on which it will be reviewed"],
  ["authorised", "Statement authorised by"],
  ["lead", "Pupil premium lead"],
  ["governor", "Governor / Trustee lead"],
];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** The teacher's challenges as separate lines, their own numbering removed:
 *  "1. Low reading fluency" and "- Low reading fluency" are one challenge. */
export function challengeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\(?\d{1,2}[.):]|[-*•])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_CHALLENGES);
}

/** The challenge numbers an activity names, kept only when they point at a
 *  challenge there is, in order, each once: "1, 3". */
export function challengeNumbers(v: unknown, count: number): string {
  const nums = arr(v)
    .map((x) => (typeof x === "number" ? x : typeof x === "string" ? parseInt(x, 10) : NaN))
    .filter((x) => Number.isInteger(x) && x >= 1 && x <= count);
  return [...new Set(nums)].sort((a, b) => a - b).join(", ");
}

const ACTIVITY_COLUMNS: ActionColumn[] = [
  { key: "activity", label: "Activity" },
  { key: "evidence", label: "Evidence that supports this approach" },
  { key: "numbers", label: "Challenge number(s) addressed" },
];

export interface PupilPremiumInfo {
  schoolName?: string;
  /** The school overview's facts, by PP_OVERVIEW key, as typed. */
  facts?: Record<string, string>;
  /** How many challenges the teacher gave: numbers past it are dropped. */
  challenges?: number;
}

const COST = "£ ________";

/** The model's draft (complete or mid-stream) as a generic sheet draft. */
export function arrangePupilPremium(raw: unknown, info: PupilPremiumInfo = {}): Raw {
  const r = obj(undash(raw));
  const challenges = arr(r.challenges).map((c) => str(obj(c).detail)).filter(Boolean);
  const count = Math.max(info.challenges ?? 0, challenges.length);
  const facts = info.facts ?? {};
  const intent = strs(r.intent);
  const outcomes = arr(r.outcomes)
    .map(obj)
    .map((o) => [str(o.outcome), str(o.successCriteria)])
    .filter(([o, s]) => o || s);

  const areaSections: Raw[] = PP_AREAS.map(([field, heading, examples]) => {
    const rows = actionRows(
      arr(r[field]).map((a) => ({ ...obj(a), numbers: challengeNumbers(obj(a).challenges, count) })),
      ACTIVITY_COLUMNS,
    );
    return {
      role: `area-${field}`,
      title: `${heading} (${examples})`,
      emoji: "",
      instructions: "",
      blocks: rows.length
        ? [
            { type: "text", text: `**Budgeted cost:** ${COST}` },
            { type: "table", headers: ACTIVITY_COLUMNS.map((c) => c.label), rows },
          ]
        : [],
    };
  });
  const anyActivity = areaSections.some((s) => (s.blocks as unknown[]).length > 0);

  const sections: Raw[] = [
    {
      role: "note",
      title: "",
      emoji: "",
      instructions: "",
      blocks: [
        {
          type: "callout",
          variant: "remember",
          label: "A draft for your statement",
          emoji: "📝",
          text: "Check every activity, its evidence and the challenge numbers, add your figures and costs, and complete Part B before publishing on the DfE template by 31 December. Switch this box off in Design.",
        },
      ],
    },
    {
      role: "overview",
      title: "School overview",
      emoji: "",
      instructions: "",
      blocks: [
        { type: "text", text: "This statement details our school's use of pupil premium funding to help improve the attainment of our disadvantaged pupils. It outlines our pupil premium strategy, how we intend to spend the funding in this academic year and the outcomes for disadvantaged pupils last academic year." },
        detailsTable(PP_OVERVIEW.map(([key, label]) => [label, facts[key] ?? ""])),
      ],
    },
    {
      role: "funding",
      title: "Funding overview",
      emoji: "",
      instructions: "",
      blocks: [
        {
          type: "table",
          headers: ["Detail", "Amount"],
          rows: [
            ["Pupil premium funding allocation this academic year", "£"],
            ["Pupil premium funding carried forward from previous years (enter £0 if not applicable)", "£"],
            ["Total budget for this academic year", "£"],
          ],
        },
      ],
    },
    { role: "intent", title: "Part A: Pupil premium strategy plan. Statement of intent", emoji: "", instructions: "", blocks: intent.map((t) => ({ type: "text", text: t })) },
    {
      role: "challenges",
      title: "Challenges",
      emoji: "",
      instructions: "This details the key challenges to achievement that we have identified among our disadvantaged pupils.",
      blocks: challenges.length ? [{ type: "table", headers: ["Challenge number", "Detail of challenge"], rows: challenges.map((c, i) => [String(i + 1), c]) }] : [],
    },
    {
      role: "outcomes",
      title: "Intended outcomes",
      emoji: "",
      instructions: "This explains the outcomes we are aiming for by the end of our current strategy plan, and how we will measure whether they have been achieved.",
      blocks: outcomes.length ? [{ type: "table", headers: ["Intended outcome", "Success criteria"], rows: outcomes }] : [],
    },
    ...areaSections,
    {
      role: "total",
      title: "",
      emoji: "",
      instructions: "",
      blocks: anyActivity ? [{ type: "text", text: `**Total budgeted cost:** ${COST}` }] : [],
    },
    {
      role: "review",
      title: "Part B: Review of the previous academic year. Outcomes for disadvantaged pupils",
      emoji: "",
      instructions: "",
      blocks: [
        {
          type: "callout",
          variant: "tip",
          label: "For the school to write",
          emoji: "✍️",
          text: "How your disadvantaged pupils did last year and how you assessed it: national assessment and qualification results once published, against local and national averages and your non-disadvantaged pupils, your own assessments, and attendance, behaviour and wellbeing. Say whether you are on target for your intended outcomes, and what is and is not working.",
        },
        { type: "table", headers: [], rows: [[""], [""], [""]] },
        { type: "text", text: "**Externally provided programmes**" },
        { type: "table", headers: ["Programme", "Provider"], rows: [["", ""], ["", ""], ["", ""]] },
      ],
    },
    {
      role: "service",
      title: "Service pupil premium funding (optional)",
      emoji: "",
      instructions: "",
      blocks: [{ type: "table", headers: ["Measure", "Details"], rows: [["How our service pupil premium allocation was spent last academic year", ""], ["The impact of that spending on service pupil premium eligible pupils", ""]] }],
    },
    {
      role: "further",
      title: "Further information (optional)",
      emoji: "",
      instructions: "",
      blocks: [{ type: "table", headers: [], rows: [[""], [""]] }],
    },
  ];

  const school = info.schoolName?.trim();
  return {
    title: school ? `Pupil premium strategy statement: ${school}` : "Pupil premium strategy statement",
    objective: "",
    intro: null,
    // Until the model's writing arrives, only the school's own parts show.
    sections: intent.length || challenges.length || anyActivity ? sections.filter((s) => (s.blocks as unknown[]).length > 0) : sections.filter((s) => ["note", "overview", "funding"].includes(s.role as string)),
    teacherNotes: [],
  };
}
