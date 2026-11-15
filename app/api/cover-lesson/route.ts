import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { requestCurriculum } from "@/app/lib/curricula";
import { coverRequest, type CoverLessonRequest } from "@/app/lib/cover-prompt";

export type { CoverLessonRequest };

/*
 * Streams a cover lesson as JSON (app/lib/sheets/cover.ts): a plan for a
 * non-specialist cover teacher, then a pupil task sheet with its answers. The
 * prompt and the schema live in app/lib/cover-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: CoverLessonRequest = await req.json();

  const built = coverRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body), curriculum: requestCurriculum(body),
    toolSlug: "cover-lesson",
    ...(await labModelFor(body, "cover-lesson", "gpt-4o")),
    max_completion_tokens: 8192,
    messages: built.messages,
    response_format: built.response_format,
  });
}
