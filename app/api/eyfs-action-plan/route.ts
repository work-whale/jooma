import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { eyfsActionPlanRequest } from "@/app/lib/eyfs-action-plan-prompt";

/*
 * Streams an EYFS action plan as sheet JSON (app/lib/sheets/eyfs-action-plan.ts):
 * four phases of actions as landscape tables. The old markdown version was
 * capped at 2000 tokens and cut off part way through the plan.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = eyfsActionPlanRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "eyfs-action-plan",
    ...(await modelFor("eyfs-action-plan", "gpt-4o")),
    max_completion_tokens: 8000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
