// Picks the curriculum statements a lesson topic would teach, for the slideshow
// wizard's "Align to curriculum" card: the subject, the strand, and up to three
// statements, which the card then shows ticked.
//
// The candidates are the year's real statements (app/lib/national-curriculum),
// numbered, so the model can only point at something that exists, and every
// pick is checked against the list before it is returned. Kept at this path,
// rather than renamed, because a guest on /create needs it too and it is
// already allowed for guests in proxy.ts and cost-guarded in generation-guard.

import { NextRequest, NextResponse } from "next/server";
import { createCompletion } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { isCurriculumYear, loadStatements } from "@/app/lib/national-curriculum";

export const maxDuration = 15;

const empty = { subject: "", strand: "", statementIds: [] as string[] };

export async function POST(req: NextRequest) {
  let body: { topic?: string; year?: string };
  try { body = await req.json(); } catch { return NextResponse.json(empty); }

  const topic = body.topic?.trim().slice(0, 300);
  const year = body.year;
  if (!topic || !isCurriculumYear(year)) return NextResponse.json(empty);

  const statements = await loadStatements(year);
  if (statements.length === 0) return NextResponse.json(empty);

  // Numbers rather than ids: shorter for the model, and unambiguous to check.
  const list = statements
    .map((s, i) => `${i + 1}. [${s.subject} > ${s.strand}] ${s.text.slice(0, 220)}`)
    .join("\n");

  try {
    const completion = await createCompletion({
      toolSlug: "suggest-subject",
      ...(await modelFor("suggest-subject", "gpt-4o-mini")),
      messages: [
        {
          role: "system",
          content:
            "You align a lesson to the curriculum statements it would directly teach. " +
            "From the numbered list, return the numbers of one to three statements a lesson on this topic would teach, " +
            "most relevant first, all from the same subject. Prefer the statement that names the topic's content. " +
            "Return an empty list if no statement is a reasonable fit.",
        },
        {
          role: "user",
          content: `Lesson topic: "${topic}"\nYear group: ${year}\n\nStatements:\n${list}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "statement_picks",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["picks"],
            properties: { picks: { type: "array", items: { type: "integer" } } },
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json(empty);
    const { picks } = JSON.parse(content) as { picks: number[] };

    const chosen = (Array.isArray(picks) ? picks : [])
      .map((n) => statements[n - 1])
      .filter((s): s is NonNullable<typeof s> => !!s);
    if (chosen.length === 0) return NextResponse.json(empty);

    // One subject, the first pick's. A second subject's statement would be
    // invisible in the card, which lists one subject at a time.
    const subject = chosen[0].subject;
    const sameSubject = [...new Map(chosen.filter((s) => s.subject === subject).map((s) => [s.id, s])).values()].slice(0, 3);
    const strands = new Set(sameSubject.map((s) => s.strand));
    return NextResponse.json({
      subject,
      // One strand when the picks share it; "" (All strands) when they span two.
      strand: strands.size === 1 ? sameSubject[0].strand : "",
      statementIds: sameSubject.map((s) => s.id),
    });
  } catch (err) {
    console.warn("[suggest-subject] failed:", err);
    return NextResponse.json(empty);
  }
}
