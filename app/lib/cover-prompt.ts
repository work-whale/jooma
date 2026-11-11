// The Cover Lesson prompt: a plan for a non-specialist cover teacher and a
// pupil task sheet, as structured JSON (app/lib/sheets/cover.ts) rather than
// markdown.

import { buildSystem } from "@/app/lib/systemPrompt";
import { bandName, orderedBands, type Differentiate } from "@/app/lib/differentiation";
import { sheetBlockVariants, strictObject } from "@/app/lib/sheets/schema";
import { lessonMinutes } from "@/app/lib/sheets/lesson";
import { COVER_KINDS, coverMinutes } from "@/app/lib/sheets/cover";

export interface CoverLessonRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  /** "60 minutes", as the form's field holds it. */
  lessonLength: string;
  resources: string;
  additionalContext?: string;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
}

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const strList = { type: "array", items: str } as const;

/** The strict schema a cover lesson is written against. The pupil task's
 *  questions use the sheet's own question shapes, so they print, mark and
 *  edit like any worksheet's. */
export function coverResponseFormat() {
  const questions = sheetBlockVariants({ tool: "cover", kinds: [...COVER_KINDS], passage: false }).filter((v) =>
    (COVER_KINDS as readonly string[]).includes(((v.properties as Record<string, { enum: string[] }>).type.enum[0])),
  );
  const schema = strictObject({
    title: str,
    notes: strList,
    phases: {
      type: "array",
      items: strictObject({
        stage: { type: "string", enum: ["starter", "main", "plenary"] },
        title: str,
        minutes: int,
        say: str,
        teacher: str,
        pupils: str,
        challenge: str,
      }),
    },
    checklist: strList,
    task: strictObject({ title: str, instructions: str, questions: { type: "array", items: { anyOf: questions } } }),
  });
  return { type: "json_schema" as const, json_schema: { name: "cover_lesson", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced UK teacher who writes cover lessons that a cover supervisor or supply teacher with no subject knowledge can deliver confidently, with no preparation. " +
  "You are explicit, calm and practical: exact words to say, numbered steps, realistic timings and tasks pupils can do independently. " +
  "You return the lesson as JSON that matches the given schema exactly. Write in UK English. " +
  "Never use LaTeX for maths: write plain symbols such as × ÷ ² and fractions such as 3/4. Do not use long dashes: use commas, colons or full stops.";

/**
 * Validate a request and build its messages and response format. Returns
 * `{ error }` for a request the model should never see.
 */
export function coverRequest(body: CoverLessonRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof coverResponseFormat>; minutes: number }
  | { error: string } {
  const curriculum = body.curriculum?.trim();
  const yearGroup = body.yearGroup?.trim();
  const subject = body.subject?.trim();
  const topic = body.topic?.trim();
  const resources = body.resources?.trim();
  const asked = coverMinutes(body.lessonLength);
  if (!curriculum || !yearGroup || !subject || !topic || !resources || asked === null) return { error: "Missing required fields" };
  const minutes = lessonMinutes(asked);

  const bands = body.differentiate === "yes" ? orderedBands(body.differentiationLevels ?? []) : [];
  const adaptation = bands.length
    ? `the class includes pupils working at ${bands.map(bandName).join(", ")}. Order the task's questions from most accessible to most demanding, so pupils working at ${bandName(bands[0])} can succeed with the first ones and those at ${bandName(bands[bands.length - 1])} are stretched by the last.`
    : "";
  const context = body.additionalContext?.trim() ? `\n- Notes from the class teacher: ${body.additionalContext.trim()}` : "";

  const user = `Write a cover lesson.

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- Subject: ${subject}
- Topic the class is studying: ${topic}
- Lesson length: ${minutes} minutes
- Resources available: ${resources}${context}

The cover teacher is not a subject specialist and has not seen the class before. Everything must work with only the resources available.

FIELDS
- title: a short title for the lesson.
- notes: 3 to 5 points for the cover teacher before they go in: what the class has been learning, how to set the room up, and one or two calm classroom management tips.
- phases: exactly one starter, 1 or 2 main tasks, then exactly one plenary, in order, each with:
  - title: a short name for the activity.
  - minutes: how long it takes. The phases must add up to ${minutes} minutes.
  - say: the exact words the cover teacher can say to introduce it, in a natural, friendly voice, as one or two short paragraphs.
  - teacher: numbered steps for the cover teacher, written as one string ("1. ... 2. ..."), including what to write on the board and what a good outcome looks like.
  - pupils: what pupils do, in one or two sentences.
  - challenge: what pupils who finish early do: a real extension, never "read your notes".
- checklist: 4 or 5 things to do before leaving the room (collect work, note who helped, leave a note for the teacher).
- task: the pupil task sheet that the main task uses, which pupils complete on their own:
  - title: what pupils see at the top, such as "${topic}: practice questions".
  - instructions: one or two sentences to pupils.
  - questions: 6 to 10 questions that build from recall to deeper thinking, using the question types offered. Every question carries its correct answer, so the cover teacher can go through it. Pitch them for ${yearGroup}.${adaptation ? `\n\nDIFFERENTIATION: ${adaptation}` : ""}

QUALITY: subject-accurate and specific to ${topic}, never generic. Nothing should need the cover teacher to know the subject.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: coverResponseFormat(),
    minutes,
  };
}
