import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { buildSystem } from "@/app/lib/systemPrompt";


export async function POST(req: NextRequest) {
  const { currentContent, instruction } = await req.json();

  if (!currentContent?.trim() || !instruction?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  return streamChat({
    toolSlug: "modify",
    model: "gpt-4o",
    max_tokens: 8096,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK educational document editor. Apply only the changes described in the instruction — keep everything else exactly as it is, preserving the same structure, formatting, headings, markdown, tone, and UK English spelling. Return the complete document with the changes applied. Do not add commentary, preambles, or explanations. Maintain professional UK school terminology throughout. Never use the © symbol — always write labels as plain text: (a), (b), (c), (d).") },
      {
        role: "user",
        content: `Here is the current educational document:\n\n${currentContent}\n\n---\n\nInstruction: ${instruction}\n\nApply the instruction precisely and consistently throughout the document. Where the instruction affects multiple sections, apply it to all relevant sections. Do not change anything not specified in the instruction. Maintain UK English spelling, professional tone, and the original document's structure and formatting throughout.`,
      },
    ],
  });
}
