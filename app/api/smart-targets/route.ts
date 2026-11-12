import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { targetsRequest, type SmartTargetsRequest } from "@/app/lib/targets-prompt";

export type { SmartTargetsRequest };

/*
 * Streams SMART targets as sheet JSON (app/lib/sheets/targets.ts): the
 * targets table, a review table and signatures. The child's name never
 * arrives: a request with a name field is refused. The prompt and the schema
 * live in app/lib/targets-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: SmartTargetsRequest = await req.json();

  const built = targetsRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "smart-targets",
    ...(await labModelFor(body, "smart-targets", "gpt-4o")),
    max_completion_tokens: 6000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
