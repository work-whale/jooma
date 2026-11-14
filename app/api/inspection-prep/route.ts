import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { inspectionPrepRequest } from "@/app/lib/inspection-prep-prompt";

/*
 * Streams an inspection preparation guide as sheet JSON
 * (app/lib/sheets/inspection.ts): questions, actions, evidence and success
 * criteria per area. The prompt lives in app/lib/inspection-prep-prompt.ts,
 * where it is tested.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = inspectionPrepRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "inspection-prep",
    ...(await modelFor("inspection-prep", "gpt-4o")),
    max_completion_tokens: 10000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
