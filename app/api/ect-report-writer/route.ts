import { NextRequest, NextResponse } from "next/server";
import { buildSystem } from "@/app/lib/systemPrompt";
import { requestLanguage } from "@/app/lib/languages";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { buildEctReportPrompt } from "@/app/lib/ect-report-prompt";

// The ECT's name never arrives here: the form sends "[ECT]" in its place and
// puts the name back into the stream (app/lib/staff-privacy.ts).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const prompt = buildEctReportPrompt(body);
  if ("error" in prompt) return NextResponse.json({ error: prompt.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "ect-report-writer",
    ...(await modelFor("ect-report-writer", "gpt-4o")),
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem(prompt.system) },
      { role: "user", content: prompt.user },
    ],
  });
}
