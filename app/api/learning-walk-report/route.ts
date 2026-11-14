import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { learningWalkRequest } from "@/app/lib/learning-walk-prompt";

/*
 * Streams a learning walk report as sheet JSON
 * (app/lib/sheets/observation.ts). Staff named by title in the notes are
 * scrubbed to "a teacher" before the model sees them (in the browser, and
 * again in learningWalkRequest).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = learningWalkRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "learning-walk-report",
    ...(await modelFor("learning-walk-report", "gpt-4o")),
    max_completion_tokens: 5000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
