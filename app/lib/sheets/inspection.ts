// Inspection preparation as a sheet.
//
// Leaders preparing for an inspection want, area by area: questions to ask
// themselves, actions to take, the evidence they already keep, and what good
// preparation looks like. For Ofsted the areas are the renewed framework's
// (app/lib/ofsted.ts), fixed in code and in the framework's order, and each
// graded area ends with a blank "Where are we now?" row of the five report
// card grades for leaders to tick themselves (met or not met for
// safeguarding). The model never grades. Other bodies (ISI, SIAMS, Estyn,
// Education Scotland, ETI, or one the teacher types) use the model's own
// headings under a note to check them against that body's current framework.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { actionTable, detailsTable, type ActionColumn } from "./action-plan";
import { OFSTED_GRADED_AREAS, OFSTED_GRADES, OFSTED_SAFEGUARDING, OFSTED_TOOLKIT_VERSION } from "@/app/lib/ofsted";

export type InspectionBodyId = "ofsted" | "isi" | "siams" | "estyn" | "education-scotland" | "eti" | "other";

export interface InspectionBody {
  id: InspectionBodyId;
  /** The dropdown label. */
  label: string;
  /** The short name on the page. */
  name: string;
  /** Who it inspects, for the prompt. */
  about: string;
  /** How an old free-text body is recognised. */
  match: RegExp;
}

export const INSPECTION_BODIES: InspectionBody[] = [
  { id: "ofsted", label: "Ofsted (England)", name: "Ofsted", about: "Ofsted, which inspects state-funded schools in England", match: /ofsted/i },
  { id: "isi", label: "ISI (independent schools)", name: "ISI", about: "the Independent Schools Inspectorate, which inspects independent schools in England", match: /\bisi\b|independent schools inspectorate/i },
  { id: "siams", label: "SIAMS (Church of England and Methodist schools)", name: "SIAMS", about: "SIAMS, the Statutory Inspection of Anglican and Methodist Schools, which inspects the religious character of Church of England and Methodist schools", match: /siams/i },
  { id: "estyn", label: "Estyn (Wales)", name: "Estyn", about: "Estyn, the education and training inspectorate for Wales", match: /estyn/i },
  { id: "education-scotland", label: "Education Scotland", name: "Education Scotland", about: "Education Scotland, whose HM Inspectors inspect schools in Scotland", match: /education scotland|\bhmie\b/i },
  { id: "eti", label: "ETI (Northern Ireland)", name: "ETI", about: "the Education and Training Inspectorate, which inspects schools in Northern Ireland", match: /\beti\b|education and training inspectorate/i },
  { id: "other", label: "Other", name: "", about: "", match: /^$/ },
];

/**
 * The body from the dropdown id, or an old free-text body ("an OFSTED
 * section 5", "KHDA") however it was typed. "Other" takes its name from
 * `other`. Null when there is no body to name.
 */
export function resolveInspectionBody(body: unknown, other?: unknown): { id: InspectionBodyId; name: string } | null {
  const typed = typeof body === "string" ? body.trim() : "";
  if (!typed) return null;
  if (typed.toLowerCase() === "other") {
    const name = typeof other === "string" ? other.trim() : "";
    return name ? { id: "other", name } : null;
  }
  const known = INSPECTION_BODIES.find((b) => b.id !== "other" && (b.id === typed.toLowerCase() || b.match.test(typed)));
  return known ? { id: known.id, name: known.name } : { id: "other", name: typed };
}

export const inspectionBodyAbout = (id: InspectionBodyId, name: string) =>
  INSPECTION_BODIES.find((b) => b.id === id && b.about)?.about ?? name;

export const INSPECTION_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "framework", label: "Framework note" },
  { id: "intro", label: "Introduction" },
];

export interface InspectionInfo {
  bodyId?: string;
  bodyName?: string;
  focus?: string;
  includeEvidence?: boolean;
  includeSuccessCriteria?: boolean;
  /** The school has early years (nursery or reception) provision. */
  earlyYears?: boolean;
  /** The school has a sixth form or other post-16 provision. */
  postSixteen?: boolean;
}

