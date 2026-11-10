import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { modelAnswerRequest, type ModelAnswerRequest } from "@/app/lib/model-answer-prompt";

export type { ModelAnswerRequest };

/*
 * Streams model answers as JSON, one question after another, each at the
 * levels asked for; the form arranges them into a sheet
 * (app/lib/sheets/model-answers.ts). Up to eight questions in one request,
 * which counts as one generation. Prompt and schema:
 * app/lib/model-answer-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: ModelAnswerRequest = await req.json();

  const built = modelAnswerRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "model-answer-generator",
    ...(await modelFor("model-answer-generator", "gpt-4o")),
    max_completion_tokens: 16000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
