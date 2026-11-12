// The Interventions prompt: strategies for one pupil as structured JSON
// (app/lib/sheets/intervention.ts) rather than markdown.
//
// The data describes one child, sometimes with special educational needs,
// attendance or pastoral notes, so the child's name never arrives here: the
// form scrubs it to "[PUPIL]" in every box (app/lib/sheets/pupil.ts) and
// this refuses a request with a name field.

import { buildSystem } from "@/app/lib/systemPrompt";
import { differentiationPrompt, type Differentiate } from "@/app/lib/differentiation";
import { strictObject } from "@/app/lib/sheets/schema";
import { carriesPupilName } from "@/app/lib/behaviour-prompt";
import { pupilReference } from "@/app/lib/targets-prompt";
import type { PupilPronouns } from "@/app/lib/sheets/types";

export interface TargetedInterventionRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  attitudinalData: string;
  aptitudinalData?: string;
  attainmentData?: string;
  otherData?: string;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
  named?: boolean;
  pronouns?: PupilPronouns;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function interventionResponseFormat() {
  const strategy = strictObject({ name: str, summary: str, steps: strList, whoAndWhen: str, measure: str });
  const schema = strictObject({ findings: strList, strategies: { type: "array", items: strategy }, practiceFocus: str });
  return { type: "json_schema" as const, json_schema: { name: "intervention_ideas", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced UK SENCO and intervention specialist. You know the SEND Code of Practice (2015) and the evidence on what closes gaps, such as the EEF's guidance on teaching assistants, metacognition and small-group tuition. " +
  "Your strategies are specific, realistic for a busy school and tied directly to the information you are given. " +
  "You return them as JSON that matches the given schema exactly. Write in UK English for teachers. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

export function interventionRequest(body: TargetedInterventionRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof interventionResponseFormat> }
  | { error: string } {
  if (carriesPupilName(body)) return { error: "A pupil's name is never sent. Please reload the page and try again." };
  const curriculum = body?.curriculum?.trim();
  const yearGroup = body?.yearGroup?.trim();
  const subject = body?.subject?.trim();
  const attitudinal = body?.attitudinalData?.trim();
  if (!curriculum || !yearGroup || !subject || !attitudinal) return { error: "Missing required fields" };

  const line = (label: string, v: string | undefined) => (v?.trim() ? `\n- ${label}: ${v.trim()}` : "");
  const adaptation = differentiationPrompt(body.differentiate ?? "no", body.differentiationLevels ?? []);

  const user = `Suggest intervention strategies for one pupil.

${pupilReference(body.named, body.pronouns)}

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- Subject: ${subject}
- Attitudes to self, school and learning: ${attitudinal}${line("Aptitudes (for example CAT scores)", body.aptitudinalData)}${line("Attainment", body.attainmentData)}${line("Other information", body.otherData)}${adaptation ? `\n\nDIFFERENTIATION: ${adaptation}` : ""}

FIELDS
- findings: 2 to 4 short points on what the information suggests: the strengths to build on, the gaps and any tension between them. Draw only on what you were given; never invent a score, a diagnosis or a detail.
- strategies: 8 to 10 strategies, most useful first, each realistic for a class teacher, a TA or a SENCO to run in school:
  - name: a short, specific name.
  - summary: two sentences on what to do and why it suits this pupil, pointing to the information that led to it.
  - steps: 2 or 3 concrete things to do, specific enough to use in a lesson or session.
  - whoAndWhen: who runs it (by role, never by name) and how often, such as "TA, three 15 minute sessions a week".
  - measure: what staff will see or count when it is working, and when to check.
- practiceFocus: one line describing a practice worksheet that would help, such as "Recall of the 7, 8 and 9 times tables". It becomes a link to make that worksheet.

Do not cite research by author and year. Do not add a preamble or closing summary.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: interventionResponseFormat(),
  };
}
