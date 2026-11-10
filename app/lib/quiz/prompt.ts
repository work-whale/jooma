// The Quiz prompts and their strict schema, kept out of the route so they can
// be tested. Three actions share one shape of answer:
//
//   generate  a whole quiz from the form
//   add       one more question, unlike the ones already there
//   refine    the questions rewritten to an instruction
//
// The schema offers only the question types the teacher chose, so "multiple
// correct answers" is enforced by the schema, not asked for and hoped for.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { MAX_QUESTIONS, normalizeQuizItem, typesFor, type QuizItem, type QuizQuestionType } from "./quiz";

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const intList = { type: "array", items: { type: "integer" } } as const;

export function quizResponseFormat(types: QuizQuestionType[]) {
  const question = strictObject({
    type: { type: "string", enum: types },
    question: str,
    options: strList,
    answers: intList,
    explanation: str,
  });
  const schema = strictObject({ title: str, questions: { type: "array", items: question } });
  return { type: "json_schema" as const, json_schema: { name: "quiz", strict: true, schema } };
}

export interface QuizRequestBody {
  action?: "generate" | "add" | "refine";
  curriculum?: string;
  yearGroup?: string;
  subject?: string;
  topic?: string;
  numQuestions?: number;
  answerType?: string;
  existingQuestions?: unknown[];
  instruction?: string;
}

const SYSTEM =
  "You are an expert UK teacher and assessment specialist who writes quizzes for retrieval practice and checking understanding, for every key stage and subject. " +
  "A good question has a clear, unambiguous stem; answers that are unambiguously right; wrong options that are plausible because they come from real misconceptions; and options that are grammatically parallel and similar in length, so the right one never stands out. " +
  "You return JSON that matches the given schema exactly. Write in UK English with UK spelling. Never use LaTeX: write maths with plain symbols such as × ÷ ² and fractions such as 3/4. Do not use long dashes.";

const TYPE_RULES: Record<QuizQuestionType, string> = {
  single: "single: 4 options, exactly one right answer (answers holds its index, 0 to 3).",
  multiple: "multiple: 4 or 5 options with two or three right answers (answers holds their indices). Say in the question how many to choose, for example \"Choose two.\"",
  truefalse: "truefalse: options are exactly [\"True\", \"False\"], answers is [0] for true or [1] for false. Write a statement that is clearly true or clearly false, never a trick.",
};

function typeRules(types: QuizQuestionType[]): string {
  return `QUESTION TYPES (use only these)\n${types.map((t) => `- ${TYPE_RULES[t]}`).join("\n")}`;
}

const QUALITY = `QUALITY
- Spread the right answer across positions; never always the first or last.
- Each question tests a different idea; mix recall, application, interpreting an example and key vocabulary.
- explanation: one sentence saying why the right answer is right (and, where useful, why the tempting wrong one is wrong), pitched for the pupils.
- No "all of the above" or "none of the above", no negatives in capitals, no trick wording.`;

/** The questions already in the quiz, as the model should see them. */
function existing(raw: unknown[] | undefined): QuizItem[] {
  return (raw ?? []).map(normalizeQuizItem).filter((q): q is QuizItem => !!q);
}

export function quizRequest(body: QuizRequestBody):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof quizResponseFormat> }
  | { error: string } {
  const action = body.action;
  const types = typesFor(body.answerType);
  const who = `${body.yearGroup} pupils studying ${body.subject?.trim()} (${body.curriculum})`;

  let user: string;
  if (action === "generate") {
    if (!body.curriculum || !body.yearGroup || !body.subject?.trim() || !body.topic?.trim()) return { error: "Missing required fields" };
    const n = Math.min(MAX_QUESTIONS, Math.max(1, Math.round(Number(body.numQuestions) || 5)));
    const mix = types.length > 1 ? " Use a mix of the question types, mostly single." : "";
    user = `Write a quiz of exactly ${n} questions on "${body.topic.trim()}" for ${who}.${mix}\n\ntitle: a short title for the quiz.\n\n${typeRules(types)}\n\n${QUALITY}`;
  } else if (action === "add") {
    if (!body.curriculum || !body.yearGroup || !body.subject?.trim()) return { error: "Missing required fields" };
    const have = existing(body.existingQuestions);
    if (have.length === 0) return { error: "There are no questions to add to yet" };
    user = `Add exactly 1 question to this quiz${body.topic?.trim() ? ` on "${body.topic.trim()}"` : ""} for ${who}. It must test something the existing questions do not.\n\nExisting questions:\n${have.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}\n\ntitle: repeat the quiz's title, or "" if unsure.\n\n${typeRules(types)}\n\n${QUALITY}`;
  } else if (action === "refine") {
    const have = existing(body.existingQuestions);
    if (!body.instruction?.trim() || have.length === 0) return { error: "Missing required fields" };
    const kinds = [...new Set([...types, ...have.map((q) => q.type)])];
    user = `Change this quiz as the teacher asks: "${body.instruction.trim()}"\n\nApply it wherever it is relevant and change nothing else. Keep the same number of questions unless the instruction says to add or remove some, keep every answer right, and keep the questions suitable for ${who}.\n\nThe quiz now (JSON):\n${JSON.stringify(have)}\n\ntitle: the quiz's title, changed only if the instruction asks.\n\n${typeRules(kinds)}\n\n${QUALITY}`;
    return {
      messages: [
        { role: "system", content: buildSystem(SYSTEM) },
        { role: "user", content: user },
      ],
      response_format: quizResponseFormat(kinds),
    };
  } else {
    return { error: "Unknown action" };
  }

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: quizResponseFormat(types),
  };
}

/** The model's answer as sound questions; invalid ones are dropped. */
export function parseQuizAnswer(text: string): { title: string; questions: QuizItem[] } {
  const stripped = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
  const raw = JSON.parse(stripped) as { title?: unknown; questions?: unknown };
  if (!Array.isArray(raw.questions)) throw new Error("Invalid response structure");
  return {
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    questions: raw.questions.map(normalizeQuizItem).filter((q): q is QuizItem => !!q),
  };
}
