import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { examRequest, type ExamPaperRequest } from "@/app/lib/exam-prompt";

export type { ExamPaperRequest };

/*
 * Streams an exam paper as sheet JSON (app/lib/sheets): one section per
 * question, the mark scheme in each part. The form arranges it with its cover
 * and draws it as designed pages. Prompt and schema: app/lib/exam-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: ExamPaperRequest = await req.json();

  const built = examRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "exam-question-generator",
    ...(await modelFor("exam-question-generator", "gpt-4o")),
    max_completion_tokens: 14000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
