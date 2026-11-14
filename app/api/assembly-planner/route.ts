import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { requestLanguage } from "@/app/lib/languages";
import { assemblyRequest } from "@/app/lib/assembly-prompt";

/*
 * Streams an assembly script as sheet JSON (app/lib/sheets/assembly.ts): the
 * parts with what to say and how, a running order that code makes add up to
 * the length, and a closing that follows the school's choice of reflection,
 * collective worship or faith school prayer.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const built = assemblyRequest(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "assembly-planner",
    ...(await modelFor("assembly-planner", "gpt-4o")),
    max_completion_tokens: 5000,
    messages: built.messages,
    response_format: built.response_format,
  });
}
