// A risk assessment as a sheet.
//
// Schools in England assess the risks of any trip or activity before it goes
// ahead, following HSE's approach and, for trips, the school's educational
// visits policy (most follow the OEAP National Guidance). The form most
// schools and local authorities use scores each hazard on a 5 x 5 matrix:
// likelihood (1 to 5) times severity (1 to 5), before and after the control
// measures. Off-site visits are signed off by the trip leader, the school's
// Educational Visits Coordinator (EVC) and the headteacher.
//
// The model names the hazards and gives the two numbers for each, before and
// after controls (app/lib/risk-assessment-prompt.ts). Code does every sum and
// every band, so a score is never wrong, and builds the details, the rating
// key, the emergency box and the sign-off. The trip leader's name is typed
// into the form and printed here; it is never sent.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";

export const RISK_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "key", label: "Risk rating key" },
  { id: "emergency", label: "Emergency information" },
  { id: "signoff", label: "Sign-off" },
];

/** Six columns, so each fits landscape A4 with room to read: the score
 *  column holds the band, the score and how it was reached ("12 Medium (4 x 3)"). */
export const RISK_COLUMNS = ["Hazard", "Who might be harmed and how", "Risk", "Control measures", "Risk after controls", "Further action needed"];

export type RiskBand = "Low" | "Medium" | "High";

/** A 1 to 5 score from the model: rounded and kept in range; anything that is
 *  not a number is 0, which no band takes. */
export function riskPoint(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 0;
}

/** Likelihood times severity, each 1 to 5. 0 when either is missing. */
export function riskScore(likelihood: unknown, severity: unknown): number {
  return riskPoint(likelihood) * riskPoint(severity);
}

/** Low 1 to 6, Medium 8 to 12, High 15 to 25. (7, 11, 13 and 14 cannot come
 *  from two whole numbers 1 to 5, so the bands meet exactly.) */
export function riskBand(score: number): RiskBand | null {
  if (score < 1) return null;
  if (score <= 6) return "Low";
  if (score <= 12) return "Medium";
  return "High";
}

/** "12 Medium (4 × 3)": likelihood times severity, then its band. */
export function rating(l: unknown, s: unknown): string {
  const score = riskScore(l, s);
  const band = riskBand(score);
  return band ? `${score} ${band} (${riskPoint(l)} × ${riskPoint(s)})` : "";
}

export interface RiskInfo {
  activity?: string;
  yearGroup?: string;
  date?: string;
  place?: string;
  transport?: string;
  pupils?: string;
  staff?: string;
  /** Printed on the page, never sent. */
  leader?: string;
  offsite?: boolean;
}

/** "1:8" from the number of staff and pupils, or "" when either is missing. */
export function staffRatio(staff: unknown, pupils: unknown): string {
  const s = parseInt(String(staff ?? ""), 10);
  const p = parseInt(String(pupils ?? ""), 10);
  if (!(s > 0) || !(p > 0)) return "";
  return `1:${Math.ceil(p / s)}`;
}

/** A date input's yyyy-mm-dd as "4 March 2027"; anything else as typed. */
export function riskDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso.trim();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${parseInt(m[3], 10)} ${months[parseInt(m[2], 10) - 1] ?? ""} ${m[1]}`;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** A list as sentences in one cell: each ends with a full stop, joined by
 *  spaces ("Cross at lights. Staff at the front and back."). */
export function sentences(items: string[]): string {
  return items.map((s) => s.replace(/[;,]+$/, "").trim()).filter(Boolean).map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(" ");
}

/** One hazard as a table row, or null while it has not streamed in. */
export function hazardRow(raw: unknown): string[] | null {
  const h = obj(raw);
  const hazard = str(h.hazard);
  if (!hazard) return null;
  const who = [str(h.whoAtRisk), str(h.harm)].filter(Boolean).join(": ");
  return [
    hazard,
    who,
    rating(h.likelihood, h.severity),
    sentences(strs(h.controls)),
    rating(h.residualLikelihood, h.residualSeverity),
    sentences(strs(h.furtherActions)),
  ];
}

/** The model's assessment (complete or mid-stream) as a generic sheet draft. */
export function arrangeRisk(raw: unknown, info: RiskInfo = {}): Raw {
  const r = obj(undash(raw));
  const rows = arr(r.hazards).map(hazardRow).filter((x): x is string[] => !!x);
  const offsite = !!info.offsite;
  const lead = offsite ? "Trip leader" : "Activity leader";

  const details: [string, string][] = [
    ["Activity", info.activity?.trim() ?? ""],
    ["Group", info.yearGroup?.trim() ?? ""],
    ["Date", riskDate(info.date ?? "")],
    [offsite ? "Destination" : "Location", info.place?.trim() ?? ""],
    ...(offsite ? [["Transport", info.transport?.trim() ?? ""] as [string, string]] : []),
    ["Number of pupils", info.pupils?.trim() ?? ""],
    ["Number of staff", info.staff?.trim() ?? ""],
    ["Staff to pupil ratio", staffRatio(info.staff, info.pupils)],
    [lead, info.leader?.trim() ?? ""],
  ];

  const sections: Raw[] = [
    { role: "details", title: "", emoji: "", instructions: "", blocks: [{ type: "table", headers: [], rows: details }] },
    ...(str(r.summary) ? [{ role: "summary", title: "", emoji: "", instructions: "", blocks: [{ type: "text", text: str(r.summary) }] }] : []),
    {
      role: "hazards",
      title: "Hazards and controls",
      emoji: "",
      instructions: "Risk is likelihood times severity, each scored from 1 to 5.",
      blocks: rows.length ? [{ type: "table", headers: RISK_COLUMNS, rows }] : [],
    },
    {
      role: "key",
      title: "Risk rating",
      emoji: "",
      instructions: "",
      blocks: rows.length
        ? [
            {
              type: "table",
              headers: ["Score", "Rating", "What it means"],
              rows: [
                ["1 to 6", "Low", "Acceptable with the controls in place."],
                ["8 to 12", "Medium", "Check every control is in place and reduce the risk further where you can."],
                ["15 to 25", "High", "Do not go ahead until further action brings the risk down."],
              ],
            },
          ]
        : [],
    },
    ...(offsite
      ? [
          {
            role: "emergency",
            title: "Emergency information",
            emoji: "",
            instructions: "",
            blocks: rows.length
              ? [{ type: "table", headers: [], rows: [["Emergency contact at school", ""], ["Nearest A&E", ""], ["Meeting point if separated", ""], ["First aider on the visit", ""]] }]
              : [],
          },
        ]
      : []),
    {
      role: "signoff",
      title: "Sign-off",
      emoji: "",
      instructions: offsite ? "Check against your school's educational visits policy and the OEAP National Guidance before the visit is approved." : "Check against your school's health and safety policy before the activity goes ahead.",
      blocks: rows.length
        ? [
            {
              type: "table",
              headers: ["Role", "Name", "Signature", "Date"],
              rows: [[lead, info.leader?.trim() ?? "", "", ""], ...(offsite ? [["Educational Visits Coordinator (EVC)", "", "", ""]] : []), ["Headteacher", "", "", ""]],
            },
          ]
        : [],
    },
  ];

  const activity = info.activity?.trim();
  return {
    title: activity ? `Risk assessment: ${activity}` : "Risk assessment",
    objective: "",
    intro: null,
    sections: sections.filter((s) => (s.blocks as unknown[]).length > 0),
    teacherNotes: [],
  };
}
