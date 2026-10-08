// Generates a brief, teacher-facing lesson outline for the given topic.
// Used by the slideshow wizard's "Generate lesson outline" button to pre-fill
// the Additional Instructions textarea — teachers get a structured starting
// point they can edit before generating the deck.

import { NextRequest, NextResponse } from "next/server";
import { createCompletion } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";

export const maxDuration = 60;

interface RequestBody {
  topic: string;
  year?: string;
  readingLevel?: string;
  subject?: string;
  curriculum?: string;
  strand?: string;
  /** The curriculum statements the teacher ticked in "Align to curriculum",
   *  verbatim. The outline's objectives are built on these when present. */
  statements?: string[];
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
  const statements = (Array.isArray(body.statements) ? body.statements : [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, 12);
  const statementsBlock = statements.length
    ? `Curriculum statements this lesson must teach towards (quoted from the curriculum):\n${statements.map((s) => `- ${s.trim()}`).join("\n")}\nBase the learning objectives directly on these statements, and keep every concept and activity within them.`
    : "";

  const prompt = `Sketch a brief lesson outline for: "${body.topic}".

${subjectLine}
${yearLine}
${readingLine}
${curriculumLine}
${strandLine}
${statementsBlock}

Frame the objectives, concepts and activities for the stated subject, year group and curriculum where given — pitch the depth to the year/reading level and use subject-appropriate terminology.

Write a compact teacher-facing outline (10-14 short lines, plain prose — no markdown headings, no slide numbers). Cover, in order:
- 1-2 learning objectives (what pupils will know or be able to do)
- 3-5 key concepts or sub-topics to teach
- 1-2 misconceptions to address
- 2-3 suggested activities or examples
- 1 closing assessment idea

Keep it concise — this gets pasted into a slideshow generator as additional context, so it should be a clear plan, not a script. Use British English.`;

  try {
    const completion = await createCompletion({
      toolSlug: "generate-lesson-outline",
      ...(await modelFor("generate-lesson-outline", "gpt-4o-2024-08-06")),
      messages: [
        { role: "system", content: "You are a UK classroom planning assistant. Output concise, teacher-friendly lesson outlines." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: outlineSchema },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    const parsed: { outline: string } = JSON.parse(content);
    return NextResponse.json({ outline: parsed.outline });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: "Outline generation failed", message: e?.message }, { status: 500 });
  }
}
