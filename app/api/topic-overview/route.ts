import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { unitRequest, type UnitPlanRequest } from "@/app/lib/unit-prompt";

export type TopicOverviewRequest = UnitPlanRequest;

/*
 * Streams a Topic Map as JSON (app/lib/sheets/unit.ts): a unit of lessons the
 * form draws as a landscape table, one row per lesson. The prompt and the
 * schema, shared with Term Plan, live in app/lib/unit-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: UnitPlanRequest = await req.json();

  const built = unitRequest("topicMap", body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "topic-overview",
    ...(await labModelFor(body, "topic-overview", "gpt-4o")),
    // Every field of every lesson, up to 30 lessons, as JSON.
    max_completion_tokens: 16000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
