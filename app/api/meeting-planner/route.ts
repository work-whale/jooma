import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { meetingRequest } from "@/app/lib/meeting-planner-prompt";

/*
 * Streams a meeting plan as sheet JSON (app/lib/sheets/meeting.ts). A
 * pupil's name is refused (the form sends [PUPIL]); titled colleagues are
 * scrubbed in app/lib/meeting-planner-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = meetingRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "meeting-planner",
    ...(await modelFor("meeting-planner", "gpt-4o")),
    max_completion_tokens: 5000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
