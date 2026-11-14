import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { ectReportRequest } from "@/app/lib/ect-report-prompt";

/*
 * Streams an ECT's induction progress review or formal assessment as sheet
 * JSON (app/lib/sheets/ect.ts). The ECT's name never arrives here: the form
 * sends "[ECT]" in its place, and a request carrying a name key is refused.
 * Nor does the outcome: the induction tutor picks it and the page prints it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = ectReportRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "ect-report-writer",
    ...(await modelFor("ect-report-writer", "gpt-4o")),
    max_completion_tokens: 6000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
