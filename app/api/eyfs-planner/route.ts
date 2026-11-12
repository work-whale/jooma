import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { eyfsRequest, type EYFSPlannerRequest } from "@/app/lib/eyfs-prompt";

export type { EYFSPlannerRequest };

/*
 * Streams an Early Years topic plan as sheet JSON (app/lib/sheets/eyfs.ts):
 * a week by week grid, then the seven areas of learning. The prompt and the
 * schema live in app/lib/eyfs-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: EYFSPlannerRequest = await req.json();

  const built = eyfsRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "eyfs-planner",
    ...(await modelFor("eyfs-planner", "gpt-4o")),
    max_completion_tokens: 14000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
