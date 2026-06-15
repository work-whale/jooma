// Rewrites a single slide text element per a natural-language instruction
// (or a quick action like "Simplify"). Used by the text element's "Edit with
// AI" popover in the editor. Returns only the revised text.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { recordUsage } from "@/app/lib/usage";

export const maxDuration = 30;

interface RequestBody {
  text: string;
  instruction: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const text = body.text?.trim();
  const instruction = body.instruction?.trim();
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });
  if (!instruction) return NextResponse.json({ error: "Missing instruction" }, { status: 400 });

  const prompt = `You are editing ONE text element from a classroom presentation slide.

Apply this instruction: ${instruction}

Rules:
- Return ONLY the revised text — no quotes, no preamble, no explanation, no markdown fences.
- Preserve the original line breaks / bullet structure unless the instruction asks to change it (each line is a separate bullet on the slide).
- Keep it concise and slide-appropriate — this sits on a slide, not in an essay.
- Keep any **bold** markers that are already present unless asked otherwise.

Text to edit:
"""
${text}
"""`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a precise slide-copy editor. Output only the revised text, nothing else." },
        { role: "user", content: prompt },
      ],
      max_tokens: 700,
      temperature: 0.7,
    });
    void recordUsage("edit-text", "gpt-4o-mini", completion.usage);
    const out = completion.choices[0]?.message?.content?.trim();
    if (!out) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    // Strip wrapping quotes the model sometimes adds despite instructions.
    const cleaned = out.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();
    return NextResponse.json({ text: cleaned });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: "Edit failed", message: e?.message }, { status: 500 });
  }
}
