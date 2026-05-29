// Suggests key vocabulary terms for a topic. The slideshow wizard's "Key
// vocabulary" card calls this when enabled, then lets the teacher curate the
// list (uncheck / add their own) before the terms are woven into the deck.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";

export const maxDuration = 30;

interface RequestBody {
  topic: string;
  year?: string;
}

const vocabSchema = {
  name: "vocabulary",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["terms"],
    properties: {
      terms: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  const yearLine = body.year ? `Audience: UK ${body.year} pupils.` : "";
  const prompt = `List the key vocabulary a teacher would introduce when teaching: "${body.topic}".

${yearLine}

Return 5-8 essential terms — the specific subject words pupils need to learn for this topic, not generic words. Each term should be 1-3 words (a noun or noun phrase), no definitions, no punctuation. Order them from most fundamental to more advanced. Use British English spelling.`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a UK classroom planning assistant. You output precise subject-specific vocabulary lists." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: vocabSchema },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    const parsed: { terms: string[] } = JSON.parse(content);
    // Trim, drop empties/dupes, cap at 8.
    const seen = new Set<string>();
    const terms = parsed.terms
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
      .slice(0, 8);
    return NextResponse.json({ terms });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: "Vocabulary suggestion failed", message: e?.message }, { status: 500 });
  }
}
