// The Lesson Plan prompt: a structured plan (app/lib/sheets/lesson.ts) rather
// than markdown.
//
// The model fills one fixed shape, the same for both layouts: objective,
// success criteria, keywords, prior knowledge, key learning points,
// misconceptions, the phases with timings, a starter and an exit quiz,
// assessment and resources. Code arranges it into the chosen layout and makes
// the timings add up, so the prompt asks for good content, not for formatting.

import { buildSystem } from "@/app/lib/systemPrompt";
import { bandName, orderedBands, type Differentiate } from "@/app/lib/differentiation";
import { strictObject } from "@/app/lib/sheets/schema";
import { DEFAULT_LESSON_LAYOUT, isLessonLayout, lessonMinutes } from "@/app/lib/sheets/lesson";
import type { LessonLayout } from "@/app/lib/sheets/types";

export interface LessonPlanRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  learningObjective: string;
  /** "three-part" or "cycles". Missing or unknown is three-part. */
  layout?: string;
  /** Minutes, 20 to 180. Missing is 60. */
  lessonLength?: number;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
  outputDetail?: "condensed" | "standard" | "detailed";
  additionalInfo?: string | null;
}

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const strList = { type: "array", items: str } as const;
const list = (item: Record<string, unknown>) => ({ type: "array", items: strictObject(item) });
const quiz = list({ prompt: str, options: strList, answer: int });

/** The strict schema the plan is written against. Phases come before the
 *  quizzes so a phase lands ahead of its quiz while the plan streams in. */
