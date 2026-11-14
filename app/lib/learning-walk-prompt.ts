// The Learning Walk Report prompt: the report as structured JSON
// (app/lib/sheets/observation.ts), pure so it can be tested.
//
// A learning walk visits several classes briefly to look at one aspect of
// teaching across a school or department. The report is developmental and
// names nobody: staff named by title in the notes ("Mr Patel's Year 7") are
// scrubbed to "a teacher" in the browser, and again here in case a request
// arrives without that. First names alone are not caught; the form says so.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { carriesStaffName, scrubStaffTitles } from "@/app/lib/staff-privacy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the request body as posted by the form
type Body = Record<string, any>;

const str = { type: "string" } as const;

export function learningWalkResponseFormat() {
  const schema = strictObject({
    summary: str,
    overall: { type: "string", enum: ["positive", "mixed", "concerning"] },
    strengths: { type: "array", items: strictObject({ title: str, evidence: str }) },
    areas: { type: "array", items: strictObject({ title: str, evidence: str, impact: str }) },
    recommendations: { type: "array", items: strictObject({ title: str, how: str }) },
    nextSteps: { type: "array", items: strictObject({ action: str, when: { type: "string", enum: ["immediate", "halfTerm", "term"] }, leadRole: str }) },
  });
  return { type: "json_schema" as const, json_schema: { name: "learning_walk", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced UK school leader and quality assurance specialist who conducts learning walks in primary and secondary schools. You write professional, evidence-based learning walk reports that are specific, fair, developmental and immediately useful to leaders and teachers. " +
  "You return the report as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

/** A free-text field, trimmed, with staff named by title as "a teacher". */
const text = (v: unknown) => (typeof v === "string" ? scrubStaffTitles(v.trim()) : "");

export function learningWalkRequest(body: Body):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof learningWalkResponseFormat> }
  | { error: string } {
  if (carriesStaffName(body)) return { error: "Names are never sent. Please reload the page and try again." };
  const curriculum = text(body.curriculum);
  const strengths = text(body.strengths);
  const areas = text(body.areasForDevelopment);
  if (!curriculum || !strengths || !areas) return { error: "Missing required fields" };
  const classes = text(body.classesVisited);
  const focus = text(body.focus);

  const user = `Write a learning walk report from the notes below.

- Curriculum: ${curriculum}
- Classes visited: ${classes || "not given"}
- Focus: ${focus || "a general learning walk"}
- Strengths seen: ${strengths}
- Areas for development: ${areas}

Never name a teacher or anyone else: write about classes, year groups and "a teacher", and refer to leaders by role. Never grade a lesson or a teacher. Frame areas for development constructively, as patterns across the classes visited rather than criticism of individuals.

Use only the notes above. Do not invent classes, pupils, data or events that were not described.

FIELDS
- summary: 3 or 4 sentences giving the overall picture, drawing on both the strengths and the areas for development.
- overall: positive, mixed or concerning, from the notes.
- strengths: 3 or 4. title: a short name. evidence: 2 sentences on what was seen across the classes and why it matters for pupils.
- areas: 2 to 4. title: a short name. evidence: what was seen, 1 or 2 sentences. impact: the effect on pupils' learning, 1 sentence.
- recommendations: ${body.includeRecommendations === false ? "an empty list." : "3 or 4 specific, practical recommendations for the school or department. title: the change. how: 1 or 2 sentences on how."}
- nextSteps: ${body.includeNextSteps === false ? "an empty list." : "4 to 6 actions. action: one specific action, one sentence. when: immediate (within two weeks), halfTerm (by the end of this half term) or term (by the end of the term); use each at least once. leadRole: the role who leads it, never a name."}`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: learningWalkResponseFormat(),
  };
}
