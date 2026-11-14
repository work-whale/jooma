// The Lesson Observation Report prompt: the report as structured JSON
// (app/lib/sheets/observation.ts), pure so it can be tested.
//
// Developmental, never graded: Ofsted does not grade individual lessons. The
// teacher and observer may be named in the form, but the names stay in the
// browser: the text arrives with "[TEACHER]" and "[OBSERVER]" in their place,
// and a request carrying a name key is refused. Colleagues who could help are
// suggested by role (mentor, subject lead), never invented by name.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { carriesStaffName, OBSERVER_PLACEHOLDER, TEACHER_PLACEHOLDER } from "@/app/lib/staff-privacy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the request body as posted by the form
type Body = Record<string, any>;

const str = { type: "string" } as const;

export function lessonObservationResponseFormat() {
  const schema = strictObject({
    context: str,
    strengths: { type: "array", items: strictObject({ title: str, evidence: str }) },
    areas: { type: "array", items: strictObject({ title: str, evidence: str, impact: str }) },
    recommendations: { type: "array", items: strictObject({ title: str, how: str }) },
    actionPlan: { type: "array", items: strictObject({ target: str, actions: str, support: str, byWhen: str }) },
    followUp: { type: "array", items: str },
  });
  return { type: "json_schema" as const, json_schema: { name: "lesson_observation", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced school leader and instructional coach with deep expertise in lesson observation and teacher development. You write formal, evidence-based, developmental observation reports that are specific, fair, and grounded in the Teachers' Standards and Ofsted's current school inspection toolkit (Ofsted does not grade individual lessons). " +
  "You return the report as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function lessonObservationRequest(body: Body):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof lessonObservationResponseFormat> }
  | { error: string } {
  if (carriesStaffName(body)) return { error: "Names are never sent. Please reload the page and try again." };
  const curriculum = text(body.curriculum);
  const strengths = text(body.strengths);
  const areas = text(body.areasForDevelopment);
  if (!curriculum || !strengths || !areas) return { error: "Missing required fields" };
  const T = TEACHER_PLACEHOLDER;
  const O = OBSERVER_PLACEHOLDER;
  const lines = [
    `- Curriculum: ${curriculum}`,
    text(body.yearGroup) ? `- Year group: ${text(body.yearGroup)}` : "",
    text(body.subject) ? `- Subject: ${text(body.subject)}` : "",
    text(body.learningObjective) ? `- Learning objective: ${text(body.learningObjective)}` : "",
    text(body.observationFocus) ? `- Observation focus: ${text(body.observationFocus)}` : "",
    `- Strengths observed: ${strengths}`,
    `- Areas for development: ${areas}`,
  ].filter(Boolean);

  const user = `Write a developmental lesson observation report from the observer's notes below.

${lines.join("\n")}

The teacher observed is written as ${T} and the observer as ${O}: keep those placeholders exactly where a name would go. Never name any person: refer to anyone else by role (mentor, subject lead, SENCO). Never give the lesson or the teacher a grade, a rating or an overall judgement: lessons are not graded.

Use only the notes above. Do not invent pupils, data, quotes or events that were not described.

FIELDS
- context: 2 or 3 sentences setting the lesson in context: the curriculum area, why the objective matters for this year group, and what the lesson set out to achieve.
- strengths: 3 to 5. title: a short name for the strength. evidence: 2 sentences on what was seen and why it is strong practice, citing a teaching principle (for example Rosenshine's Principles or the Teachers' Standards) where it fits.
- areas: 2 to 4. title: a short name. evidence: what was seen, 1 or 2 sentences. impact: the effect on pupils' learning, 1 sentence.
- recommendations: 3 to 5, each addressing an area for development. title: the change. how: 1 or 2 sentences on how to do it.
- actionPlan: ${body.includeActionPlan ? "2 or 3 targets agreed from the areas for development. target: specific and measurable. actions: what the teacher will do. support: by role only. byWhen: a realistic point, such as \"by half term\"." : "an empty list."}
- followUp: ${body.includeFollowUpSupport ? "3 or 4 practical follow-up support options, each one sentence, naming real organisations or resources only where you are sure they exist, and colleagues by role only." : "an empty list."}`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: lessonObservationResponseFormat(),
  };
}
