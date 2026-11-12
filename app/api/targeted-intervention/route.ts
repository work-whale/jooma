import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { interventionRequest, type TargetedInterventionRequest } from "@/app/lib/intervention-prompt";

export type { TargetedInterventionRequest };

/*
 * Streams intervention ideas for one pupil as sheet JSON
 * (app/lib/sheets/intervention.ts). The child's name never arrives: a request
 * with a name field is refused. The prompt and the schema live in
 * app/lib/intervention-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: TargetedInterventionRequest = await req.json();

  const built = interventionRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "targeted-intervention",
    ...(await modelFor("targeted-intervention", "gpt-4o")),
    max_completion_tokens: 8000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
