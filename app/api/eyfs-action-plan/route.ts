import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";


export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body = await req.json();
  const { curriculum, objective } = body;

  if (!curriculum || !objective?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const prompt = `Write a detailed, professional EYFS Action Plan for use in an English Early Years setting.

Curriculum: ${curriculum}
EYFS Objective: ${objective}

This action plan is a formal school improvement document that may be reviewed by the EYFS Lead, headteacher, governors, or Ofsted inspectors. It must be specific, practical, and demonstrate the kind of systematic leadership that supports improvement in the EYFS. All references to curriculum, assessment, and practice should align with the EYFS Statutory Framework (2021) and the DfE's non-statutory guidance. Where relevant, reference the Early Learning Goals and the characteristics of effective teaching and learning.

Generate a comprehensive EYFS Action Plan using the following structure. Use proper markdown formatting.

# EYFS Action Plan

## Objective
State the objective clearly, precisely, and in measurable terms. Avoid vague language — the objective should describe a specific, observable improvement in provision, practice, or outcomes.

## Success Criteria
List 3–4 numbered, measurable success criteria that will indicate the objective has been fully achieved. Each criterion must be specific enough to be evidenced through observation, data, or documentation — not a general aspiration. For example: "At least 80% of children in Reception demonstrate [specific skill] independently by [date], as evidenced by practitioner observation records."

## Implementation Plan

### Phase 1: Foundations and Initial Actions (Weeks 1–4)

**Specific Actions:**
List 4–5 concrete, named actions. For each action, specify: what exactly will be done, who will do it, and what the intended output is. Avoid vague instructions such as "review provision" — instead write "The EYFS Lead will conduct a learning environment audit using [specific tool/criteria] and produce a written report by Week 2."

**Responsibilities:**
Name specific roles (e.g. EYFS Lead, key workers, all room staff, SENCo, headteacher) and their individual responsibilities in this phase.

**Timeline:**
Weeks 1–4

**Expected Outcomes:**
Describe specifically what should be visible, in place, or measurably different by the end of this phase. Reference what practitioners will do differently, what the environment will look like, or what early data might show.

**Monitoring Approach:**
Describe how progress will be monitored: who will check, what evidence will be gathered, and what the trigger is for escalating if the phase is off-track.

### Phase 2: Development and Implementation (Weeks 5–8)

**Specific Actions:**
List 4–5 actions that build directly on Phase 1. Focus on embedding new practice, trialling approaches, and beginning to gather evidence of impact.

**Responsibilities:**
Specific roles and individual responsibilities.

**Timeline:**
Weeks 5–8

**Expected Outcomes:**
Describe what should be visible or measurably in place by the end of Phase 2 — including early evidence of impact on children's learning or development.

**Monitoring Approach:**
How will progress be tracked? Include reference to any observation cycles, peer observation, or data review.

### Phase 3: Embedding and Consolidating (Weeks 9–12)

**Specific Actions:**
List 4–5 actions focused on consolidating the change, addressing any barriers encountered, and ensuring the improvement is sustainable.

**Responsibilities:**
Specific roles.

**Timeline:**
Weeks 9–12

**Expected Outcomes:**
What does embedded, sustainable improvement look like by the end of this phase? How will it be visible in daily practice?

**Monitoring Approach:**
How will the team confirm that practice has genuinely changed and that impact is evident in children's outcomes?

### Phase 4: Evaluation and Next Steps (Week 13+)

**Specific Actions:**
List 4–5 actions focused on evaluating overall impact, celebrating success, and planning next steps or follow-on priorities.

**Responsibilities:**
Specific roles.

**Timeline:**
Week 13 onwards

**Expected Outcomes:**
What does a successful evaluation look like? What data, evidence, or observations would confirm that the objective has been achieved?

**Monitoring Approach:**
How will findings be reported, shared with governors, and used to inform future EYFS improvement planning?

## Resources and Staffing Requirements

**Physical Resources:**
Specific materials, learning environment adjustments, or equipment required.

**Digital Resources:**
Any digital platforms, observation tools, or online resources needed.

**Documentation and Assessment Resources:**
Observation and tracking frameworks, evidence-gathering tools, or formative assessment approaches required.

**Staffing Requirements:**
Any changes to deployment, cover arrangements, or protected time needed for staff to implement the plan.

**Training and CPD Requirements:**
Specific training, professional reading, or CPD activities needed to upskill the team. Name the type of training and who it is for.

**External Support:**
Any external agencies, advisory teachers, or specialist support (e.g. local authority EYFS adviser, speech and language therapist) that may be required.

**Budget Considerations:**
A brief, practical summary of likely costs and how they might be funded (e.g. Pupil Premium, SEND budget, school improvement fund).

Write in a professional, action-oriented tone appropriate for a formal school improvement document. Every action must be specific, named, and practical — avoid vague generalities. Write in UK English.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK EYFS Lead and school improvement specialist with comprehensive knowledge of the EYFS Statutory Framework (2021), the Early Learning Goals, Ofsted's inspection of early years provision, and best practice in early childhood education. You write formal, specific, and practically grounded EYFS action plans that would withstand scrutiny from governors, headteachers, and Ofsted inspectors. Your plans are never vague — every action is named, assigned, and measurable. You write in professional UK English.") },
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
