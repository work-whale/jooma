// The Policy Generator prompt: the policy as structured JSON
// (app/lib/sheets/policy.ts), pure so it can be tested.
//
// The model writes the substance only. Whether the policy is statutory, its
// review cycle, who approves it, dates and versions are printed by code from
// app/lib/policy-catalogue.ts or left blank for the school; the schema does
// not even have fields for them. People are named by role only, and titled
// names typed into the requirements ("Mrs Khan") are scrubbed before sending.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { ofstedFrameworkSummary } from "@/app/lib/ofsted";
import { scrubStaffTitles } from "@/app/lib/staff-privacy";
import { isEnglandCurriculum } from "@/app/lib/sheets/policy";

export interface PolicyBody {
  curriculum?: string;
  policy?: string;
  additionalRequirements?: string;
  outputType?: string;
}

const str = { type: "string" } as const;

export function policyResponseFormat() {
  const schema = strictObject({
    summary: str,
    sections: { type: "array", items: strictObject({ title: str, clauses: { type: "array", items: str } }) },
    roles: { type: "array", items: strictObject({ role: str, duties: str }) },
    references: { type: "array", items: strictObject({ title: str, note: str }) },
    linkedPolicies: { type: "array", items: str },
  });
  return { type: "json_schema" as const, json_schema: { name: "school_policy", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK school policy writer and governance specialist with comprehensive knowledge of UK education legislation, statutory DfE guidance and best practice in school governance. You write professional, accurate policies that read as though written by an experienced school leader, not assembled from generic templates. " +
  "You return the policy as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

/** The nation a curriculum belongs to, for the law the policy follows. */
function nation(curriculum: string): string {
  if (/scot/i.test(curriculum)) return "Scotland";
  if (/wales|welsh/i.test(curriculum)) return "Wales";
  if (/northern ireland/i.test(curriculum)) return "Northern Ireland";
  return "England";
}

export function policyRequest(body: PolicyBody & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof policyResponseFormat> }
  | { error: string } {
  const curriculum = typeof body.curriculum === "string" ? body.curriculum.trim() : "";
  const policy = typeof body.policy === "string" ? body.policy.trim() : "";
  if (!curriculum || !policy) return { error: "Missing required fields" };
  const extra = typeof body.additionalRequirements === "string" ? scrubStaffTitles(body.additionalRequirements.trim(), "colleague") : "";
  const outline = body.outputType === "structure";
  const where = nation(curriculum);

  const user = `${outline ? "Draft the section outline" : "Draft the full text"} of a "${policy}" for a school in ${where} (curriculum: ${curriculum}).${extra ? `\n\nTHE SCHOOL'S REQUIREMENTS: ${extra}` : ""}

${isEnglandCurriculum(curriculum) ? `${ofstedFrameworkSummary()}\n\n` : ""}Follow the current law and statutory guidance for schools in ${where}. Include every section a high-quality policy of this type would have. Refer to people by role only (headteacher, designated safeguarding lead, SENCo, governors), never by name. Where the policy needs a fact only the school knows (a contact, a time, a local arrangement), write "[school to add]". Do not write the school's name, dates, a review date, a version or who approves the policy: those are added separately.

FIELDS
- summary: 2 or 3 sentences on the purpose and aims of the policy.
- sections: the policy's sections in order (not the purpose, roles, references or linked policies, which have their own fields). For each, title: a short heading with no number. ${
    outline
      ? "clauses: 2 or 3 notes on what the school should write in this section, and which law or guidance it should follow. Do not write the policy text itself."
      : "clauses: the policy text, one clause per item, each a complete paragraph of 1 to 3 sentences, specific and substantive, never placeholder text. Use 6 to 10 sections."
  }
- roles: who is responsible for what, one role per item: role (for example "Governing body", "Headteacher", "All staff") and duties (one or two sentences).
- references: the legislation and statutory guidance the policy follows. List only laws and guidance you are sure exist, each with its exact title and year if you know it, and a note of a few words on why it applies.
- linkedPolicies: 2 to 4 related school policies, by name.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: policyResponseFormat(),
  };
}
