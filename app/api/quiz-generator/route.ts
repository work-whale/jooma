import { NextRequest, NextResponse } from "next/server";
import { requestLanguage } from "@/app/lib/languages";
import { createCompletion } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { parseQuizAnswer, quizRequest, type QuizRequestBody } from "@/app/lib/quiz/prompt";
import { quizUsageStep } from "@/app/lib/quiz/quiz";

/*
 * Quiz questions as strict JSON (app/lib/quiz). Three actions: a whole quiz
 * ("generate"), one more question ("add") and a rewrite to an instruction
 * ("refine"). Only "generate" counts as a generation; the other two are
 * recorded under a step (quizUsageStep), which is_counted_generation ignores.
 * The prompts and schema live in app/lib/quiz/prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: QuizRequestBody = await req.json();

  const built = quizRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  try {
    const message = await createCompletion({
      language: requestLanguage(body),
      toolSlug: "quiz-generator",
      step: quizUsageStep(body.action),
      ...(await modelFor("quiz-generator", "gpt-4o")),
      max_completion_tokens: 8000,
      messages: built.messages,
      response_format: built.response_format,
    });

    const text = message.choices[0]?.message?.content ?? "";
    if (!text) return NextResponse.json({ error: "No questions came back. Please try again." }, { status: 502 });

    const { title, questions } = parseQuizAnswer(text);
    if (questions.length === 0) return NextResponse.json({ error: "No usable questions came back. Please try again." }, { status: 502 });
    return NextResponse.json({ title, questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate quiz";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
