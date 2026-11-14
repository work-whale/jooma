import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { policyRequest } from "@/app/lib/policy-prompt";

/*
 * Streams a school policy as sheet JSON (app/lib/sheets/policy.ts). Its
 * status, review cycle and approver come from app/lib/policy-catalogue.ts on
 * the page, never from the model. The old refine action is gone: Ask Jo
 * edits the policy.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = policyRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "policy-generator",
    ...(await modelFor("policy-generator", "gpt-4o")),
    max_completion_tokens: 10000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
