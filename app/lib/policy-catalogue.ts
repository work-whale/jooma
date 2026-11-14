// The school policies the Policy Generator offers, with the facts the model
// must not guess: whether a policy is statutory, for which schools, how often
// it is reviewed, and who approves it. Printed in the policy's details box by
// code (app/lib/sheets/policy.ts). The model is never asked for them.
//
// England only. Checked on 14 November 2026 against:
// - "Maintained schools: governance guide", DfE, updated 15 July 2026
//   (policies to review annually unless stated; equality objectives every
//   4 years; allergy safety policy from September 2026)
// - Keeping children safe in education (child protection policy reviewed at
//   least annually; staff code of conduct; whistleblowing)
// - Working together to improve school attendance (statutory from August
//   2024: every school has an attendance policy)
// - the withdrawn "Statutory policies for schools and academy trusts" (DfE,
//   last updated March 2022, withdrawn March 2024) for which schools each
//   applies to, where the governance guide does not say.
// Re-check this file when the governance guides change (usually each summer).

/** Who a statutory policy applies to. */
export type PolicyStatutory =
  | "all" //        every school, independent schools included
  | "state" //      state-funded schools: maintained schools and academies
  | "maintained" // maintained schools; academies follow their own funding agreement and trust
  | "employer" //   the employer's duty (local authority, trust or governing body)
  | "admission" //  the admission authority
  | "no"; //        not statutory: good practice

export interface PolicyEntry {
  name: string;
  group: string;
  statutory: PolicyStatutory;
  /** How often to review, as the guidance says it. */
  review: string;
  /** Who approves it. */
  approver: string;
  /** Other names a teacher types for it. */
  aliases?: string[];
}

const GB = "Governing body or proprietor (can be delegated)";
const GB_ONLY = "Governing body or proprietor";
const HEAD = "Headteacher, within the governing body's written principles";
const ANNUAL = "Annually (recommended)";

