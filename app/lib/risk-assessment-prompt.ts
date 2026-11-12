// The Risk Assessment prompt: hazards as structured JSON
// (app/lib/sheets/risk.ts) rather than a markdown table.
//
// The model gives likelihood and severity from 1 to 5 for each hazard, before
// and after the controls; code multiplies them and sets the band. The trip
// leader's name is never sent (the route refuses name keys).

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { carriesStaffName } from "@/app/lib/staff-privacy";

export interface RiskAssessmentRequest {
  curriculum?: string;
  yearGroup?: string;
  activity?: string;
  transport?: string;
  location?: string;
  resources?: string;
  offsite?: boolean;
  pupils?: string;
  staff?: string;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const point = { type: "integer" } as const;

export function riskResponseFormat() {
  const hazard = strictObject({
    hazard: str,
    harm: str,
    whoAtRisk: str,
    likelihood: point,
    severity: point,
    controls: strList,
    residualLikelihood: point,
    residualSeverity: point,
    furtherActions: strList,
  });
  const schema = strictObject({ summary: str, hazards: { type: "array", items: hazard } });
  return { type: "json_schema" as const, json_schema: { name: "risk_assessment", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced Educational Visits Coordinator and school health and safety lead in England. You know HSE's approach to risk assessment, the Health and Safety at Work etc. Act 1974, the Management of Health and Safety at Work Regulations 1999, DfE guidance on health and safety for schools and the OEAP National Guidance for educational visits. You write specific, realistic, proportionate risk assessments. " +
  "You return the assessment as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function riskAssessmentRequest(body: RiskAssessmentRequest & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof riskResponseFormat> }
  | { error: string } {
  if (carriesStaffName(body) || "leader" in body) return { error: "Names are never sent. Please reload the page and try again." };
  const curriculum = text(body.curriculum);
  const yearGroup = text(body.yearGroup);
  const activity = text(body.activity);
  if (!curriculum || !yearGroup || !activity) return { error: "Missing required fields" };
  const offsite = body.offsite === true;
  const lines = [
    `- Group: ${yearGroup} (${curriculum})`,
    `- Activity: ${activity}`,
    `- Where: ${offsite ? "off site, a trip or visit" : "on the school site"}${text(body.location) ? `, ${text(body.location)}` : ""}`,
    text(body.transport) ? `- Transport: ${text(body.transport)}` : "",
    text(body.resources) ? `- Resources and equipment: ${text(body.resources)}` : "",
    text(body.pupils) ? `- Number of pupils: ${text(body.pupils)}` : "",
    text(body.staff) ? `- Number of staff: ${text(body.staff)}` : "",
  ].filter(Boolean);

  const user = `Write a risk assessment for this school activity in England.

${lines.join("\n")}

FIELDS
- summary: one or two sentences describing the activity and its main risks.
- hazards: 10 to 14 hazards specific to this activity, across ${offsite ? "preparation, travel there and back, the visit itself and any time in public places" : "setting up, the activity itself and clearing away"}. Include at least one hazard for pupils with SEND or medical needs (such as allergies, asthma or epilepsy). For each:
  - hazard: the specific hazard, named precisely in a few words ("Crossing the busy road outside the museum", not "Roads").
  - harm: the injury or harm that could result, in a few words.
  - whoAtRisk: who could be harmed, specifically, in a few words.
  - likelihood: how likely the harm is BEFORE the controls, a whole number from 1 (very unlikely) to 5 (almost certain).
  - severity: how bad it would be, a whole number from 1 (negligible) to 5 (catastrophic).
  - controls: 2 to 4 specific, practical control measures (supervision ratios, briefings, checks, equipment), each one short sentence of at most 15 words. "Adequate supervision" is not enough.
  - residualLikelihood and residualSeverity: the same two numbers AFTER the controls are in place. Severity rarely falls; likelihood usually does.
  - furtherActions: any actions still needed before or on the day, each at most 15 words, or an empty list.

Do not calculate the scores or bands: give only the numbers. Never name a person: use roles (trip leader, first aider, EVC).`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: riskResponseFormat(),
  };
}
