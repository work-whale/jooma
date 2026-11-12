import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { newsletterRequest } from "@/app/lib/newsletter-prompt";

/*
 * Streams a newsletter as sheet JSON (app/lib/sheets/newsletter.ts). The
 * celebrations and dates are built on the page and never arrive here; a body
 * carrying a name key is refused, and a malformed `sections` is a 400, not
 * the 500 it used to be.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = newsletterRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "newsletter-writer",
    ...(await labModelFor(body, "newsletter-writer", "gpt-4o")),
    max_completion_tokens: 6000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
