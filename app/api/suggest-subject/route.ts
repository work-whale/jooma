// Maps a lesson topic to the best-fitting curriculum subject (and strand) from
// a provided list. Used by the slideshow generator's "Align to curriculum"
// step to pre-fill the subject dropdown based on what the teacher typed.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";

export const maxDuration = 15;

interface Subj { name: string; strands: string[] }

const empty = { subject: "", strand: "" };

export async function POST(req: NextRequest) {
  let body: { topic?: string; subjects?: Subj[] };
  try { body = await req.json(); } catch { return NextResponse.json(empty); }

  const topic = body.topic?.trim();
  const subjects = Array.isArray(body.subjects) ? body.subjects : [];
  if (!topic || subjects.length === 0) return NextResponse.json(empty);

  const subjectNames = subjects.map((s) => s.name);
  const lines = subjects
    .map((s) => `- ${s.name}: ${(s.strands ?? []).join("; ")}`)
    .join("\n");

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You map a lesson topic to the single best-fitting curriculum subject and strand from a provided list. " +
            "Return EXACTLY one subject name from the list and one strand from that subject's strands, copied verbatim. " +
            "If no subject is a reasonable fit, return empty strings.",
        },
        {
          role: "user",
          content: `Lesson topic: "${topic}"\n\nSubjects and their strands:\n${lines}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "subject_pick",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["subject", "strand"],
            properties: {
              subject: { type: "string" },
              strand: { type: "string" },
            },
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json(empty);
    const parsed = JSON.parse(content) as { subject: string; strand: string };

    // Validate against the provided lists so we never return something the
    // dropdown can't select.
    const subject = subjectNames.includes(parsed.subject) ? parsed.subject : "";
    const strands = subjects.find((s) => s.name === subject)?.strands ?? [];
    const strand = strands.includes(parsed.strand) ? parsed.strand : "";
    return NextResponse.json({ subject, strand });
  } catch (err) {
    console.warn("[suggest-subject] failed:", err);
    return NextResponse.json(empty);
  }
}
