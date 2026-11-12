// The School Improvement Plan prompt, pure so it can be tested.
//
// Both formats speak the language of Ofsted's renewed framework (report
// cards and evaluation areas, from November 2025: app/lib/ofsted.ts), not the
// old framework's "intent, implementation and impact". Facts the school did
// not give (results, demographics, inspection history) are left as bracketed
// placeholders for the school to fill in, never invented.

import { ofstedFrameworkSummary } from "@/app/lib/ofsted";

export interface SipBody {
  schoolType?: string;
  areasToImprove?: string;
  schoolContext?: string;
  planTimeframe?: number | string;
  outputFormat?: string;
}

const SYSTEM = "You are an expert UK school improvement specialist, former Ofsted inspector, and school leadership consultant with deep knowledge of Ofsted's renewed education inspection framework and its report cards, DfE school improvement guidance, and evidence-based approaches to raising standards. You help headteachers and senior leaders draft rigorous, inspection-ready School Improvement Plans that are specific, measurable, and grounded in the latest research and policy. You write with authority, precision, and professional clarity. ";

export function buildSipPrompt(body: SipBody): { system: string; user: string } | { error: string } {
  const { schoolType, areasToImprove, schoolContext, planTimeframe, outputFormat } = body;
  if (typeof areasToImprove !== "string" || !areasToImprove.trim()) return { error: "Missing required fields" };
  if (schoolContext !== undefined && typeof schoolContext !== "string") return { error: "Missing required fields" };

  const contextSection = schoolContext?.trim()
    ? `\n- School context: ${schoolContext.trim()}`
    : "";

  const timeframe = planTimeframe || 1;
  const isTable = outputFormat !== "narrative";

  const tablePrompt = `Generate a comprehensive School Improvement Plan in the structure below. No preamble, no explanation after the output.

# School Improvement Plan: ${areasToImprove.trim()} Focus (${schoolType || "Primary"})

## Aligned with Ofsted's Renewed Inspection Framework and Current Policy Priorities

---

## Context Narrative

**School Context:**
[Bullet list of 6–8 contextual points relevant to the school type and areas for improvement — include likely baseline data, pupil demographics, relevant inspection history, and capacity for improvement. Use only the school context given. Where a fact is not given (baseline data, results, pupil demographics, inspection history), write a placeholder in square brackets for the school to complete, for example "[school to add: KS2 reading results 2025]", and never invent it.]

**Inspection Framework Alignment:**
[Bullet list of 3 to 4 of Ofsted's evaluation areas (for example inclusion, curriculum and teaching, achievement, attendance and behaviour) with the terminology and expectations directly relevant to the areas for improvement.]

**Research Base:**
[Bullet list of 3–4 specific references to DfE guidance, Ofsted research, EEF evidence, or other published sources relevant to the improvement areas. Include approximate publication years.]

## Improvement Objectives

Write 3 numbered objectives using the structure below. Each objective must be specific and evidence-informed — not generic.

### Objective 1: [Descriptive title]

**Action Steps:**
[A numbered list of 6–10 concrete, specific actions to implement this objective]

**Timeline:** [Key milestones and dates across the plan period]

**Responsible Party:** [Named roles accountable for delivery]

**Resources Needed:** [Staffing, materials, and indicative costs in £]

**Success Metrics:** [Specific, measurable targets — include data and percentages where possible]

**Progress Indicators:** [How and when progress will be reviewed — data sources and review points]

### Objective 2: [Descriptive title]

**Action Steps:**
[Numbered list of 6–10 actions]

**Timeline:** [...]

**Responsible Party:** [...]

**Resources Needed:** [...]

**Success Metrics:** [...]

**Progress Indicators:** [...]

### Objective 3: [Descriptive title]

**Action Steps:**
[Numbered list of 6–10 actions]

**Timeline:** [...]

**Responsible Party:** [...]

**Resources Needed:** [...]

**Success Metrics:** [...]

**Progress Indicators:** [...]

## Implementation Timeline

A 3-column markdown table covering the full ${timeframe}-year plan period by term.

| Term | Key Actions | Milestones |

Use UK academic terms (Autumn 1, Autumn 2, Spring 1, Spring 2, Summer 1, Summer 2). If the plan spans more than one year, continue with Year 2 terms. Each row should have 3–5 key actions and 2–3 measurable milestones.

## Success Criteria (Inspection Framework Language)

A 2-column markdown table.

| Success Criteria | Evidence Sources |

Include 6–8 specific, measurable success criteria using Ofsted inspection framework language. Include 5–6 evidence sources.

## Monitoring Schedule

A 3-column markdown table.

| Frequency | Activity | Responsible |

Include monitoring activities at weekly, half-termly, termly, and ongoing frequencies.

## Budget Allocations

A 3-column markdown table.

| Item | Cost (£) | Justification |

Include 8–12 specific budget items with indicative costs appropriate to the school type and improvement area. End with a **Total** row summing all costs.

## Risk Assessment and Mitigation

A 2-column markdown table.

| Risk | Mitigation Strategy |

Include 5–7 realistic risks. Each mitigation strategy should list 2–3 specific actions separated by " – ".`;

  const narrativePrompt = `Generate a detailed School Improvement Plan in narrative format. No preamble, no explanation after the output.

# School Improvement Plan: ${areasToImprove.trim()} Focus (${schoolType || "Primary"})

## Aligned with Ofsted's Renewed Inspection Framework and Current Policy Priorities

---

## Executive Summary

[2–3 paragraphs summarising the improvement priorities, the rationale, and the expected outcomes over the ${timeframe}-year plan period. Use inspection framework language throughout.]

## School Context and Baseline Analysis

[3–4 paragraphs covering the school context, current performance data, inspection history, and the case for improvement. Use only the school context given. Where a fact is not given (baseline data, results, pupil demographics, inspection history), write a placeholder in square brackets for the school to complete, for example "[school to add: KS2 reading results 2025]", and never invent it.]

## Improvement Priorities and Rationale

[For each area for improvement, write 2 paragraphs: one explaining the priority and the evidence base, one describing the intended approach and its alignment with the relevant Ofsted evaluation areas.]

## Strategic Objectives

### Objective 1: [Title]

**Evaluation areas:** [The one or two Ofsted evaluation areas this objective serves, using the toolkit's names]

**Aim and rationale:** [What the school aims to achieve and why, from the evidence given. 1 paragraph]

**Actions and leads:** [How the objective will be delivered: key actions, leads by role, and timeline. 2 paragraphs]

**Measures of success:** [How success will be measured and what evidence will be gathered. 1 paragraph]

### Objective 2: [Title]

**Evaluation areas:** [...]

**Aim and rationale:** [...]

**Actions and leads:** [...]

**Measures of success:** [...]

### Objective 3: [Title]

**Evaluation areas:** [...]

**Aim and rationale:** [...]

**Actions and leads:** [...]

**Measures of success:** [...]

## Implementation Timeline

[Narrative description of the phased implementation across the ${timeframe}-year period, organised by term. Include key milestones and decision points.]

## Monitoring, Evaluation and Accountability

[2 paragraphs describing the monitoring framework, including frequency, responsible parties, governor oversight, and how evaluation findings will inform ongoing refinement.]

## Resource and Budget Considerations

[1–2 paragraphs outlining the key resource requirements, indicative budget, and how resources will be prioritised and justified against impact.]

## Risk Management

[1 paragraph introducing the risk framework, followed by 4–5 key risks and their mitigations written as flowing sentences.]`;

  const user = `You are an expert UK school improvement specialist. Draft a School Improvement Plan for the inputs below.

INPUTS:
- School type: ${schoolType || "Primary"}
- Areas to improve: ${areasToImprove.trim()}
- Plan timeframe: ${timeframe} year${Number(timeframe) > 1 ? "s" : ""}${contextSection}
- Output format: ${isTable ? "Table format" : "Narrative format"}

${isTable ? tablePrompt : narrativePrompt}`;

  return { system: SYSTEM + " " + ofstedFrameworkSummary(), user };
}
