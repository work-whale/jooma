import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { lessonRequest, type LessonPlanRequest } from "@/app/lib/lesson-prompt";

export type { LessonPlanRequest };

/*
 * Streams a lesson plan as JSON (app/lib/sheets/lesson.ts), which the form
 * arranges into the chosen layout and draws as designed pages. The prompt and
 * the schema live in app/lib/lesson-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: LessonPlanRequest = await req.json();

  const built = lessonRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "lesson-planner",
    ...(await labModelFor(body, "lesson-planner", "gpt-4o")),
    // A whole plan as JSON, quizzes and adaptations included, is longer than
    // the markdown it replaced.
    max_completion_tokens: 12000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
