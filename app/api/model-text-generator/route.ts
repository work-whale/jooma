import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { bandUsageStep } from "@/app/lib/differentiation";
import { confirmFollowOn } from "@/app/lib/follow-on-server";
import { requestLanguage } from "@/app/lib/languages";
import { modelTextRequest, type ModelTextRequest } from "@/app/lib/model-text-prompt";

export type { ModelTextRequest as ModelTextGeneratorRequest };

/*
 * Streams a model text as sheet JSON (app/lib/sheets/model-text.ts): the
 * clean text, then a teacher copy with its features marked. The prompt and
 * the schema live in app/lib/model-text-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: ModelTextRequest = await req.json();

  const built = modelTextRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "model-text-generator",
    step: await confirmFollowOn("model-text-generator", bandUsageStep(body.band, body.bandIndex)),
    ...(await modelFor("model-text-generator", "gpt-4o")),
    max_completion_tokens: 10000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
