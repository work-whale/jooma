import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { comprehensionMessages, type GenerateRequest } from "@/app/lib/comprehension-prompt";

export type { GenerateRequest };

export async function POST(req: NextRequest) {
  const body: GenerateRequest = await req.json();

  const built = comprehensionMessages(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    toolSlug: "comprehension-generator",
    ...(await labModelFor(body, "comprehension-generator", "gpt-4o")),
    max_completion_tokens: 4096,
    messages: built.messages,
  });
}
