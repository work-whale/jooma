import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { inspectionPrepRequest } from "@/app/lib/inspection-prep-prompt";

// The prompt lives in app/lib/inspection-prep-prompt.ts, where it is tested.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const request = inspectionPrepRequest(body);
  if ("error" in request) {
    return NextResponse.json({ error: request.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "inspection-prep",
    ...(await modelFor("inspection-prep", "gpt-4o")),
    max_completion_tokens: 4000,
    messages: request.messages,
  });
}
