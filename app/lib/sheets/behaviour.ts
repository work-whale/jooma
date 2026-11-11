// A Behaviour Support Plan as a sheet.
//
// UK schools use a familiar two-column form for these, and staff expect it:
// behaviours beside targets, triggers beside strategies, proactive strategies
// beside early warning signs, de-escalation beside support after an incident,
// then an incident log and signatures. The model fills one fixed shape
// (behaviourResponseFormat in app/lib/behaviour-prompt.ts); code arranges it
// into those boxes.
//
// Built in code, never by the model and never sent to it: the details table
// (class, needs, staff, dates), the blank incident log and the signature
// lines. Each is a section with a role, so Design can switch it off and Jo's
// copy of the plan leaves it out (PRIVATE_ROLES).
//
// The child is "[PUPIL]" throughout; the page puts the name in
// (app/lib/sheets/pupil.ts).
//
// Pure, and free of React and of normalize.ts.

import { undash } from "./undash";
import { PLACEHOLDER } from "@/app/lib/reports/privacy";
import { formatLetterDate } from "./letter";

/** Facts from the form that go on the page as they are, never to a model. */
export interface PupilFact {
  label: string;
  value: string;
}

/** Sections built from what the teacher typed, kept out of Jo's copy. */
export const PRIVATE_ROLES = ["details", "log", "signatures", "links"];

/** The parts of a behaviour plan Design can switch off. */
export const BEHAVIOUR_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Pupil details" },
  { id: "log", label: "Incident log" },
  { id: "signatures", label: "Signatures" },
];

/** How many blank rows the incident log starts with. */
export const INCIDENT_LOG_ROWS = 6;

/** The paired boxes, in page order: [left field, left heading, right field,
 *  right heading]. One fixed list, read by the arrangement and the prompt. */
export const BEHAVIOUR_PAIRS: { section: string; pairs: [string, string, string, string][] }[] = [
  {
    section: "Behaviours and targets",
    pairs: [
      ["behaviours", "What does the behaviour look like?", "targets", "What are we working towards?"],
      ["triggers", "What triggers it?", "strategies", "How do we get there?"],
    ],
  },
  {
    section: "Keeping things positive",
    pairs: [
      ["proactive", "How do we keep behaviour positive?", "prevention", "How do we prevent an incident?"],
      ["phrases", "Phrases to use", "warningSigns", "Early warning signs to look out for"],
      ["rewards", "Rewards and motivators", "responses", "How to respond (reminders, another space)"],
      ["movementBreaks", "Movement breaks", "distraction", "Distraction: what works?"],
    ],
  },
  {
    section: "If an incident happens",
    pairs: [
      ["deEscalation", "How do we calm the situation?", "afterIncident", "Support after an incident"],
      ["doThis", "Do", "avoidThis", "Don't"],
      ["calmPhrases", "Phrases to use", "calming", "Calming techniques"],
    ],
  },
  {
    section: "Strengths and dislikes",
    pairs: [["strengths", "Strengths and interests", "dislikes", "Dislikes"]],
  },
  {
    section: "Reviewing the plan",
    pairs: [["successCriteria", "How we will know the plan is working", "reviewSuggestions", "To think about at the review"]],
  },
];

/** Every list field the model fills. */
export const BEHAVIOUR_LIST_FIELDS = [...BEHAVIOUR_PAIRS.flatMap((g) => g.pairs.flatMap(([l, , r]) => [l, r])), "highRiskTimes"];

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

/** "10 November 2026" for an ISO date from the form; anything else as typed. */
export function factDate(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? formatLetterDate(v.trim()) : v.trim();
}

/** The code-built sections: details first, the log and signatures last. */
export function behaviourCodeSections(facts: PupilFact[]): { details: Raw; log: Raw; signatures: Raw } {
  return {
    details: {
      role: "details",
      title: "Pupil details",
      emoji: "🧾",
      instructions: "",
      blocks: [{ type: "table", headers: [], rows: [["Pupil", PLACEHOLDER], ...facts.map((f) => [f.label, f.value])] }],
    },
    log: {
      role: "log",
      title: "Log of incidents",
      emoji: "🗒️",
      instructions: "Fill in by hand after each incident.",
      blocks: [{ type: "table", headers: ["Date", "What happened", "What led to it", "Action taken"], rows: Array.from({ length: INCIDENT_LOG_ROWS }, () => ["", "", "", ""]) }],
    },
    signatures: {
      role: "signatures",
      title: "Agreement",
      emoji: "✍️",
      instructions: "",
      blocks: [{ type: "table", headers: ["Parent or carer", "Member of staff"], rows: [["Name:", "Name:"], ["Signature:", "Signature:"], ["Date:", "Date:"]] }],
    },
  };
}

/**
 * The model's plan (complete or mid-stream) as a generic sheet draft for
 * normalizeDraft: the details, the paired boxes in their sections, then the
 * log and signatures. A box appears as soon as either side has something.
 */
export function arrangeBehaviour(raw: unknown, facts: PupilFact[]): Raw {
  // Long dashes out of what the model wrote (app/lib/sheets/undash.ts).
  const r = obj(undash(raw));
  const code = behaviourCodeSections(facts);
  const groups: Raw[] = BEHAVIOUR_PAIRS.map((g) => {
    const blocks: Raw[] = g.pairs
      .map(([l, lt, rf, rt]) => ({ type: "twocol", left: { title: lt, items: strs(r[l]) }, right: { title: rt, items: strs(r[rf]) } }))
      .filter((b) => b.left.items.length || b.right.items.length);
    if (g.section === "Keeping things positive") {
      const times = strs(r.highRiskTimes);
      if (times.length) blocks.push({ type: "list", title: "Situations and times likely to trigger a reaction", style: "bullet", items: times });
    }
    if (g.section === "If an incident happens" && str(r.escalation)) {
      blocks.push({ type: "callout", variant: "remember", label: "Tell another adult when:", emoji: "📣", text: str(r.escalation) });
    }
    return { role: "", title: g.section, emoji: "", instructions: "", blocks };
  }).filter((s) => (s.blocks as unknown[]).length > 0);

  return {
    title: `Behaviour Support Plan: ${PLACEHOLDER}`,
    objective: "",
    intro: null,
    sections: [code.details, ...groups, code.log, code.signatures],
    teacherNotes: [],
  };
}
