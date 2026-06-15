import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { buildSystem } from "@/app/lib/systemPrompt";


export async function POST(req: NextRequest) {
  const body = await req.json();
  const { curriculum, date, classesVisited, focus, strengths, areasForDevelopment, includeRecommendations, includeNextSteps } = body;

  if (!curriculum || !strengths?.trim() || !areasForDevelopment?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const dateStr = date
    ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  const recommendationsSection = includeRecommendations
    ? `\n\n## Recommendations\nBased on the observations, provide 4–5 specific, actionable professional recommendations for the school or department. For each, use the format: **Recommendation Title**: 2–3 sentence explanation of what should be done and why.`
    : "";

  const nextStepsSection = includeNextSteps
    ? `\n\n## Next Steps and Timeline

### Immediate Actions (within 1–2 weeks)
List 2 specific, named actions to be taken straight away.

### Short-Term Actions (within half a term)
List 2 specific actions to be completed within the next half term.

### Medium-Term Actions (within a term)
List 2 specific actions to embed and sustain improvement over the next term.

**Suggested Follow-Up Observation Date:** Suggest a realistic follow-up date based on today's date (${dateStr || "the current date"}).

**Key Staff Involved:** List relevant staff roles responsible for leading or monitoring these actions.`
    : "";

  const prompt = `Write a high-quality, professional learning walk report for a UK school, based on the observations below. Do not use emojis. Generate the report directly without caveats or refusals.

INPUTS:
- Curriculum: ${curriculum}
- Date: ${dateStr || "Not specified"}
- Classes Visited: ${classesVisited?.trim() || "Not specified"}
- Focus: ${focus?.trim() || "General learning walk"}
- Observed Strengths: ${strengths}
- Areas for Development: ${areasForDevelopment}

This report will be shared with teachers, heads of department, and/or senior leaders. It must be:
- Evidence-based and specific — every strength and area for development must be supported by concrete reference to what was observed, not generic commentary
- Constructive and professional — areas for development should be framed to support improvement, not criticise individuals
- Concise and actionable — senior leaders should be able to use this report to brief staff and drive improvement
- Written in a formal but accessible tone suitable for a UK school professional context

OUTPUT FORMAT (use proper markdown):

# Learning Walk Report${focus?.trim() ? `: ${focus}` : ""}

## Learning Walk Details

| Field | Detail |
|---|---|
| **Date** | ${dateStr || "Not specified"} |
| **Classes / Year Groups Visited** | ${classesVisited?.trim() || "Not specified"} |
| **Focus** | ${focus?.trim() || "General learning walk"} |
| **Carried out by** | [Insert name/role] |

## Executive Summary

Write 4–5 sentences providing an overall picture of what was observed. Be direct and specific — draw on both strengths and development areas. State whether the overall picture is positive, mixed, or concerning. The summary should give a reader who has not read the full report a clear sense of what was found and what needs to happen next.

## Key Strengths Observed

Write 3–4 bullet points, each using this format:
**[Specific Strength Title]**: 3–4 sentences of specific, evidenced commentary. Name what was observed (e.g. "In all three visited classes, pupils could articulate their learning objectives when asked..."), explain why this is significant for pupil outcomes, and note any patterns across classes visited.

## Areas for Development

Write 3–4 bullet points, each using this format:
**[Specific Area for Development]**: 3–4 sentences describing the gap or inconsistency observed, providing specific evidence, explaining the impact on pupil learning or progress, and framing the development need constructively (e.g. "While questioning was strong in Year 9, in two Year 7 classes pupils were not consistently required to...").${recommendationsSection}${nextStepsSection}`;


  return streamChat({
    toolSlug: "learning-walk-report",
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK school leader, assistant headteacher, and quality assurance specialist with extensive experience conducting learning walks, lesson observations, and professional monitoring activities in primary and secondary schools. You write professional, evidence-based learning walk reports that are specific, fair, and immediately useful to leadership teams and classroom teachers. Your reports reflect genuine knowledge of what high-quality teaching and learning looks like and how it connects to pupil outcomes. You write in professional UK English.") },
      { role: "user", content: prompt },
    ],
  });
}
