// The EYFS Action Plan prompt: an improvement plan for an Early Years setting
// as structured JSON (app/lib/sheets/eyfs-action-plan.ts) rather than markdown.
//
// Grounded in the EYFS statutory framework for group and school-based
// providers (September 2025) and Development Matters. Leads are roles, never
// names, and the RAG and evidence columns are the school's, built in code.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { EYFS_PHASES, eyfsTimescale } from "@/app/lib/sheets/eyfs-action-plan";

export interface EyfsActionPlanRequest {
  curriculum?: string;
  objective?: string;
  timescale?: string;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function eyfsActionPlanResponseFormat() {
  const action = strictObject({ action: str, lead: str, resources: str, monitoring: str });
  const schema = strictObject({
    title: str,
    objective: str,
    rationale: str,
    successCriteria: strList,
    phases: { type: "array", items: strictObject({ title: str, when: str, actions: { type: "array", items: action } }) },
    outcomes: strList,
  });
  return { type: "json_schema" as const, json_schema: { name: "eyfs_action_plan", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced Early Years lead and adviser in England. You know the EYFS statutory framework for group and school-based providers (September 2025), Development Matters, the seven areas of learning and their Early Learning Goals, and how Early Years settings improve their provision. " +
  "You return the plan as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

export function eyfsActionPlanRequest(body: EyfsActionPlanRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof eyfsActionPlanResponseFormat> }
  | { error: string } {
  const curriculum = typeof body?.curriculum === "string" ? body.curriculum.trim() : "";
  const objective = typeof body?.objective === "string" ? body.objective.trim() : "";
  if (!curriculum || !objective) return { error: "Missing required fields" };
  const timescale = eyfsTimescale(body.timescale);

  const user = `Write an action plan for an Early Years setting (Nursery and Reception) in England.

- Curriculum: ${curriculum}
- Objective: ${objective}
- Timescale: ${timescale}

FIELDS
- title: a short title naming the focus, such as "Communication and language: action plan".
- objective: the objective restated as one clear, ambitious sentence.
- rationale: 2 or 3 sentences on why this matters for the children, referring to the EYFS statutory framework (September 2025) or Development Matters where relevant. Name Early Learning Goals exactly as the framework names them, and never invent one.
- successCriteria: 4 to 6 specific, observable criteria for the end of the plan. Never invent a figure or a baseline the school did not give.
- phases: exactly ${EYFS_PHASES}, in order, across the ${timescale.toLowerCase()} (for example audit and plan, train and launch, embed, review and sustain). For each: title (2 to 5 words), when (such as "Autumn 1" or "Weeks 1 to 4"), and 3 to 5 actions. Each action has:
  - action: one specific, practical step.
  - lead: the role who leads it, such as EYFS lead, Reception teacher, Nursery practitioner, SENCO or headteacher. Never a person's name.
  - resources: what it needs (training, time, materials), with no costs.
  - monitoring: how leaders will check it is happening and working.
- outcomes: 3 to 5 intended outcomes for the children and the staff.

Everything must suit children aged three to five and be practical for a real setting.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: eyfsActionPlanResponseFormat(),
  };
}
