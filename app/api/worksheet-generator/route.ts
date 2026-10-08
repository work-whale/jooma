import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { worksheetRequest, type WorksheetRequest } from "@/app/lib/worksheet-prompt";

export type { WorksheetRequest };

/*
 * Streams a worksheet as sheet JSON (app/lib/sheets), which the form parses as
 * it arrives and draws as a designed page. The prompt and the schema live in
 * app/lib/worksheet-prompt.ts.
 */
export async function POST(req: NextRequest) {
  const body: WorksheetRequest = await req.json();

  const built = worksheetRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    toolSlug: "worksheet-generator",
    ...(await modelFor("worksheet-generator", "gpt-4o")),
    // JSON carries more tokens than the markdown it replaced; a 40 question
    // sheet with its answers needs the headroom.
    max_completion_tokens: 12000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
