// The Model Answers prompt and its strict schema. One request covers every
// question asked for (up to eight): for each, answers at the levels chosen,
// arranged into a sheet by app/lib/sheets/model-answers.ts.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { examStyle, isExamStyle } from "@/app/lib/sheets/exam-styles";
import { EXEMPLAR_LEVELS, isExemplarLevel, type ExemplarLevel } from "@/app/lib/sheets/model-answers";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { questionLabels } from "@/app/lib/sheets/markdown";
import { isQuestion } from "@/app/lib/sheets/types";

export const MAX_MODEL_QUESTIONS = 8;

export interface ModelAnswerQuestion {
  question: string;
  marks: number;
}

export interface ModelAnswerRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  questions?: ModelAnswerQuestion[];
  /** Before batches: one question and its marks. */
  question?: string;
  totalMarks?: number;
  levels?: string[];
  examStyle?: string;
  guidelines?: string | null;
  content?: string | null;
}

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const strList = { type: "array", items: str } as const;

export function modelAnswerResponseFormat(levels: ExemplarLevel[]) {
  const exemplar = strictObject({
    level: { type: "string", enum: levels },
    awarded: int,
    form: { type: "string", enum: ["prose", "steps", "points"] },
    parts: strList,
    annotations: { type: "array", items: strictObject({ quote: str, note: str }) },
    commentary: str,
  });
  const schema = strictObject({
    title: str,
    questions: { type: "array", items: strictObject({ question: str, marks: int, exemplars: { type: "array", items: exemplar }, teachingNotes: strList }) },
  });
  return { type: "json_schema" as const, json_schema: { name: "model_answers", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced UK examiner and subject teacher who writes model answers to teach exam technique, from Key Stage 2 to GCSE. " +
  "Your answers are exactly what the mark scheme rewards, written the way a strong pupil of that age would write them, and your notes show precisely which words earn which marks. " +
  "You return JSON that matches the given schema exactly. Write in UK English with UK spelling. Never use LaTeX: write maths with plain symbols such as × ÷ ² √ and fractions such as 3/4. Do not use long dashes.";

/** The questions a request is about: the list, or the single question of an
 *  older form. Blank ones are dropped and marks kept to 1 to 40. */
export function requestedQuestions(body: ModelAnswerRequest): ModelAnswerQuestion[] {
  const list = Array.isArray(body.questions) ? body.questions : body.question ? [{ question: body.question, marks: body.totalMarks ?? 6 }] : [];
  return list
    .map((q) => ({ question: typeof q?.question === "string" ? q.question.trim() : "", marks: Math.min(40, Math.max(1, Math.round(Number(q?.marks) || 1))) }))
    .filter((q) => q.question);
}

export function modelAnswerRequest(body: ModelAnswerRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof modelAnswerResponseFormat> }
  | { error: string } {
  const questions = requestedQuestions(body);
  if (!body.curriculum || !body.yearGroup || !body.subject?.trim()) return { error: "Missing required fields" };
  if (questions.length === 0) return { error: "Add at least one question" };
  if (questions.length > MAX_MODEL_QUESTIONS) return { error: `At most ${MAX_MODEL_QUESTIONS} questions at a time` };

  const levels = [...new Set((body.levels ?? ["full", "mid", "low"]).filter(isExemplarLevel))];
  if (levels.length === 0) return { error: "Choose at least one level" };
  const style = body.examStyle && isExamStyle(body.examStyle) ? examStyle(body.examStyle) : null;
  const named = levels.map((l) => EXEMPLAR_LEVELS.find((x) => x.id === l)!.label.toLowerCase()).join(", ");
  const guidance = body.guidelines?.trim() ? `\nMarking guidance from the teacher (follow it exactly):\n${body.guidelines.trim().slice(0, 4000)}` : "";
  const content = body.content?.trim() ? `\nContent the answers should draw on:\n${body.content.trim().slice(0, 4000)}` : "";

  const user = `Write model answers for ${body.yearGroup} pupils in ${body.subject.trim()} (${body.curriculum})${style ? `, marked in the style of ${style.label}` : ""}.${guidance}${content}

THE QUESTIONS (keep each question's wording and marks exactly as given, in this order)
${questions.map((q, i) => `${i + 1}. ${q.question} [${q.marks} mark${q.marks === 1 ? "" : "s"}]`).join("\n")}

FOR EACH QUESTION, one exemplar at each of these levels: ${named}.
- full: an answer that earns every mark (awarded equals the marks).
- mid: a sound answer that earns about half the marks, showing what typically gets partial credit.
- low: a near miss that just misses the next level, making the most common mistake for this question.
- awarded: the marks it would really earn.
- form: "steps" for a calculation or any method (one step a line, with units); "points" for short factual answers; "prose" only for extended writing of 6 marks or more. Never pad a short answer with an introduction or conclusion.
- parts: the answer itself, as paragraphs, steps or points.
- annotations: 2 to 5 notes, each quoting a short phrase copied exactly from this answer and saying which mark point it earns or what it lacks.
- commentary: one sentence on why the answer gets the marks it does.
- teachingNotes: 2 or 3 points for teaching from the question: what separates full marks from the rest, and the errors to watch for.

title: a short title, for example "${body.subject.trim()}: model answers".`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: modelAnswerResponseFormat(levels),
  };
}

/** A question from an exam paper, offered to answer. */
export interface PaperQuestion extends ModelAnswerQuestion {
  label: string;
  picked: boolean;
}

/** The parts of a saved exam paper, each with its question's opening
 *  context, so the answer knows what the part refers to. Parts worth 3 marks
 *  or more are ticked to start with, up to the limit. */
export function paperQuestions(output: string): PaperQuestion[] {
  const doc = parseSheet(output);
  if (!doc) return [];
  const labels = questionLabels(doc);
  const out: PaperQuestion[] = [];
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (!isQuestion(b) || !b.prompt.trim()) continue;
      const stem = s.instructions?.trim();
      out.push({ label: labels.get(b.id) ?? "", question: [stem, b.prompt.trim()].filter(Boolean).join(" "), marks: Math.max(1, b.marks), picked: false });
    }
  }
  let picked = 0;
  for (const q of out) if (q.marks >= 3 && picked < MAX_MODEL_QUESTIONS) { q.picked = true; picked++; }
  if (picked === 0) out.slice(0, MAX_MODEL_QUESTIONS).forEach((q) => (q.picked = true));
  return out;
}
