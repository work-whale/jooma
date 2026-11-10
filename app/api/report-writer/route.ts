import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { reportsRequest, type ReportsRequestBody } from "@/app/lib/reports/prompt";
import { reportUsageStep } from "@/app/lib/reports/reports";

/*
 * Streams reports for up to ten pupils as JSON ({ reports: [{ ref, comment,
 * nextStep }] }). Pupils arrive as references, never names: the browser
 * swaps the names out before sending and back in afterwards
 * (app/lib/reports/privacy.ts), and a request carrying a name is refused.
 * Only a class's first request counts as a generation (reportUsageStep).
 * Prompt and schema: app/lib/reports/prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: ReportsRequestBody = await req.json();

  const built = reportsRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  // A Model Lab run keeps its own step, so lab spend is never counted as a
  // teacher's; otherwise the class's first request is the generation.
  const lab = await labModelFor(body, "report-writer", "gpt-4o");
  return streamChat({
    language: requestLanguage(body),
    toolSlug: "report-writer",
    ...lab,
    step: lab.step ?? reportUsageStep(body.chunkIndex, body.redo),
    max_completion_tokens: 8000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
