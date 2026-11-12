// The Homework prompt: a pupil sheet as structured JSON
// (app/lib/sheets/homework.ts) rather than markdown.

import { buildSystem } from "@/app/lib/systemPrompt";
import { bandName, bandPitch, differentiationPrompt, isBand, type Differentiate } from "@/app/lib/differentiation";
import { kindsForTypes, sheetBlockVariants, strictObject } from "@/app/lib/sheets/schema";
import { HOMEWORK_TYPES, homeworkMinutes, isProjectType } from "@/app/lib/sheets/homework";
import type { QuestionType } from "@/app/lib/sheets/types";

export interface HomeworkRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  learningObjective: string;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
  /** One band's version of a differentiated set (app/lib/bands.ts). */
  band?: string;
  bandIndex?: number;
  questionTypes?: string[];
  questionCounts?: Record<string, number>;
  homeworkType: string;
  length: string;
  includeAnswers: boolean;
  additionalInstructions?: string;
  lessonContent?: string;
  imageBase64?: string;
  imageMediaType?: string;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

/** The strict schema a homework is written against. Its questions use the
 *  sheet's own question shapes, so they print, mark and edit like a
 *  worksheet's. */
export function homeworkResponseFormat(kinds: QuestionType[]) {
  const questions = sheetBlockVariants({ tool: "homework", kinds, passage: false }).filter((v) =>
    (kinds as string[]).includes((v.properties as Record<string, { enum: string[] }>).type.enum[0]),
  );
  const schema = strictObject({
    title: str,
    objective: str,
    instructions: str,
    remember: strictObject({ keyWords: { type: "array", items: strictObject({ term: str, meaning: str }) }, reminder: str }),
    task: strictObject({
      title: str,
      instructions: str,
      stimulus: strictObject({ title: str, paragraphs: strList }),
      steps: strList,
      successCriteria: strList,
      questions: { type: "array", items: { anyOf: questions } },
    }),
    checklist: strList,
    teacherNotes: { type: "array", items: strictObject({ title: str, points: strList }) },
  });
  return { type: "json_schema" as const, json_schema: { name: "homework", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK teacher who sets purposeful homework for every key stage. Your homework is precisely pitched for the year group, sized to the time it should take, and clear enough for a pupil to complete alone at home with no adult to explain it. " +
  "You return the homework as JSON that matches the given schema exactly. Write in UK English. Never use emoji. " +
  "Never use LaTeX for maths: write plain symbols such as × ÷ ² and fractions such as 3/4. Do not use long dashes: use commas, colons or full stops.";

/** Lesson material pasted by the teacher is capped before it reaches the
 *  model; the form allows far more than a homework needs. */
const MAX_LESSON_CONTENT = 20000;

type UserContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

/**
 * Validate a request and build its messages and response format. Returns
 * `{ error }` for a request the model should never see (an empty body is how
 * the billing tests reach the route, so it must stay a plain 400).
 */
export function homeworkRequest(body: HomeworkRequest):
  | { messages: { role: "system" | "user"; content: UserContent }[]; response_format: ReturnType<typeof homeworkResponseFormat> }
  | { error: string } {
  const curriculum = body?.curriculum?.trim();
  const yearGroup = body?.yearGroup?.trim();
  const subject = body?.subject?.trim();
  const objective = body?.learningObjective?.trim();
  const homeworkType = body?.homeworkType?.trim();
  const length = body?.length?.trim();
  if (!curriculum || !yearGroup || !subject || !objective || !homeworkType || !length) return { error: "Missing required fields" };

  const type = (HOMEWORK_TYPES as readonly string[]).includes(homeworkType) ? homeworkType : "Mixed tasks";
  const project = isProjectType(type);
  const minutes = homeworkMinutes(length) ?? 20;
  const reading = type === "Reading comprehension";

  const kinds = kindsForTypes("homework", body.questionTypes);
  const counts = (body.questionTypes ?? [])
    .map((t) => (body.questionCounts?.[t] ? `${t} (${body.questionCounts[t]})` : ""))
    .filter(Boolean);
  const typesLine = body.questionTypes?.length
    ? `Use ONLY these question formats: ${body.questionTypes.join(", ")}.${counts.length ? ` How many of each: ${counts.join(", ")}.` : ""}`
    : "Use a varied mix of question formats that suits the subject and the year group.";

  const band = isBand(body.band) ? body.band : null;
  const adaptation = band ? "" : differentiationPrompt(body.differentiate ?? "no", body.differentiationLevels ?? []);
  const pitch = band
    ? `\n- ${bandPitch(band)}\n- teacherNotes: one note titled "How this version is pitched: ${bandName(band)}" with 2 or 3 points.`
    : adaptation
      ? `\n- Order the questions from most accessible to most demanding. teacherNotes: one note titled "Differentiation": ${adaptation}`
      : "\n- teacherNotes: an empty list.";

  const lesson = body.lessonContent?.trim().slice(0, MAX_LESSON_CONTENT);
  const extras = [
    body.additionalInstructions?.trim() ? `- Teacher's additional instructions (follow them): ${body.additionalInstructions.trim()}` : "",
    lesson ? `- Base the homework on this lesson material from the teacher:\n"""\n${lesson}\n"""` : "",
    body.imageBase64 ? "- The teacher has attached an image: use it as context and refer to it in the task where it helps (\"Look at the picture and...\")." : "",
  ].filter(Boolean).join("\n");

  const taskRule = project
    ? `- task: a ${type.toLowerCase()} pupils can do at home with everyday things. title: what pupils see. instructions: one or two sentences. stimulus: empty title and no paragraphs. steps: 4 to 6 numbered steps to follow. successCriteria: 3 or 4 points that a great piece of work includes. questions: at most 2 short questions that ask pupils to reflect on or explain what they did.`
    : `- task: title (what pupils see) and instructions (one or two sentences). steps and successCriteria: empty lists. ${reading ? "stimulus: an original text of 200 to 400 words pitched for the year group, with a title, as paragraphs; then questions on it." : "stimulus: empty title and no paragraphs, unless a question needs a short scenario or source to read."} questions: enough for about ${minutes} minutes, building from recall to deeper thinking. ${typesLine}`;

  const prompt = `Create a homework task.

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- Subject: ${subject}
- Learning objective: ${objective}
- Homework type: ${type}
- Time it should take: about ${minutes} minutes${extras ? `\n${extras}` : ""}

FIELDS
- title: specific to the topic, never just "Homework".
- objective: the learning objective for pupils, starting "I am learning to".
- instructions: 2 or 3 sentences to the pupil saying exactly what to do and what to hand in.
- remember: keyWords, 4 to 6 terms the pupil needs, each with a short, pupil-friendly meaning; reminder, one or two sentences reminding them of the key idea or method from the lesson.
${taskRule}
- Fill every answer field correctly: they become the answers page${body.includeAnswers ? "" : " (switched off at first, but the teacher can show it)"}. For an extended answer, put a model answer in answer and 2 to 4 success criteria in criteria.
- mcq: 3 or 4 options with plausible distractors; answers holds the index of the correct option. matching: right in a shuffled order; pairs[i] is the index in right that matches left[i]. fillblanks: write ___ for each gap. lines: the writing lines a pupil needs.
- checklist: 3 to 5 things the pupil checks before handing it in, tied to the objective ("I have shown my working").${pitch}

QUALITY: subject-accurate, pitched for ${yearGroup}, doable alone at home, and sized to about ${minutes} minutes. Number nothing yourself: questions are numbered on the page.`;

  const content: UserContent = body.imageBase64 && body.imageMediaType
    ? [{ type: "image_url", image_url: { url: `data:${body.imageMediaType};base64,${body.imageBase64}` } }, { type: "text", text: prompt }]
    : prompt;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content },
    ],
    response_format: homeworkResponseFormat(kinds),
  };
}
