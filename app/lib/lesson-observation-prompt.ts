// The Lesson Observation Report prompt, pure so it can be tested.
//
// Developmental, not graded: Ofsted does not grade individual lessons. The
// report never names the teacher or anyone else; colleagues who could help
// are suggested by role (mentor, subject lead), never invented by name.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the request body as posted by the form
type Body = Record<string, any>;

const SYSTEM = "You are an experienced school leader and instructional coach with deep expertise in lesson observation and teacher development. You write formal, evidence-based observation reports that are specific, fair, and grounded in the Teachers' Standards and Ofsted's current school inspection toolkit (Ofsted does not grade individual lessons). Your reports support teacher growth through clear, actionable feedback.";

export function buildLessonObservationPrompt(body: Body): { system: string; user: string } | { error: string } {
  const {
    curriculum,
    yearGroup,
    subject,
    learningObjective,
    observationFocus,
    strengths,
    areasForDevelopment,
    date,
    includeActionPlan,
    includeFollowUpSupport,
  } = body;
  if (!curriculum || typeof strengths !== "string" || !strengths.trim() || typeof areasForDevelopment !== "string" || !areasForDevelopment.trim()) {
    return { error: "Missing required fields" };
  }

  const dateStr = date
    ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  const actionPlanSection = includeActionPlan
    ? `\n\n## Action Plan

For each main area for development, write a structured action plan entry using the following format exactly. Use ### for each target heading.

### Target 1: [specific, measurable target drawn directly from the areas for development]

**Success Criteria:** [what it will look like when this target is met — specific and observable]

**Strategies:**
- [specific strategy 1]
- [specific strategy 2]
- [specific strategy 3]

**Timeline:** [realistic timeline with a clear review point]

### Target 2: [next target]

**Success Criteria:** [...]

**Strategies:**
- [...]
- [...]
- [...]

**Timeline:** [...]

Write 2–3 targets, each addressing a distinct area for development.`
    : "";

  const followUpSection = includeFollowUpSupport
    ? `\n\n## Follow-up Support

List 4–5 specific, practical follow-up support options for the teacher. Each should be a concrete action — name specific, real organisations, resources or approaches where possible, and suggest colleagues by role only (for example mentor, subject lead, SENCO), never by name. Avoid vague suggestions.`
    : "";

  const user = `You are an experienced school leader writing a formal lesson observation report. Write directly and professionally. Do not refuse or add caveats.

OBSERVATION DETAILS:
- Curriculum: ${curriculum}
- Year Group: ${yearGroup || "Not specified"}
- Subject: ${subject?.trim() || "Not specified"}
- Learning Objective: ${learningObjective?.trim() || "Not specified"}
- Observation Focus: ${observationFocus?.trim() || "Not specified"}
- Date: ${dateStr || "Not specified"}
- Observed Strengths: ${strengths}
- Areas for Development: ${areasForDevelopment}

Generate a professional Lesson Observation Report using the following structure. Use proper markdown formatting.

# Lesson Observation Report

## Observation Details
**Date:** ${dateStr || "Not specified"}
**Subject:** ${subject?.trim() || "Not specified"}
**Year Group:** ${yearGroup || "Not specified"}
**Learning Objective:** ${learningObjective?.trim() || "Not specified"}${observationFocus?.trim() ? `\n**Observation Focus:** ${observationFocus.trim()}` : ""}

## Lesson Context
Write 3–4 sentences contextualising the lesson. Reference the curriculum area, the relevance of the learning objective to the year group, and what the lesson aimed to achieve in terms of both substantive and disciplinary knowledge. Be specific — this should read as an accurate account of the lesson observed, not a generic description.

## Strengths
Identify 3–5 specific strengths from the observation. For each, use the format: **Strength Title**: 2–3 sentences of specific evidence drawn directly from the observations provided, explaining what was seen and why it represents strong practice. Reference relevant teaching principles or frameworks (e.g. Rosenshine's Principles, the curriculum and teaching area of Ofsted's inspection toolkit, Teachers' Standards) where appropriate.

## Areas for Development
Identify 2–4 areas for development. For each, use the format: **Area Title**: 2–3 sentences describing the gap observed with specific evidence, explaining its impact on pupil learning, and indicating what improved practice would look like.

## Recommendations
Provide 4–5 specific, evidence-informed recommendations that directly address the areas for development. For each, use the format: **Recommendation Title**: 2–3 sentences describing the specific change needed, how to implement it, and the expected impact on pupil outcomes. Be concrete — name specific strategies, approaches, or tools.${actionPlanSection}${followUpSection}

Never name the teacher or any other person: write "the teacher" and refer to others by role. Write in a formal, professional tone appropriate for a school leadership observation document. Be specific and evidence-based — draw directly from the observation notes provided. Use UK English throughout.`;

  return { system: SYSTEM, user };
}
