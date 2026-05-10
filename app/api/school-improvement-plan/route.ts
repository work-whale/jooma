import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystem } from "@/app/lib/systemPrompt";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { schoolType, areasToImprove, schoolContext, planTimeframe, outputFormat } = body;

  if (!areasToImprove?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const contextSection = schoolContext?.trim()
    ? `\n- School context: ${schoolContext.trim()}`
    : "";

  const timeframe = planTimeframe || 1;
  const isTable = outputFormat !== "narrative";

  const tablePrompt = `Generate a comprehensive School Improvement Plan in the structure below. No preamble, no explanation after the output.

# School Improvement Plan: ${areasToImprove.trim()} Focus (${schoolType || "Primary"})

## Aligned with the Education Inspection Framework (EIF) and Current Policy Priorities

---

## Context Narrative

**School Context:**
[Bullet list of 6–8 contextual points relevant to the school type and areas for improvement — include likely baseline data, pupil demographics, relevant inspection history, and capacity for improvement. If school context was provided, use it; otherwise infer appropriate context for a ${schoolType || "primary"} school.]

**Inspection Framework Alignment:**
[Bullet list of 3–4 specific EIF judgement areas, terminology, and requirements directly relevant to the areas for improvement.]

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

## Aligned with the Education Inspection Framework (EIF) and Current Policy Priorities

---

## Executive Summary

[2–3 paragraphs summarising the improvement priorities, the rationale, and the expected outcomes over the ${timeframe}-year plan period. Use inspection framework language throughout.]

## School Context and Baseline Analysis

[3–4 paragraphs covering the school context, current performance data, inspection history, and the case for improvement. If school context was provided, use it; otherwise construct appropriate context for a ${schoolType || "primary"} school.]

## Improvement Priorities and Rationale

[For each area for improvement, write 2 paragraphs: one explaining the priority and the evidence base, one describing the intended approach and its alignment with EIF requirements.]

## Strategic Objectives

### Objective 1: [Title]

**Intent:** [What the school aims to achieve and why — 1 paragraph]

**Implementation:** [How the objective will be delivered — key actions, responsibilities, and timeline — 2 paragraphs]

**Impact:** [How success will be measured and what evidence will be gathered — 1 paragraph]

### Objective 2: [Title]

**Intent:** [...]

**Implementation:** [...]

**Impact:** [...]

### Objective 3: [Title]

**Intent:** [...]

**Implementation:** [...]

**Impact:** [...]

## Implementation Timeline

[Narrative description of the phased implementation across the ${timeframe}-year period, organised by term. Include key milestones and decision points.]

## Monitoring, Evaluation and Accountability

[2 paragraphs describing the monitoring framework, including frequency, responsible parties, governor oversight, and how evaluation findings will inform ongoing refinement.]

## Resource and Budget Considerations

[1–2 paragraphs outlining the key resource requirements, indicative budget, and how resources will be prioritised and justified against impact.]

## Risk Management

[1 paragraph introducing the risk framework, followed by 4–5 key risks and their mitigations written as flowing sentences.]`;

  const prompt = `You are an expert UK school improvement specialist. Draft a School Improvement Plan for the inputs below.

INPUTS:
- School type: ${schoolType || "Primary"}
- Areas to improve: ${areasToImprove.trim()}
- Plan timeframe: ${timeframe} year${Number(timeframe) > 1 ? "s" : ""}${contextSection}
- Output format: ${isTable ? "Table format" : "Narrative format"}

${isTable ? tablePrompt : narrativePrompt}`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8000,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK school improvement specialist, former Ofsted inspector, and school leadership consultant with deep knowledge of the Education Inspection Framework (EIF), DfE school improvement guidance, and evidence-based approaches to raising standards. You help headteachers and senior leaders draft rigorous, inspection-ready School Improvement Plans that are specific, measurable, and grounded in the latest research and policy. You write with authority, precision, and professional clarity.") },
      { role: "user", content: prompt },
    ],
    stream: true,
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
    cancel() {
      openaiStream.controller.abort();
    },
  });

  return new NextResponse(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
