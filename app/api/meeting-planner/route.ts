import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { buildSystem } from "@/app/lib/systemPrompt";
import { requestLanguage } from "@/app/lib/languages";
import { buildMeetingPlannerPrompt } from "@/app/lib/meeting-planner-prompt";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const prompt = buildMeetingPlannerPrompt(body);
  if ("error" in prompt) return NextResponse.json({ error: prompt.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "meeting-planner",
    ...(await modelFor("meeting-planner", "gpt-4o")),
    max_completion_tokens: 3000,
    messages: [
      { role: "system", content: buildSystem(prompt.system) },
      { role: "user", content: prompt.user },
    ],
  });
}
