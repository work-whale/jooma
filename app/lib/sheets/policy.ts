// A school policy as a sheet.
//
// The model writes the policy's substance (app/lib/policy-prompt.ts): a
// purpose, numbered sections of clauses (or, for an outline, notes on what
// each section should say), roles, references and linked policies. Code adds
// the facts it must not guess, from app/lib/policy-catalogue.ts: whether the
// policy is statutory, how often it is reviewed and who approves it, plus
// blanks for the school (dates, version, owner) and a blank version history.
// Clause numbers ("2.1") are written into the text by code, so the page, the
// Word file and Copy all agree.
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { detailsTable } from "./action-plan";
import { findPolicy, policyStatusText } from "@/app/lib/policy-catalogue";

export const POLICY_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "history", label: "Version history" },
];

export interface PolicyInfo {
  policy?: string;
  curriculum?: string;
  /** "full" (the default) or "structure", an outline. */
  outputType?: string;
}

/** The national curriculum or EYFS: England. The other nations' curricula
 *  are not, and their policy law differs. */
export const isEnglandCurriculum = (c: string | undefined) => !/scot|wales|welsh|northern ireland/i.test(c ?? "");

const CHECK_STATUS = "Check whether this policy is statutory for your school";
const REFERENCES_NOTE = "Drafted from general knowledge: check these are the current versions, and their dates, before the policy is approved.";

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const section = (role: string, title: string, blocks: Raw[], instructions = ""): Raw => ({ role, title, emoji: "", instructions, blocks });

/** The model's policy (complete or mid-stream) as a generic sheet draft. */
export function arrangePolicy(raw: unknown, info: PolicyInfo = {}): Raw {
  const r = obj(undash(raw));
  const name = info.policy?.trim() || "School policy";
  const entry = isEnglandCurriculum(info.curriculum) ? findPolicy(name) : null;
  const outline = info.outputType === "structure";

  const details = section("details", "", [
    detailsTable([
      ["School", ""],
      ["Status", entry ? policyStatusText(entry) : CHECK_STATUS],
      ["Review", entry?.review ?? ""],
      ["Approved by", entry?.approver ?? ""],
      ["Policy owner", ""],
      ["Date adopted", ""],
      ["Next review", ""],
      ["Version", ""],
    ]),
  ]);

  const summary = str(r.summary);
  const body = arr(r.sections)
    .map(obj)
    .map((s) => ({ title: str(s.title), clauses: arr(s.clauses).map(str).filter(Boolean) }))
    .filter((s) => s.title && s.clauses.length);
  const roles = arr(r.roles)
    .map(obj)
    .map((x) => [str(x.role), str(x.duties)])
    .filter(([role, duties]) => role && duties);
  const references = arr(r.references)
    .map(obj)
    .map((x) => [str(x.title), str(x.note)])
    .filter(([title]) => title)
    .map(([title, note]) => (note ? `${title}: ${note}` : title));
  const linked = arr(r.linkedPolicies).map(str).filter(Boolean);

  // Numbered parts, in order; each only once it has something in it.
  const parts: { title: string; blocks: (n: number) => Raw[]; instructions?: string }[] = [];
  if (summary) parts.push({ title: "Purpose", blocks: () => [{ type: "text", text: summary }] });
  for (const s of body) {
    parts.push({
      title: s.title,
      blocks: (n) => s.clauses.map((c, i) => ({ type: "text", text: `${n}.${i + 1} ${c}` })),
      instructions: outline ? "Write this section to cover:" : "",
    });
  }
  if (roles.length) parts.push({ title: "Roles and responsibilities", blocks: () => [{ type: "table", headers: ["Role", "Responsibilities"], rows: roles }] });
  if (summary || body.length) {
    parts.push({
      title: "Legislation and guidance",
      blocks: () => [
        { type: "callout", variant: "remember", label: "Check the references", text: REFERENCES_NOTE, emoji: "" },
        ...(references.length ? [{ type: "list", title: "", style: "bullet", items: references }] : []),
      ],
    });
  }
  if (linked.length) parts.push({ title: "Linked policies", blocks: () => [{ type: "list", title: "", style: "bullet", items: linked }] });

  const numbered = parts.map((p, i) => section("policy", `${i + 1}. ${p.title}`, p.blocks(i + 1), p.instructions ?? ""));

  const history = section("history", "Version history", [
    { type: "table", headers: ["Version", "Date", "Changes", "Approved by"], rows: [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]] },
  ]);

  return {
    title: name,
    objective: "",
    intro: null,
    sections: [details, ...numbered, ...(numbered.length ? [history] : [])],
    teacherNotes: [],
  };
}
