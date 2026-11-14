// The School Improvement Plan prompt: the plan as structured JSON
// (app/lib/sheets/sip.ts), pure so it can be tested.
//
// One plan, not the old table and narrative formats: a short narrative, an
// action table per priority the school gave, and a half-termly monitoring
// calendar. It speaks the language of Ofsted's renewed framework (report
// cards and evaluation areas, from November 2025: app/lib/ofsted.ts), never
// the old "intent, implementation and impact". Facts the school did not give
// (results, demographics, inspection history) are "[school to add]", never
// invented, and costs are not asked for at all: the Cost and RAG columns are
// added blank in code.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { ofstedFrameworkSummary } from "@/app/lib/ofsted";
import { challengeLines } from "@/app/lib/sheets/pupil-premium";
import { SIP_HALF_TERMS, SIP_OFSTED_AREAS, sipYears } from "@/app/lib/sheets/sip";

export interface SipBody {
  schoolType?: string;
  areasToImprove?: string;
  schoolContext?: string;
  planTimeframe?: number | string;
}

const str = { type: "string" } as const;

export function sipResponseFormat() {
  const action = strictObject({ action: str, leadRole: str, timescale: str, monitoring: str, successCriteria: str });
  const priority = strictObject({ title: str, ofstedArea: { type: "string", enum: SIP_OFSTED_AREAS }, actions: { type: "array", items: action } });
  const schema = strictObject({
    summary: str,
    context: str,
    rationale: str,
    priorities: { type: "array", items: priority },
    monitoring: { type: "array", items: strictObject({ halfTerm: { type: "string", enum: SIP_HALF_TERMS }, activity: str }) },
  });
  return { type: "json_schema" as const, json_schema: { name: "school_improvement_plan", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK school improvement specialist and school leadership consultant with deep knowledge of Ofsted's renewed education inspection framework and its report cards, DfE school improvement guidance, and evidence-based approaches to raising standards. You help headteachers and senior leaders draft rigorous School Improvement Plans that are specific, measurable and realistic. " +
  "You return the plan as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

export function sipRequest(body: SipBody & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof sipResponseFormat> }
  | { error: string } {
  const areas = typeof body.areasToImprove === "string" ? challengeLines(body.areasToImprove) : [];
  if (!areas.length) return { error: "Missing required fields" };
  if (body.schoolContext !== undefined && typeof body.schoolContext !== "string") return { error: "Missing required fields" };
  const context = typeof body.schoolContext === "string" ? body.schoolContext.trim() : "";
  const schoolType = typeof body.schoolType === "string" && body.schoolType.trim() ? body.schoolType.trim() : "Primary";
  const years = sipYears(body.planTimeframe);
  const n = areas.length;

  const user = `Draft a School Improvement Plan for a ${schoolType} school in England, over ${years} ${years === 1 ? "year" : "years"}.

PRIORITIES (the school's own, one priority each, in this order):
${areas.map((a, i) => `${i + 1}. ${a}`).join("\n")}${context ? `\n\nSCHOOL CONTEXT: ${context}` : ""}

${ofstedFrameworkSummary()}

Use only the context given. Where a fact is not given (results, baseline data, pupil numbers, demographics, inspection history), write "[school to add]" for the school to complete. Never invent data, and never write costs or budgets: the school adds those. Refer to people by role only (headteacher, English lead, attendance lead, governors), never by name.

FIELDS
- summary: 2 or 3 sentences on what the plan sets out to achieve.
- context: 2 or 3 sentences on the school's context, from the context given, with "[school to add]" where facts are missing.
- rationale: 2 or 3 sentences on why these priorities matter now, citing DfE guidance or EEF evidence by name only where you are sure it exists.
- priorities: exactly ${n} ${n === 1 ? "priority" : "priorities"}, one for each above, in the same order. title: the priority in a few words. ofstedArea: the evaluation area it most improves. actions: 4 to 6 actions, each field at most 20 words, each with action (one specific step), leadRole (a role), timescale (for example "From September" or "By February half term"), monitoring (how leaders will check it), successCriteria (measurable, with "[school to add]" for any figure the school must set).
- monitoring: 6 to 8 monitoring activities across the year, each with the halfTerm it happens in and the activity in one sentence.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: sipResponseFormat(),
  };
}