/** Ofsted's areas for this school, safeguarding first, in the toolkit's
 *  order; early years and post-16 only where the school has them. */
export function inspectionAreas(info: { earlyYears?: boolean; postSixteen?: boolean }): string[] {
  const graded = OFSTED_GRADED_AREAS.filter(
    (a) => !a.whereRelevant || (a.name === "Early years" ? info.earlyYears : a.name === "Post-16 provision" ? info.postSixteen : false),
  );
  return [OFSTED_SAFEGUARDING.name, ...graded.map((a) => a.name)];
}

const ACTION_COLUMNS: ActionColumn[] = [
  { key: "action", label: "Action" },
  { key: "leadRole", label: "Lead" },
  { key: "byWhen", label: "By when" },
  { key: "done", label: "Done", blank: true },
];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean);
const section = (role: string, title: string, blocks: Raw[], instructions = ""): Raw => ({ role, title, emoji: "", instructions, blocks });
const list = (title: string, style: "bullet" | "number" | "check", items: string[]): Raw[] => (items.length ? [{ type: "list", title, style, items }] : []);

function areaInstructions(name: string): string {
  if (name === OFSTED_SAFEGUARDING.name) return "Judged as met or not met, not graded.";
  const area = OFSTED_GRADED_AREAS.find((a) => a.name === name);
  return area ? `Inspectors look at ${area.focus}.` : "";
}

/** The model's guide (complete or mid-stream) as a generic sheet draft. */
export function arrangeInspection(raw: unknown, info: InspectionInfo = {}): Raw {
  const r = obj(undash(raw));
  const ofsted = info.bodyId === "ofsted";
  const bodyName = info.bodyName?.trim() || "the inspection";
  const focus = info.focus?.trim() ?? "";
  const allowed = ofsted ? inspectionAreas(info) : null;

  const seen = new Set<string>();
  const areas = arr(r.areas)
    .map(obj)
    .map((a): Raw & { name: string } => ({ ...a, name: str(a.area) }))
    .filter((a) => {
      if (!a.name) return false;
      if (allowed && !allowed.includes(a.name)) return false;
      const key = a.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (allowed) areas.sort((a, b) => allowed.indexOf(a.name) - allowed.indexOf(b.name));

  const areaSections = areas.map((a) => {
    const table = actionTable(a.actions, ACTION_COLUMNS);
    const whereNow = ofsted ? (a.name === OFSTED_SAFEGUARDING.name ? ["Met", "Not met"] : [...OFSTED_GRADES]) : [];
    return section(
      "area",
      a.name,
      [
        ...list("Self-evaluation questions", "number", strs(a.questions)),
        ...(table ? [table] : []),
        ...(info.includeEvidence ? list("Evidence you already keep", "bullet", strs(a.evidence)) : []),
        ...(info.includeSuccessCriteria ? list("What strong preparation looks like", "check", strs(a.successCriteria)) : []),
        ...list("Where are we now?", "check", whereNow),
      ],
      ofsted ? areaInstructions(a.name) : "",
    );
  });

  const note = ofsted
    ? `${OFSTED_TOOLKIT_VERSION}. There is no overall grade: each area is graded on a five-point scale, from urgent improvement to exceptional, and safeguarding is met or not met. Tick where you honestly think you are now.`
    : `Check these headings against ${bodyName}'s current framework: they are drafted from general knowledge and may not match the latest version.`;

  const intro = str(r.intro);
  const sections: Raw[] = [
    section("details", "", [detailsTable([["School", ""], ["Inspection", info.bodyName?.trim() ?? ""], ...(focus ? [["Focus", focus] as [string, string]] : []), ["Prepared by", ""], ["Date", ""]])]),
    section("framework", "", [{ type: "callout", variant: "remember", label: ofsted ? "The framework" : "Check the framework", text: note, emoji: "" }]),
    ...(intro ? [section("intro", "Introduction", [{ type: "text", text: intro }])] : []),
    ...areaSections,
  ];

  return {
    title: `Inspection preparation: ${info.bodyName?.trim() || "guide"}`,
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}
