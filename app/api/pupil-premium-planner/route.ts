import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { pupilPremiumRequest } from "@/app/lib/pupil-premium-prompt";

/*
 * Streams a draft pupil premium strategy statement as sheet JSON
 * (app/lib/sheets/pupil-premium.ts), on the DfE template. Only the challenges
 * and the phase are sent: the school's details and every cost stay in the
 * browser and on the page.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = pupilPremiumRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "pupil-premium-planner",
    ...(await modelFor("pupil-premium-planner", "gpt-4o")),
    max_completion_tokens: 8000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
