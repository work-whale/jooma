import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { sipRequest } from "@/app/lib/sip-prompt";

/*
 * Streams a school improvement plan as sheet JSON (app/lib/sheets/sip.ts):
 * an action table per priority and a monitoring calendar. Costs, RAG and
 * baselines are the school's, added blank on the page.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = sipRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "school-improvement-plan",
    ...(await modelFor("school-improvement-plan", "gpt-4o")),
    max_completion_tokens: 8000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
