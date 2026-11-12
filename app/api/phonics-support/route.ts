import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { phonicsRequest, type PhonicsSupportRequest } from "@/app/lib/phonics-prompt";

export type { PhonicsSupportRequest };

/*
 * Streams a phonics resource for one grapheme as sheet JSON
 * (app/lib/sheets/phonics.ts). The prompt and the schema live in
 * app/lib/phonics-prompt.ts; the school's scheme words in
 * app/lib/phonics-schemes.ts.
 */
export async function POST(req: NextRequest) {
  const body: PhonicsSupportRequest = await req.json();

  const built = phonicsRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "phonics-support",
    ...(await modelFor("phonics-support", "gpt-4o")),
    max_completion_tokens: 10000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