export const POLICY_CATALOGUE: PolicyEntry[] = [
  // Safeguarding and welfare
  { name: "Child Protection & Safeguarding Policy", group: "Safeguarding & Welfare", statutory: "all", review: "At least annually", approver: GB_ONLY, aliases: ["safeguarding", "child protection", "safeguarding and child protection"] },
  { name: "Anti-Bullying Policy", group: "Safeguarding & Welfare", statutory: "no", review: ANNUAL, approver: HEAD, aliases: ["bullying"] },
  { name: "Online Safety (E-Safety) Policy", group: "Safeguarding & Welfare", statutory: "no", review: ANNUAL, approver: GB, aliases: ["online safety", "e-safety", "esafety"] },
  { name: "Attendance Policy", group: "Safeguarding & Welfare", statutory: "all", review: ANNUAL, approver: GB, aliases: ["attendance", "school attendance"] },
  { name: "Mental Health & Wellbeing Policy", group: "Safeguarding & Welfare", statutory: "no", review: ANNUAL, approver: GB, aliases: ["mental health"] },
  // Curriculum and learning
  { name: "Teaching & Learning Policy", group: "Curriculum & Learning", statutory: "no", review: "As the school decides (often every 2 years)", approver: GB },
  { name: "Assessment, Marking & Feedback Policy", group: "Curriculum & Learning", statutory: "no", review: "As the school decides (often every 2 years)", approver: GB, aliases: ["assessment", "marking", "feedback", "marking and feedback"] },
  { name: "Curriculum Policy", group: "Curriculum & Learning", statutory: "no", review: ANNUAL, approver: GB, aliases: ["curriculum"] },
  { name: "Homework Policy", group: "Curriculum & Learning", statutory: "no", review: "As the school decides", approver: GB, aliases: ["homework"] },
  { name: "Reading Policy", group: "Curriculum & Learning", statutory: "no", review: "As the school decides", approver: GB, aliases: ["reading"] },
  // SEND and inclusion
  { name: "SEND Policy", group: "SEND & Inclusion", statutory: "state", review: "Annually (with the SEN information report)", approver: "Governing body or proprietor (the full governing body)", aliases: ["send", "sen", "special educational needs", "sen information report"] },
  { name: "Equality & Inclusion Policy", group: "SEND & Inclusion", statutory: "state", review: "Equality objectives at least every 4 years; equality information yearly", approver: GB, aliases: ["equality", "equality objectives", "equality and diversity"] },
  { name: "English as an Additional Language (EAL) Policy", group: "SEND & Inclusion", statutory: "no", review: "As the school decides", approver: GB, aliases: ["eal", "english as an additional language"] },
  { name: "Accessibility Plan", group: "SEND & Inclusion", statutory: "all", review: "Every 3 years", approver: GB, aliases: ["accessibility"] },
  // Behaviour and pastoral
  { name: "Behaviour Policy", group: "Behaviour & Pastoral", statutory: "state", review: ANNUAL, approver: HEAD, aliases: ["behaviour", "behavior"] },
  { name: "Exclusions Policy", group: "Behaviour & Pastoral", statutory: "no", review: ANNUAL, approver: GB, aliases: ["exclusion", "exclusions", "suspensions and exclusions"] },
  { name: "Relationships & Sex Education (RSE) Policy", group: "Behaviour & Pastoral", statutory: "all", review: ANNUAL, approver: GB, aliases: ["rse", "relationships and sex education", "relationships education", "rshe"] },
  { name: "Personal, Social & Health Education (PSHE) Policy", group: "Behaviour & Pastoral", statutory: "no", review: ANNUAL, approver: GB, aliases: ["pshe"] },
  { name: "Anti-Racism Policy", group: "Behaviour & Pastoral", statutory: "no", review: ANNUAL, approver: GB, aliases: ["anti racism", "antiracism"] },
  // Health and safety
  { name: "Health & Safety Policy", group: "Health & Safety", statutory: "employer", review: ANNUAL, approver: "The employer (local authority, trust or governing body, by school type)", aliases: ["health and safety", "h&s"] },
  { name: "First Aid Policy", group: "Health & Safety", statutory: "no", review: ANNUAL, approver: "The employer, or the governing body", aliases: ["first aid"] },
  { name: "Medicines in School Policy", group: "Health & Safety", statutory: "state", review: "Regularly (recommended annually)", approver: GB, aliases: ["medicines", "medical conditions", "supporting pupils with medical conditions", "administering medicines"] },
  { name: "Educational Visits Policy", group: "Health & Safety", statutory: "no", review: ANNUAL, approver: GB, aliases: ["educational visits", "school trips", "off-site visits"] },
  // Staff and HR
  { name: "Staff Code of Conduct", group: "Staff & HR", statutory: "all", review: ANNUAL, approver: GB_ONLY, aliases: ["code of conduct", "staff behaviour policy", "staff conduct"] },
  { name: "Performance Management Policy", group: "Staff & HR", statutory: "maintained", review: ANNUAL, approver: GB_ONLY, aliases: ["appraisal", "performance management", "appraisal and capability", "capability"] },
  { name: "Whistleblowing Policy", group: "Staff & HR", statutory: "state", review: ANNUAL, approver: GB_ONLY, aliases: ["whistleblowing"] },
  { name: "Safer Recruitment Policy", group: "Staff & HR", statutory: "no", review: ANNUAL, approver: GB, aliases: ["safer recruitment", "recruitment"] },
  { name: "Staff Wellbeing Policy", group: "Staff & HR", statutory: "no", review: "As the school decides", approver: GB, aliases: ["staff wellbeing", "wellbeing"] },
  // Data and privacy
  { name: "Data Protection Policy (GDPR)", group: "Data & Privacy", statutory: "all", review: ANNUAL, approver: GB, aliases: ["data protection", "gdpr", "uk gdpr"] },
  { name: "Freedom of Information Policy", group: "Data & Privacy", statutory: "state", review: ANNUAL, approver: GB, aliases: ["freedom of information", "foi", "publication scheme"] },
  { name: "CCTV Policy", group: "Data & Privacy", statutory: "no", review: ANNUAL, approver: GB, aliases: ["cctv"] },
  // Governance and administration
  { name: "Admissions Policy", group: "Governance & Administration", statutory: "admission", review: "Determined every year; consult at least every 7 years, or before any change", approver: "The admission authority", aliases: ["admissions", "admission arrangements"] },
  { name: "Complaints Policy", group: "Governance & Administration", statutory: "all", review: ANNUAL, approver: GB, aliases: ["complaints", "complaints procedure"] },
  { name: "Pay Policy", group: "Governance & Administration", statutory: "maintained", review: "Annually", approver: "Governing body (the relevant body)", aliases: ["pay", "teachers pay", "teachers' pay"] },
  { name: "Financial Regulations Policy", group: "Governance & Administration", statutory: "no", review: ANNUAL, approver: "Governing body or trust board", aliases: ["financial regulations", "finance"] },
];

/** The side panel's groups, in order. */
export const POLICY_GROUPS: { label: string; policies: string[] }[] = POLICY_CATALOGUE.reduce<{ label: string; policies: string[] }[]>((groups, p) => {
  const g = groups.find((x) => x.label === p.group);
  if (g) g.policies.push(p.name);
  else groups.push({ label: p.group, policies: [p.name] });
  return groups;
}, []);

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(policy|plan)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The catalogue entry for a policy name, typed or picked; null when it is
 *  not one we hold, so its status is never guessed. */
export function findPolicy(name: string): PolicyEntry | null {
  const k = key(name ?? "");
  if (!k) return null;
  return (
    POLICY_CATALOGUE.find((p) => key(p.name) === k || (p.aliases ?? []).some((a) => key(a) === k)) ??
    // "Data Protection Policy (GDPR)" typed as "GDPR": the bracket alone.
    POLICY_CATALOGUE.find((p) => /\(([^)]+)\)/.exec(p.name)?.[1] && key(/\(([^)]+)\)/.exec(p.name)![1]) === k) ??
    null
  );
}

/** The status line for the details box. */
export function policyStatusText(p: PolicyEntry): string {
  switch (p.statutory) {
    case "all": return "Statutory for all schools in England, including independent schools";
    case "state": return "Statutory for state-funded schools in England (maintained schools and academies)";
    case "maintained": return "Statutory for maintained schools; academies follow their funding agreement and trust policy";
    case "employer": return "Required of the employer (the local authority, trust or governing body, by school type)";
    case "admission": return "Statutory for the admission authority (the trust, governing body or local authority, by school type)";
    case "no": return "Not statutory: recommended good practice";
  }
}
