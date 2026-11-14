import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { lessonObservationRequest } from "@/app/lib/lesson-observation-prompt";

/*
 * Streams a lesson observation report as sheet JSON
 * (app/lib/sheets/observation.ts). The teacher's and observer's names never
 * arrive here: the form sends "[TEACHER]" and "[OBSERVER]", and a request
 * carrying a name key is refused.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = lessonObservationRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "lesson-observation-report",
    ...(await modelFor("lesson-observation-report", "gpt-4o")),
    max_completion_tokens: 5000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
