import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { sensoryRequest } from "@/app/lib/sensory-prompt";

/*
 * Streams five multisensory activities as sheet JSON (app/lib/sheets/sensory.ts).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = sensoryRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "sensory-activities",
    ...(await modelFor("sensory-activities", "gpt-4o")),
    max_completion_tokens: 8192,
    messages: built.messages,
    response_format: built.response_format,
  });
}