export function lessonResponseFormat() {
  const schema = strictObject({
    title: str,
    objective: str,
    successCriteria: strList,
    keywords: list({ term: str, definition: str }),
    priorKnowledge: strList,
    keyLearningPoints: strList,
    misconceptions: list({ misconception: str, response: str }),
    phases: list({
      stage: { type: "string", enum: ["starter", "main", "plenary"] },
      title: str,
      minutes: int,
      teacher: str,
      pupils: str,
      check: strList,
      feedback: str,
      support: str,
      challenge: str,
      ta: str,
    }),
    starterQuiz: quiz,
    exitQuiz: quiz,
    assessment: strList,
    resources: strList,
    teacherNotes: list({ title: str, points: strList }),
  });
  return { type: "json_schema" as const, json_schema: { name: "lesson_plan", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK teacher and curriculum designer with deep knowledge of the National Curriculum, the EYFS framework, the Teachers' Standards, Ofsted's renewed education inspection framework and the evidence on effective teaching (Rosenshine's principles, retrieval practice, worked examples, checking for understanding, adaptive teaching). " +
  "You write lesson plans a colleague could pick up and teach without further preparation: precisely pitched for the year group, subject-accurate, built around one clear objective, with realistic timings. " +
  "You return the plan as JSON that matches the given schema exactly. Write in UK English with UK spelling throughout (vapour, colour, organise, centre). " +
  "Never use LaTeX for maths: write plain symbols such as × ÷ ² and fractions such as 3/4. Do not use long dashes: use commas, colons or full stops.";

/** How each layout should be planned. Both fill the same fields. */
const LAYOUT_RULES: Record<LessonLayout, string> = {
  "three-part":
    "LAYOUT: a UK three-part lesson. Write exactly one starter phase (a short, active retrieval or hook task, usually 5 to 10 minutes), then 2 to 4 main phases in teaching order (for example teacher input with modelling, guided practice, independent practice), then exactly one plenary phase (pupils show what they have learned, not a teacher recap).",
  cycles:
    "LAYOUT: learning cycles. Write exactly one starter phase, which is the starter quiz on prior knowledge (about 5 minutes), then 2 or 3 main phases, each one a learning cycle, then exactly one plenary phase, which is the exit quiz (about 5 minutes). In each learning cycle: teacher is the explanation (what is modelled or explained, with any worked example), check holds the questions that check understanding before pupils move on, pupils is the practice task, and feedback is how the teacher gives feedback on that practice. Each cycle should build on the one before.",
};

const DETAIL: Record<NonNullable<LessonPlanRequest["outputDetail"]>, string> = {
  condensed: "Keep every field brief: one or two sentences, and 2 or 3 items in each list.",
  standard: "Give enough detail for a colleague to follow: two to four sentences in each phase field, 3 to 5 items in each list.",
  detailed: "Be detailed and specific: say exactly what the teacher says, shows and asks, and exactly what pupils produce. 3 to 6 items in each list.",
};

/**
 * Validate a request and build its messages and response format. Returns
 * `{ error }` for a request the model should never see.
 */
export function lessonRequest(body: LessonPlanRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof lessonResponseFormat>; layout: LessonLayout; minutes: number }
  | { error: string } {
  const { curriculum, yearGroup } = body;
  const subject = body.subject?.trim();
  const topic = body.topic?.trim();
  const objective = body.learningObjective?.trim();
  if (!curriculum || !yearGroup || !subject || !topic || !objective) return { error: "Missing required fields" };

  const layout = isLessonLayout(body.layout) ? body.layout : DEFAULT_LESSON_LAYOUT;
  const minutes = lessonMinutes(body.lessonLength);
  const detail = DETAIL[body.outputDetail ?? "detailed"] ?? DETAIL.detailed;

  const bands = body.differentiate === "yes" ? orderedBands(body.differentiationLevels ?? []) : [];
  const adaptation = bands.length
    ? `ADAPTATION: the class includes pupils working at ${bands.map(bandName).join(", ")}. In every phase, support should be pitched at the lowest of these and challenge at the highest, naming the band (for example "WTS: ..."), and ta says how a teaching assistant supports the pupils who need it most.`
    : "ADAPTATION: in every phase give a short support (scaffolds, sentence stems, worked examples for pupils who need them) and a short challenge (a harder question or task for pupils ready to go further). Fill ta with what a teaching assistant could do, or leave it empty if there is no clear role.";

  const extra = body.additionalInfo?.trim() ? `\nAdditional context from the teacher: ${body.additionalInfo.trim()}` : "";

  const user = `Plan one lesson.

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- Subject: ${subject}
- Topic: ${topic}
- Learning objective: ${objective}
- Lesson length: ${minutes} minutes${extra}

${LAYOUT_RULES[layout]}

TIMINGS: give each phase its minutes. The phases must add up to exactly ${minutes} minutes.

FIELDS
- title: a short, specific lesson title.
- objective: the learning objective, refined into one measurable sentence starting "To" or "I can".
- successCriteria: 3 or 4 observable steps towards the objective, each starting with a verb pupils can show (identify, explain, calculate...).
- keywords: 4 to 6 subject terms pupils must use, each with a precise, age-appropriate definition.
- priorKnowledge: what pupils need to already know or be able to do, as short statements.
- keyLearningPoints: the 3 to 5 most important things pupils should know by the end.
- misconceptions: 2 to 4 common errors for this content, each with how the teacher addresses it.
- phases: each with a title, minutes, teacher, pupils, check (1 to 3 questions the teacher asks to check understanding, with the answer expected in brackets where helpful), feedback, support, challenge and ta.
- starterQuiz and exitQuiz: 3 to 5 multiple choice questions each, 3 or 4 options, one right answer (answer is its index from 0), with believable wrong options based on misconceptions. The starter quiz checks prior knowledge; the exit quiz checks the key learning points.
- assessment: how the teacher will know the objective was met, in the lesson and afterwards.
- resources: everything needed, printed and digital.
- teacherNotes: 1 or 2 short notes for whoever teaches the lesson (for example subject knowledge to check, or links to the next lesson).

${adaptation}

QUALITY: ${detail} Pitch every part precisely for ${yearGroup}. Make the main teaching follow a clear sequence: explain and model, check understanding, then practise with decreasing support. Reflect what Ofsted's curriculum and teaching evaluation area looks for: an ambitious, well-sequenced curriculum taught well, with understanding checked throughout.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: lessonResponseFormat(),
    layout,
    minutes,
  };
}
