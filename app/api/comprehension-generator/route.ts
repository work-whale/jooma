import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { comprehensionMessages, type GenerateRequest } from "@/app/lib/comprehension-prompt";
import { bandUsageStep } from "@/app/lib/differentiation";

export type { GenerateRequest };

/** Streams a comprehension as sheet JSON (app/lib/sheets); see
 *  comprehension-prompt.ts for the prompt and the schema. */
export async function POST(req: NextRequest) {
  const body: GenerateRequest & { bandIndex?: number } = await req.json();

  const built = comprehensionMessages(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const lab = await labModelFor(body, "comprehension-generator", "gpt-4o");
  return streamChat({
    toolSlug: "comprehension-generator",
    ...lab,
    // A model lab run keeps its own step; otherwise a band's extra versions
    // are tagged so they do not count as more generations.
    step: lab.step ?? bandUsageStep(body.band, body.bandIndex),
    // A passage and its questions as JSON: more headroom than the markdown had.
    max_completion_tokens: 8000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
