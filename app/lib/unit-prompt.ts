// The Topic Map and Term Plan prompt: a unit of lessons as structured JSON
// (app/lib/sheets/unit.ts) rather than a markdown table.
//
// Both tools ask for the same fixed shape and every field of every lesson, so
// a column switched on later in Design is already written. What differs is
// where the prompt puts the weight: Topic Map is about how each lesson is
// taught (starter, input, activity, plenary), Term Plan about what pupils
// will know (summary, key knowledge) and how the sequence builds.

import { buildSystem } from "@/app/lib/systemPrompt";
import { bandName, orderedBands, type Differentiate } from "@/app/lib/differentiation";
import { strictObject, unitLessonSchema } from "@/app/lib/sheets/schema";
import { unitLessonCount } from "@/app/lib/sheets/unit";

export type UnitTool = "topicMap" | "termPlan";

export interface UnitPlanRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  /** Topic Map sends `numLessons`, Term Plan `numberOfLessons`; either works. */
  numLessons?: number;
  numberOfLessons?: number;
  /** Term Plan: exam specification or curriculum guidance to follow. */
  examSpec?: string | null;
  /** Topic Map: anything else the teacher wants. */
  additionalInfo?: string | null;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

/** The strict schema a unit is written against. The overview comes first,
 *  so the page has a top while the lessons stream in. */
export function unitResponseFormat(tool: UnitTool) {
  const schema = strictObject({
    title: str,
    overview: str,
    beforeUnit: strList,
    afterUnit: strList,
    lessons: { type: "array", items: unitLessonSchema() },
    assessment: { type: "array", items: strictObject({ when: str, how: str, purpose: str }) },
    vocabulary: strList,
  });
  return { type: "json_schema" as const, json_schema: { name: tool === "topicMap" ? "topic_map" : "term_plan", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK teacher, head of department and curriculum designer with deep knowledge of the National Curriculum, the EYFS framework, GCSE specifications and the evidence on effective teaching (retrieval practice, sequencing, worked examples, checking for understanding). " +
  "You plan units of lessons that build knowledge step by step: each lesson deliberately builds on the one before, prior learning is revisited, and the sequence ends with pupils able to use what they have learned. " +
  "You return the unit as JSON that matches the given schema exactly. Write in UK English with UK spelling throughout. " +
  "Never use LaTeX for maths: write plain symbols such as × ÷ ² and fractions such as 3/4. Do not use long dashes: use commas, colons or full stops.";

/** Where each tool puts its weight. Both fill every field. */
const FOCUS: Record<UnitTool, string> = {
  topicMap:
    "FOCUS: this is a topic map, read lesson by lesson to see how each one is taught. Make starter, input, activity and plenary specific and practical: a colleague should be able to teach from them. Vary the activities across the unit (paired talk, written work, practical tasks, quizzes).",
  termPlan:
    "FOCUS: this is a medium-term plan, read as a whole to see how knowledge builds. Make the summary and key knowledge precise and subject-rich: key knowledge is what pupils will have secured by the end of the lesson, written as declarative statements (\"That rivers erode their banks most on the outside of a bend\").",
};

/**
 * Validate a request and build its messages and response format. Returns
 * `{ error }` for a request the model should never see.
 */
export function unitRequest(tool: UnitTool, body: UnitPlanRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof unitResponseFormat>; lessons: number }
  | { error: string } {
  const curriculum = body.curriculum?.trim();
  const yearGroup = body.yearGroup?.trim();
  const subject = body.subject?.trim();
  const topic = body.topic?.trim();
  const asked = body.numLessons ?? body.numberOfLessons;
  if (!curriculum || !yearGroup || !subject || !topic || !asked) return { error: "Missing required fields" };
  const lessons = unitLessonCount(asked);

  const bands = body.differentiate === "yes" ? orderedBands(body.differentiationLevels ?? []) : [];
  const adaptation = bands.length
    ? `\nADAPTATION: the class includes pupils working at ${bands.map(bandName).join(", ")}. Keep the objectives ambitious for all, and say briefly in each activity how it is made accessible for those working at ${bandName(bands[0])} and stretched for those at ${bandName(bands[bands.length - 1])}.`
    : "";
  const spec = body.examSpec?.trim() ? `\nFollow this exam specification or curriculum guidance: ${body.examSpec.trim()}` : "";
  const extra = body.additionalInfo?.trim() ? `\nAdditional context from the teacher: ${body.additionalInfo.trim()}` : "";

  const user = `Plan a unit of lessons.

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- Subject: ${subject}
- Topic: ${topic}
- Number of lessons: ${lessons}${spec}${extra}${adaptation}

${FOCUS[tool]}

FIELDS
- title: the unit's title, specific to the topic.
- overview: 2 or 3 sentences on what the unit covers and why it matters.
- beforeUnit: 2 to 4 things pupils should already know from earlier years or units that this one builds on.
- afterUnit: 1 to 3 things this unit prepares pupils for next.
- lessons: exactly ${lessons} lessons, in teaching order, each with:
  - title: specific and descriptive, 3 to 7 words ("The causes of flooding", never "Introduction").
  - objective: one measurable sentence starting "To" with an active verb (identify, explain, compare, evaluate). Objectives grow in demand across the unit; do not repeat the same verb in consecutive lessons.
  - starter: 1 or 2 sentences: a short retrieval or hook task linked to prior learning.
  - input: 2 or 3 sentences on what the teacher explains, models or demonstrates. Name the content taught, not just the method.
  - activity: 2 or 3 sentences on the main pupil task.
  - plenary: 1 or 2 sentences: how pupils show what they have learned (not a teacher recap).
  - summary: 3 sentences: the content taught, how it is taught, and what pupils do.
  - keyKnowledge: 3 to 5 statements of what pupils will know by the end of the lesson.
  - resources: 2 to 4 specific resources.
  - questions: 2 or 3 questions to ask, from recall to deeper thinking.
  - vocabulary: 3 to 5 subject terms for this lesson.
- assessment: 3 or 4 assessment points across the unit, each with when (which lesson), how (the kind of task) and purpose (what it shows the teacher). Include at least one check partway through and one at the end.
- vocabulary: every key term for the whole unit, 8 to 15 words.

SEQUENCE: introduce foundational ideas first, build complexity in the middle and finish with lessons where pupils apply, consolidate or evaluate. Revisit earlier lessons in starters. Pitch every part precisely for ${yearGroup}.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: unitResponseFormat(tool),
    lessons,
  };
}
