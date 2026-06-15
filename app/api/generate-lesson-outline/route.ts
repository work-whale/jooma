// Generates a brief, teacher-facing lesson outline for the given topic.
// Used by the slideshow wizard's "Generate lesson outline" button to pre-fill
// the Additional Instructions textarea — teachers get a structured starting
// point they can edit before generating the deck.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { recordUsage } from "@/app/lib/usage";

export const maxDuration = 60;

interface RequestBody {
  topic: string;
  year?: string;
  readingLevel?: string;
  subject?: string;
  curriculum?: string;
  strand?: string;
}

const outlineSchema = {
  name: "lesson_outline",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["outline"],
    properties: {
      outline: { type: "string" },
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
  const readingLine = body.readingLevel && body.readingLevel !== "Same as Year"
    ? `Reading level: ${body.readingLevel}.`
    : "";
  const subjectLine = body.subject?.trim() ? `Subject: ${body.subject.trim()}.` : "";
  const curriculumLine = body.curriculum?.trim() ? `Curriculum: ${body.curriculum.trim()}.` : "";
  const strandLine = body.strand?.trim() ? `Curriculum strand/unit: ${body.strand.trim()}.` : "";

  const prompt = `Sketch a brief lesson outline for: "${body.topic}".

${subjectLine}
${yearLine}
${readingLine}
${curriculumLine}
${strandLine}

Frame the objectives, concepts and activities for the stated subject, year group and curriculum where given — pitch the depth to the year/reading level and use subject-appropriate terminology.

Write a compact teacher-facing outline (10-14 short lines, plain prose — no markdown headings, no slide numbers). Cover, in order:
- 1-2 learning objectives (what pupils will know or be able to do)
- 3-5 key concepts or sub-topics to teach
- 1-2 misconceptions to address
- 2-3 suggested activities or examples
- 1 closing assessment idea

Keep it concise — this gets pasted into a slideshow generator as additional context, so it should be a clear plan, not a script. Use British English.`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a UK classroom planning assistant. Output concise, teacher-friendly lesson outlines." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: outlineSchema },
    });
    void recordUsage("generate-lesson-outline", "gpt-4o-2024-08-06", completion.usage);
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    const parsed: { outline: string } = JSON.parse(content);
    return NextResponse.json({ outline: parsed.outline });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: "Outline generation failed", message: e?.message }, { status: 500 });
  }
}
