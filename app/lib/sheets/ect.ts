// An early career teacher's induction report as a sheet.
//
// In England an ECT serves two years of statutory induction. The DfE
// statutory guidance ("Induction for early career teachers (England)", June
// 2026) has the induction tutor hold a progress review in each term with no
// formal assessment (terms 1, 2, 4 and 5), and a formal assessment in the
// final term of each year (terms 3 and 6). A progress review records whether
// the ECT is on track to complete induction successfully, summarises the
// evidence and states the agreed development targets (para 2.52). The final
// assessment recommends whether performance against the Teachers' Standards
// is satisfactory, unsatisfactory, or whether an extension should be
// considered (2.60). The ECT adds their comments, then the induction tutor,
// headteacher and ECT sign (2.61). Appropriate bodies have their own forms.
//
// The model writes the evidence against each standard, the conduct paragraph
// and the targets (app/lib/ect-report-prompt.ts). It never makes the
// judgement: the tutor picks the outcome in the form, and code prints it. The
// ECT's name is "[ECT]" in the text and sits in doc.staff.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { actionTable, detailsTable } from "./action-plan";
import { responseBox, signOffTable } from "./signoff";

export type EctReportType = "review" | "assessment";

/** Teachers' Standards (DfE, 2011), Part One, by number. */
export const ECT_STANDARDS = [
  "Set high expectations which inspire, motivate and challenge pupils",
  "Promote good progress and outcomes by pupils",
  "Demonstrate good subject and curriculum knowledge",
  "Plan and teach well structured lessons",
  "Adapt teaching to respond to the strengths and needs of all pupils",
  "Make accurate and productive use of assessment",
  "Manage behaviour effectively to ensure a good and safe learning environment",
  "Fulfil wider professional responsibilities",
];

export const ECT_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "conduct", label: "Personal and professional conduct" },
  { id: "comments", label: "ECT's comments" },
  { id: "signoff", label: "Sign-off" },
];

const PERIODS: Record<EctReportType, { id: string; label: string }[]> = {
  review: [
    { id: "t1", label: "Progress review, term 1 (first year)" },
    { id: "t2", label: "Progress review, term 2 (first year)" },
    { id: "t4", label: "Progress review, term 4 (second year)" },
    { id: "t5", label: "Progress review, term 5 (second year)" },
  ],
  assessment: [
    { id: "t3", label: "First formal assessment, end of the first year (term 3)" },
    { id: "t6", label: "Final assessment, end of induction (term 6)" },
  ],
};

const REVIEW_OUTCOMES = [
  { id: "on-track", label: "On track to complete induction successfully" },
  { id: "not-on-track", label: "Not on track to complete induction successfully" },
];
const FIRST_ASSESSMENT_OUTCOMES = [
  { id: "satisfactory-progress", label: "Making satisfactory progress against the Teachers' Standards" },
  { id: "not-satisfactory-progress", label: "Not making satisfactory progress against the Teachers' Standards" },
];
const FINAL_OUTCOMES = [
  { id: "satisfactory", label: "Performance against the Teachers' Standards is satisfactory" },
  { id: "unsatisfactory", label: "Performance against the Teachers' Standards is unsatisfactory" },
  { id: "extension", label: "An extension to the induction period should be considered" },
];

export function ectReportType(v: unknown): EctReportType {
  return v === "assessment" ? "assessment" : "review";
}

/** The points in induction a report of this type can be for. */
export function ectPeriods(type: unknown): { id: string; label: string }[] {
  return PERIODS[ectReportType(type)];
}

/** The period's id, or the first for the type when it is not one of them. */
export function ectPeriod(type: unknown, period: unknown): { id: string; label: string } {
  const list = ectPeriods(type);
  return list.find((p) => p.id === period) ?? list[0];
}

/** The outcomes the induction tutor can record at this point. */
export function ectOutcomes(type: unknown, period: unknown): { id: string; label: string }[] {
  if (ectReportType(type) === "review") return REVIEW_OUTCOMES;
  return ectPeriod(type, period).id === "t6" ? FINAL_OUTCOMES : FIRST_ASSESSMENT_OUTCOMES;
}

