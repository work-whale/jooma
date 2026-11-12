// The Pupil Premium Planner prompt: a draft of the DfE strategy statement as
// structured JSON (app/lib/sheets/pupil-premium.ts) rather than markdown.
//
// Every school in England that receives pupil premium publishes a statement
// on the DfE's template by 31 December each year. The model drafts the parts
// that are writing (the statement of intent, the challenges tidied, intended
// outcomes and the activities in the template's three areas); the school's
// facts, the funding and every cost are left for the school, built in code.
//
// The evidence lines name EEF Teaching and Learning Toolkit strands, EEF
// guidance reports or DfE guidance only, with no months of progress or effect
// sizes: those are the figures a model gets wrong.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { challengeLines, PP_AREAS } from "@/app/lib/sheets/pupil-premium";

export interface PupilPremiumRequest {
  challenges?: string;
  educationPhase?: string;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function pupilPremiumResponseFormat() {
  const activity = strictObject({ activity: str, evidence: str, challenges: { type: "array", items: { type: "integer" } } });
  const props: Record<string, unknown> = {
    intent: strList,
    challenges: { type: "array", items: strictObject({ detail: str }) },
    outcomes: { type: "array", items: strictObject({ outcome: str, successCriteria: str }) },
  };
  for (const [field] of PP_AREAS) props[field] = { type: "array", items: activity };
  return { type: "json_schema" as const, json_schema: { name: "pupil_premium_statement", strict: true, schema: strictObject(props) } };
}

const SYSTEM =
  "You are an experienced headteacher and pupil premium lead in England. You know the DfE's pupil premium guidance for school leaders and its menu of approaches, the EEF's guide to the pupil premium and the EEF Teaching and Learning Toolkit. You draft strategy statements that are specific, evidence-informed and honest. " +
  "You return the draft as JSON that matches the given schema exactly. Write in UK English, in the school's voice (\"we\", \"our pupils\"). Never use emoji. Do not use long dashes: use commas, colons or full stops.";

export function pupilPremiumRequest(body: PupilPremiumRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof pupilPremiumResponseFormat> }
  | { error: string } {
  const lines = typeof body?.challenges === "string" ? challengeLines(body.challenges) : [];
  if (lines.length === 0) return { error: "Missing required fields" };
  const phase = typeof body.educationPhase === "string" && body.educationPhase.trim() ? body.educationPhase.trim() : "Primary";
  const n = lines.length;

  const user = `Draft the writing in a pupil premium strategy statement for a ${phase} school in England, following the DfE template.

The challenges the school has identified among its disadvantaged pupils, numbered as the school numbered them:
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}

FIELDS
- intent: the statement of intent, 2 or 3 short paragraphs: our ultimate objectives for disadvantaged pupils, how this plan works towards them, and the key principles (for example high-quality teaching first, and acting early on need, not on labels).
- challenges: exactly ${n}, in the same order, each the school's challenge rewritten as one or two clear sentences (detail). Keep any figure the school gave; never add a figure it did not.
- outcomes: 3 to 6 intended outcomes for the end of the plan, each with successCriteria saying how the school will know it has been achieved, such as a measure to track. Use only figures the school gave; otherwise describe the measure without inventing a number.
- teaching, targeted, wider: the activities for the template's three areas: Teaching (CPD, recruitment and retention), Targeted academic support (tutoring, one-to-one support, structured interventions) and Wider strategies (attendance, behaviour, wellbeing). 2 to 4 activities in each. For each:
  - activity: what the school will do, specific and practical.
  - evidence: the evidence that supports it, naming an EEF Teaching and Learning Toolkit strand (such as "Oral language interventions" or "Reading comprehension strategies"), an EEF guidance report, or DfE guidance by its title. Never give months of progress, effect sizes, costs or any other figure, and never cite a study you cannot name.
  - challenges: the numbers of the challenges above that it addresses, from 1 to ${n}.

Never write a cost or a budget: the school adds those. Never invent pupil numbers, results or data. Draw the activities from the DfE menu of approaches, and make sure every challenge is addressed by at least one activity.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: pupilPremiumResponseFormat(),
  };
}
