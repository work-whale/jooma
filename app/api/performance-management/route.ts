import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { performanceManagementRequest } from "@/app/lib/performance-management-prompt";

/*
 * Streams appraisal objectives as sheet JSON (app/lib/sheets/appraisal.ts).
 * The role is all that arrives about the person: a request with a name key
 * is refused. The review columns and sign-off are added on the page.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = performanceManagementRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "performance-management",
    ...(await modelFor("performance-management", "gpt-4o")),
    max_completion_tokens: 4000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