/** The outcome's wording, or "" when none (or one that does not belong to this point) was picked. */
export function ectOutcomeLabel(type: unknown, period: unknown, outcome: unknown): string {
  return ectOutcomes(type, period).find((o) => o.id === outcome)?.label ?? "";
}

export interface EctInfo {
  reportType?: string;
  period?: string;
  /** Picked by the induction tutor in the form, never by the model. */
  outcome?: string;
  subject?: string;
  /** Whether the form had the ECT's name (the name itself is in doc.staff). */
  named?: boolean;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** One row per standard the evidence covers, in number order. A number that
 *  is not a standard, a row with nothing in it, or a second row for the same
 *  standard is dropped. */
export function standardRows(raw: unknown): string[][] {
  const seen = new Set<number>();
  const rows: [number, string[]][] = [];
  for (const item of arr(raw)) {
    const s = obj(item);
    const n = typeof s.standard === "number" ? s.standard : parseInt(String(s.standard ?? ""), 10);
    if (!Number.isInteger(n) || n < 1 || n > 8 || seen.has(n)) continue;
    const strengths = str(s.strengths);
    const next = str(s.nextSteps);
    if (!strengths && !next) continue;
    seen.add(n);
    rows.push([n, [`${n}. ${ECT_STANDARDS[n - 1]}`, strengths, next]]);
  }
  return rows.sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

const TARGET_COLUMNS = [
  { key: "target", label: "Target" },
  { key: "support", label: "Support" },
  { key: "byWhen", label: "By when" },
  { key: "review", label: "Review", blank: true },
];

/** The model's report (complete or mid-stream) as a generic sheet draft. */
export function arrangeEct(raw: unknown, info: EctInfo = {}): Raw {
  const r = obj(undash(raw));
  const type = ectReportType(info.reportType);
  const period = ectPeriod(type, info.period);
  const who = info.named ? "[ECT]" : "";

  const standards = standardRows(r.standards);
  const targets = actionTable(r.targets, TARGET_COLUMNS);
  const summary = str(r.summary);
  const conduct = str(r.conduct);

  const sections: Raw[] = [
    {
      role: "details",
      title: "",
      emoji: "",
      instructions: "",
      blocks: [detailsTable([["ECT", who], ["Subject or phase", info.subject?.trim() ?? ""], ["Point in induction", period.label], ["Induction tutor", ""], ["Mentor", ""], ["Date", ""]])],
    },
    {
      role: "outcome",
      title: "",
      emoji: "",
      instructions: "",
      blocks: [detailsTable([["Outcome (recorded by the induction tutor)", ectOutcomeLabel(type, period.id, info.outcome)]])],
    },
    ...(summary ? [{ role: "summary", title: "Summary of evidence", emoji: "", instructions: "", blocks: [{ type: "text", text: summary }] }] : []),
    ...(standards.length
      ? [{ role: "standards", title: "Progress against the Teachers' Standards", emoji: "", instructions: "", blocks: [{ type: "table", headers: ["Teachers' Standard", "Strengths", "Next steps"], rows: standards }] }]
      : []),
    ...(conduct ? [{ role: "conduct", title: "Part Two: personal and professional conduct", emoji: "", instructions: "", blocks: [{ type: "text", text: conduct }] }] : []),
    ...(targets ? [{ role: "targets", title: "Agreed development targets", emoji: "", instructions: "", blocks: [targets] }] : []),
    ...(standards.length || targets
      ? [
          { role: "comments", title: "", emoji: "", instructions: "", blocks: [responseBox("ECT's comments")] },
          {
            role: "signoff",
            title: "Sign-off",
            emoji: "",
            instructions:
              type === "assessment"
                ? "A draft: copy it onto your appropriate body's assessment form. The ECT adds their comments, then the induction tutor, headteacher and ECT sign."
                : "A draft record of this progress review: copy it onto your appropriate body's form if it has one, and give the ECT a copy.",
            blocks: [signOffTable([["ECT", who], ["Induction tutor"], ["Headteacher"]])],
          },
        ]
      : []),
  ];

  const label = type === "assessment" ? "ECT formal assessment" : "ECT progress review";
  return {
    title: who ? `${label}: ${who}` : label,
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}
