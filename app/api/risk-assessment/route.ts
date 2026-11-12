import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { riskAssessmentRequest } from "@/app/lib/risk-assessment-prompt";

/*
 * Streams a risk assessment as sheet JSON (app/lib/sheets/risk.ts). The model
 * gives each hazard's likelihood and severity; the page does the sums and the
 * bands. The leader's name never arrives here: a request carrying one is
 * refused.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = riskAssessmentRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "risk-assessment",
    ...(await modelFor("risk-assessment", "gpt-4o")),
    max_completion_tokens: 8000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
