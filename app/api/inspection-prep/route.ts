import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { buildSystem } from "@/app/lib/systemPrompt";


const isOfsted = (body: string) => /ofsted/i.test(body);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { inspectionBody, inspectionFocus, includeEvidence, includeSuccessCriteria, includePolicyChanges } = body;

  if (!inspectionBody?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const focusClause = inspectionFocus?.trim()
    ? ` with a specific focus on **${inspectionFocus.trim()}**`
    : "";

  const evidenceNote = includeEvidence
    ? `\n\n## Recommended Evidence\nList 6–8 types of evidence that senior leaders should gather before the inspection. For each, use the format: **Evidence Type**: Explanation of why this evidence is useful and what it demonstrates to inspectors.`
    : "";

  const successNote = includeSuccessCriteria
    ? `\n\n## Success Criteria\nList 5–7 clear success criteria that would indicate the school is well-prepared for this inspection${focusClause}. For each, use the format: **Criterion**: Description of what strong preparation looks like.`
    : "";

  const policyNote = includePolicyChanges
    ? `\n\n## Recent Policy Developments\nList 5 recent or emerging policy developments relevant to ${inspectionBody} inspections${inspectionFocus?.trim() ? ` and ${inspectionFocus.trim()}` : ""}. For each, use the format: **Development**: Description of what has changed, when it took effect, and why it matters for inspection preparation.`
    : "";

  const ofstedCategories = `
### Quality of Education
Focus on curriculum intent (what is taught and why), implementation (how it is taught), and impact (what pupils know and can do). Include questions and actions specific to the school's curriculum sequencing, reading and phonics (where applicable), and how well leaders can articulate the rationale for curriculum choices.

### Behaviour and Attitudes
Focus on the culture of the school, pupil conduct in lessons and around school, the school's response to low-level disruption, attendance and punctuality, exclusion rates, and how well leaders understand and address the root causes of poor behaviour.

### Personal Development
Focus on PSHE and citizenship, careers guidance (where applicable), enrichment and extracurricular opportunities, cultural capital, character education, and pupils' readiness for life in modern Britain.

### Leadership and Management
Focus on the ambition and vision of senior leaders, the accuracy of self-evaluation, the use of performance management, governance effectiveness, support for staff wellbeing and workload, and how leaders respond to previous recommendations.

### Safeguarding
Safeguarding is always assessed separately and is a limiting judgement. Focus on the Single Central Record, safer recruitment, DSL capacity, record-keeping, the culture of safeguarding, and whether leaders can demonstrate that they keep pupils safe.

### SEND and Inclusion
Focus on the identification of pupils with SEND, the quality of EHCPs and SEN support plans, the implementation of high-quality adaptive teaching, pupil outcomes for those with SEND, and how well staff understand and meet individual needs.

### Early Years (where applicable)
Focus on curriculum intent for the seven areas of learning, the quality of adult interactions, assessment and Learning Journeys, the learning environment (indoors and outdoors), and transitions into Year 1.`;

  const genericCategories = `
### Leadership and Management
### Quality of Teaching and Learning
### Pupil Welfare and Safeguarding
### Academic Outcomes and Progress
### Personal Development and Wellbeing
### Community and Parental Engagement
### Staff Development and Organisational Culture`;

  const categories = isOfsted(inspectionBody) ? ofstedCategories : genericCategories;

  const ofstedFrameworkNote = isOfsted(inspectionBody)
    ? `\n\nIMPORTANT — Ofsted framework context: This guide must align precisely with Ofsted's **Education Inspection Framework (EIF)**, including the updated inspection methodology introduced following the Ofsted Big Listen consultation (2024). Key changes to reflect: (1) Inspectors now use a **report card model** with descriptive judgements across multiple sub-areas rather than a single overall effectiveness grade; (2) The **curriculum intent → implementation → impact** model remains central to Quality of Education judgements; (3) Inspectors place increased weight on **workload, wellbeing, and professional development** for staff; (4) There is renewed emphasis on **reading and literacy across the curriculum**; (5) Safeguarding remains a separate limiting judgement. Use the precise language from the EIF handbook throughout — terms such as "curriculum intent", "adaptive teaching", "cultural capital", "personal development", and "statutory requirements" should appear where relevant.`
    : "";

  const prompt = `Write a comprehensive, expert-level Inspection Preparation Guide for senior leaders preparing for an upcoming ${inspectionBody} inspection or accreditation process${focusClause}.${ofstedFrameworkNote}

This guide is for use in a UK school or education setting. It must reflect accurate, current knowledge of how ${inspectionBody} conducts inspections — including the specific judgement areas, evidence sources, and language used in current inspection frameworks. For Ofsted inspections, this means aligning precisely with the Education Inspection Framework (EIF) and its associated handbooks. For other bodies, apply equivalent precision.

Generate the guide using the following structure. Use proper markdown formatting.

# Inspection Preparation Guide: ${inspectionBody}${inspectionFocus?.trim() ? ` — ${inspectionFocus}` : ""}

Write a concise 3–4 sentence introduction that: (1) states the purpose of this document, (2) identifies the key judgement areas or evaluation criteria used by ${inspectionBody}${focusClause}, and (3) notes the most common areas where schools receive weaker judgements in this type of inspection.

## Self-Evaluation Questions for Senior Leaders

For each category below, provide 5 genuinely reflective self-evaluation questions. Questions must:
- Be specific to ${inspectionBody} inspection criteria and the language of the framework${focusClause ? ` — with particular attention to ${inspectionFocus}` : ""}
- Challenge senior leaders to interrogate evidence and assumptions — not simply confirm what they already believe
- Mirror the kinds of questions inspectors themselves ask and the evidence they triangulate
- Be framed to surface gaps as well as strengths
- Progress from broad strategic questions to granular operational ones
${categories}

## Preparation Actions for Senior Leaders

For each of the same categories, provide 5 specific, concrete, and immediately actionable preparation steps. Actions must:
- Be practical enough to assign to a named person and complete before the inspection
- Reference the specific evidence that will be gathered, generated, or reviewed
- Reflect what inspectors actually look for during deep dives, observations, and conversations with staff, pupils, and governors
- Include documentation, data, or conversations that should be prepared in advance
${categories}
${evidenceNote}${successNote}${policyNote}

Write in a professional, authoritative tone appropriate for a senior leadership team. Questions must be genuinely thought-provoking — not surface-level checklist items. Actions must be specific and immediately actionable. Use UK English and accurate inspection terminology throughout.`;

  return streamChat({
    toolSlug: "inspection-prep",
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK school leader, former Ofsted inspector, and inspection readiness consultant with precise, up-to-date knowledge of Ofsted's Education Inspection Framework (EIF) — including the changes introduced following the Ofsted Big Listen consultation (2024) and the move to a report card model. You also have extensive knowledge of ISI, SIAMS, CIS, BSO, KHDA, and other UK and international educational inspection and accreditation processes. You know what inspectors look for, how they triangulate evidence, what language appears in judgement descriptors, and where schools most commonly have weaknesses. You write authoritative, specific, and immediately practical guidance for senior leadership teams preparing for inspections. You write in professional UK English and use accurate, framework-aligned inspection terminology.") },
      { role: "user", content: prompt },
    ],
  });
}
