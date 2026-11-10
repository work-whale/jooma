import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { letterRequest, type LetterRequestBody } from "@/app/lib/letter-prompt";

/*
 * Streams a letter as JSON ({ subject, paragraphs }), which the form turns
 * into designed pages with the date, salutation, sign-off and any reply slip
 * built in code (app/lib/sheets/letter.ts). No names arrive here: a request
 * carrying a name key is refused. Prompt and schema: app/lib/letter-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: LetterRequestBody = await req.json();

  const built = letterRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "letter-writer",
    ...(await labModelFor(body, "letter-writer", "gpt-4o")),
    max_completion_tokens: 2500,
    messages: built.messages,
    response_format: built.response_format,
  });
}
