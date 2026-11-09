// The Inspection Prep prompt, kept out of the route so it can be tested.
//
// For Ofsted the guide is organised by the renewed framework's evaluation
// areas (app/lib/ofsted.ts), which replaced the four old judgements in
// November 2025. Any other body (ISI, SIAMS, CIS, BSO and so on) gets a
// generic set of headings and is asked to use its own framework's language.

import { buildSystem } from "@/app/lib/systemPrompt";
import { OFSTED_GRADED_AREAS, OFSTED_SAFEGUARDING, ofstedFrameworkSummary } from "@/app/lib/ofsted";

export interface InspectionPrepBody {
  inspectionBody?: string;
  inspectionFocus?: string;
  includeEvidence?: boolean;
  includeSuccessCriteria?: boolean;
  includePolicyChanges?: boolean;
}

export const isOfsted = (body: string) => /ofsted/i.test(body);

/** The Ofsted headings: safeguarding first, as in the toolkit, then each
 *  graded area with what inspectors look at. */
export function ofstedCategories(): string {
  return [OFSTED_SAFEGUARDING, ...OFSTED_GRADED_AREAS]
    .map((a) => `### ${a.name}${a.whereRelevant ? " (where applicable)" : ""}\nFocus on ${a.focus}.`)
    .join("\n\n");
}

const GENERIC_CATEGORIES = `### Leadership and Management
### Quality of Teaching and Learning
### Pupil Welfare and Safeguarding
### Academic Outcomes and Progress
### Personal Development and Wellbeing
### Community and Parental Engagement
### Staff Development and Organisational Culture`;

const SYSTEM =
  "You are an expert UK school leader, former Ofsted inspector, and inspection readiness consultant with precise, up-to-date knowledge of Ofsted's renewed education inspection framework, its report cards and its school inspection toolkit. " +
  "You also have extensive knowledge of ISI, SIAMS, CIS, BSO, KHDA, and other UK and international educational inspection and accreditation processes. " +
  "You know what inspectors look for, how they triangulate evidence, what language appears in the grade descriptors, and where schools most commonly have weaknesses. " +
  "You write authoritative, specific, and immediately practical guidance for senior leadership teams preparing for inspections. You write in professional UK English and use accurate, framework-aligned inspection terminology.";

/** The messages for one guide, or `{ error }` for a request the model should
 *  never see. */
export function inspectionPrepRequest(body: InspectionPrepBody):
  | { messages: { role: "system" | "user"; content: string }[] }
  | { error: string } {
  const inspectionBody = body.inspectionBody?.trim();
  if (!inspectionBody) return { error: "Missing required fields" };
  const focus = body.inspectionFocus?.trim() ?? "";
  const ofsted = isOfsted(inspectionBody);

  const focusClause = focus ? ` with a specific focus on **${focus}**` : "";

  const evidenceNote = body.includeEvidence
    ? `\n\n## Recommended Evidence\nList 6 to 8 types of evidence that senior leaders should gather before the inspection. For each, use the format: **Evidence Type**: Explanation of why this evidence is useful and what it demonstrates to inspectors.${ofsted ? " Remember Ofsted does not want documents produced specially for inspection: favour evidence the school already keeps as part of its normal work." : ""}`
    : "";

  const successNote = body.includeSuccessCriteria
    ? `\n\n## Success Criteria\nList 5 to 7 clear success criteria that would indicate the school is well-prepared for this inspection${focusClause}. For each, use the format: **Criterion**: Description of what strong preparation looks like.`
    : "";

  const policyNote = body.includePolicyChanges
    ? `\n\n## Recent Policy Developments\nList 5 recent or emerging policy developments relevant to ${inspectionBody} inspections${focus ? ` and ${focus}` : ""}. For each, use the format: **Development**: Description of what has changed, when it took effect, and why it matters for inspection preparation.`
    : "";

  const categories = ofsted ? ofstedCategories() : GENERIC_CATEGORIES;

  const frameworkNote = ofsted
    ? `\n\nIMPORTANT, Ofsted framework context: ${ofstedFrameworkSummary()} Organise the guide by these evaluation areas, and where it helps, describe what "expected standard" and "strong standard" would look like in an area. Inspectors gather first-hand evidence mainly through professional conversations and observing the school's day-to-day work, often alongside leaders, so prepare leaders to talk about their work rather than to produce paperwork.`
    : "";

  const prompt = `Write a comprehensive, expert-level Inspection Preparation Guide for senior leaders preparing for an upcoming ${inspectionBody} inspection or accreditation process${focusClause}.${frameworkNote}

This guide is for use in a UK school or education setting. It must reflect accurate, current knowledge of how ${inspectionBody} conducts inspections, including the specific evaluation areas, evidence sources, and language used in its current framework. ${ofsted ? "For Ofsted, that means the renewed education inspection framework and its school inspection toolkit." : "Apply the same precision to this body's own framework."}

Generate the guide using the following structure. Use proper markdown formatting.

# Inspection Preparation Guide: ${inspectionBody}${focus ? `, ${focus}` : ""}

Write a concise 3 to 4 sentence introduction that: (1) states the purpose of this document, (2) identifies the key evaluation areas or criteria used by ${inspectionBody}${focusClause}, and (3) notes the most common areas where schools receive weaker outcomes in this type of inspection.

## Self-Evaluation Questions for Senior Leaders

For each category below, provide 5 genuinely reflective self-evaluation questions. Questions must:
- Be specific to ${inspectionBody} inspection criteria and the language of the framework${focus ? `, with particular attention to ${focus}` : ""}
- Challenge senior leaders to interrogate evidence and assumptions, not simply confirm what they already believe
- Mirror the kinds of questions inspectors themselves ask and the evidence they triangulate
- Be framed to surface gaps as well as strengths
- Progress from broad strategic questions to granular operational ones

${categories}

## Preparation Actions for Senior Leaders

For each of the same categories, provide 5 specific, concrete, and immediately actionable preparation steps. Actions must:
- Be practical enough to assign to a named person and complete before the inspection
- Reference the specific evidence that will be gathered, generated, or reviewed
- Reflect what inspectors actually look for during observations and conversations with staff, pupils, parents and those responsible for governance
- Include documentation, data, or conversations that should be prepared in advance

${categories}${evidenceNote}${successNote}${policyNote}

Write in a professional, authoritative tone appropriate for a senior leadership team. Questions must be genuinely thought-provoking, not surface-level checklist items. Actions must be specific and immediately actionable. Use UK English and accurate inspection terminology throughout. Do not use long dashes: use commas, colons or full stops.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: prompt },
    ],
  };
}
