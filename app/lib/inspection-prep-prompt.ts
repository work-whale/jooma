// The Inspection Prep prompt: the guide as structured JSON
// (app/lib/sheets/inspection.ts), pure so it can be tested.
//
// For Ofsted the guide is organised by the renewed framework's evaluation
// areas (app/lib/ofsted.ts), which replaced the four old judgements in
// November 2025; the areas are a fixed list in the schema. Any other body
// (ISI, SIAMS, Estyn, Education Scotland, ETI, or one the teacher typed)
// names its own framework's areas. The model never grades or predicts a
// grade: leaders tick where they are on the page. The old "recent policy
// developments" section is gone: the model's knowledge of recent changes is
// months old, so it could only guess.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { OFSTED_GRADED_AREAS, OFSTED_SAFEGUARDING, ofstedFrameworkSummary } from "@/app/lib/ofsted";
import { inspectionAreas, inspectionBodyAbout, resolveInspectionBody } from "@/app/lib/sheets/inspection";

export interface InspectionPrepBody {
  inspectionBody?: string;
  /** The body's name when the dropdown is "Other". */
  otherBody?: string;
  inspectionFocus?: string;
  includeEvidence?: boolean;
  includeSuccessCriteria?: boolean;
  earlyYears?: boolean;
  postSixteen?: boolean;
}

export const isOfsted = (body: string) => resolveInspectionBody(body)?.id === "ofsted";

const str = { type: "string" } as const;
const strings = { type: "array", items: str } as const;

/** The schema: Ofsted's areas as a fixed list, or free headings (null). */
export function inspectionResponseFormat(areas: string[] | null) {
  const action = strictObject({ action: str, leadRole: str, byWhen: str });
  const area = strictObject({
    area: areas ? { type: "string", enum: areas } : str,
    questions: strings,
    actions: { type: "array", items: action },
    evidence: strings,
    successCriteria: strings,
  });
  const schema = strictObject({ intro: str, areas: { type: "array", items: area } });
  return { type: "json_schema" as const, json_schema: { name: "inspection_preparation", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK school leader and inspection readiness consultant with precise, up-to-date knowledge of Ofsted's renewed education inspection framework, its report cards and its school inspection toolkit, and of the frameworks used by ISI, SIAMS, Estyn, Education Scotland, the ETI and international accreditation bodies. " +
  "You know what inspectors look for, how they triangulate evidence, and where schools most commonly have weaknesses. You write specific, immediately practical guidance for senior leadership teams. " +
  "You return the guide as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

function areaLine(name: string): string {
  if (name === OFSTED_SAFEGUARDING.name) return `- ${name}: ${OFSTED_SAFEGUARDING.focus}.`;
  const a = OFSTED_GRADED_AREAS.find((x) => x.name === name);
  return `- ${name}: ${a?.focus ?? ""}.`;
}

/** The messages and schema for one guide, or `{ error }` for a request the
 *  model should never see. An old `includePolicyChanges` is ignored. */
export function inspectionPrepRequest(body: InspectionPrepBody & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof inspectionResponseFormat> }
  | { error: string } {
  const resolved = resolveInspectionBody(body.inspectionBody, body.otherBody);
  if (!resolved) return { error: "Missing required fields" };
  const focus = typeof body.inspectionFocus === "string" ? body.inspectionFocus.trim() : "";
  const ofsted = resolved.id === "ofsted";
  const areas = ofsted ? inspectionAreas({ earlyYears: body.earlyYears === true, postSixteen: body.postSixteen === true }) : null;
  const about = inspectionBodyAbout(resolved.id, resolved.name);

  const framework = ofsted
    ? `${ofstedFrameworkSummary()}

Cover exactly ${areas!.length} areas, one for each below, in this order, using the area name exactly as written:
${areas!.map(areaLine).join("\n")}

Inspectors gather first-hand evidence mainly through professional conversations and observing the school's day-to-day work, often alongside leaders, so prepare leaders to talk about their work rather than to produce paperwork. Ofsted does not want documents produced specially for inspection: favour evidence the school already keeps.`
    : `Use ${resolved.name}'s own current framework: name 5 to 8 of its evaluation areas or key questions, using its own wording, in the order the framework uses. Never borrow Ofsted's areas or grades unless the body is Ofsted.`;

  const user = `Write an inspection preparation guide for senior leaders preparing for an inspection by ${about}${focus ? `, with a particular focus on ${focus}` : ""}.

${framework}

Never grade the school, predict a grade or outcome, or say which grade an area would get: leaders judge that themselves on the page. Refer to people by role only (headteacher, designated safeguarding lead, SENCo, governors), never by name.

FIELDS
- intro: 3 or 4 sentences on the purpose of the guide, what ${resolved.name} looks at${focus ? ` with this focus` : ""}, and where schools most often fall short.
- areas: for each area:
  - area: its name.
  - questions: 5 reflective self-evaluation questions that mirror what inspectors ask, challenge assumptions and surface gaps as well as strengths, from strategic to operational${focus ? `, with extra weight on ${focus} where it fits` : ""}. Each at most 30 words.
  - actions: 4 specific preparation actions, each with action (one concrete step, at most 25 words), leadRole (a role) and byWhen (for example "Within two weeks" or "Before half term").
  - evidence: ${body.includeEvidence ? "3 or 4 kinds of evidence the school already keeps that show this area, each at most 15 words." : "an empty list."}
  - successCriteria: ${body.includeSuccessCriteria ? "2 or 3 signs that the school is well prepared in this area, each at most 20 words." : "an empty list."}`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: inspectionResponseFormat(areas),
  };
}
