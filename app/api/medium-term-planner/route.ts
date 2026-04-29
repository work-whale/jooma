import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface MediumTermPlannerRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  numberOfLessons: number;
  examSpec?: string | null;
  abilityLevel?: string;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const body: MediumTermPlannerRequest = await req.json();

  const { curriculum, yearGroup, subject, topic, numberOfLessons, examSpec, abilityLevel = "EXS" } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !topic?.trim() || !numberOfLessons) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const examSpecSection = examSpec
    ? `\nIncorporate the following exam specification or curriculum guidance: ${examSpec}`
    : "";

  const abilityLine =
    abilityLevel === "WTS"
      ? "Pitch all content for Working Towards Standard (WTS) students — use accessible language, provide scaffolding, and reduce cognitive load where possible."
      : abilityLevel === "GDS"
      ? "Pitch all content for Greater Depth Standard (GDS) students — include higher-order thinking, extension challenges, and tasks that require deeper analysis and evaluation."
      : "Pitch all content at the Expected Standard (EXS) — appropriate challenge for most students in this year group.";

  const userPrompt = `Create a detailed, coherent medium-term plan for the following:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Topic: ${topic}
- Number of Lessons: ${numberOfLessons}
- ${abilityLine}${examSpecSection}

This medium-term plan is for a UK school. It should demonstrate clear curriculum intent — each lesson must deliberately build on the previous one, developing a coherent sequence of knowledge and skills. The plan should reflect the kind of curriculum thinking that Ofsted's Education Inspection Framework expects: a well-sequenced, knowledge-rich programme of study in which prior learning is built upon and pupils make cumulative progress.

Generate the plan as a markdown table with exactly these four columns:

| Lesson | Learning Objective | Summary of Lesson | Key Knowledge Pupils Will Have Secured by End of Lesson |

Rules:
- Include exactly ${numberOfLessons} lesson rows.
- **Lesson column**: Format as "Lesson [N]: [Specific Title]" where the title is a precise 3–6 word description of the lesson's content (e.g. "Lesson 1: The Causes of the First World War"). Avoid generic titles such as "Introduction" or "Overview".
- **Learning Objective**: One specific, measurable objective beginning with "Pupils will be able to..." and using an active, cognitive verb (e.g. identify, explain, compare, evaluate, construct, analyse). Objectives must progress in demand and complexity across the sequence — do not repeat the same verb type across consecutive lessons.
- **Summary of Lesson**: 3–4 sentences describing: (1) the core content taught, (2) the main teaching approach or explanation, and (3) the key student task or activity. Be specific about subject content — avoid vague phrases like "explore" or "look at".
- **Key Knowledge**: 3–5 specific knowledge statements separated by semicolons (for table formatting), written as declarative facts or conceptual understandings beginning with "That..." where appropriate (e.g. "That the Treaty of Versailles imposed reparations on Germany; That the 'war guilt' clause was article 231..."). This column represents the core knowledge pupils will retain from the lesson.
- The sequence must have a clear arc: introduce foundational concepts early, build complexity in the middle, and consolidate or evaluate in the final lessons.
- Do not add any text before or after the table.
- Do not use any emojis.
- Write in a professional, teacher-friendly tone using UK English.`;

  const encoder = new TextEncoder();
  const anthropicStream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: buildSystem("You are an expert UK teacher, head of department, and curriculum designer with extensive experience writing medium-term plans across primary and secondary phases. You have a deep understanding of curriculum sequencing, knowledge-rich teaching, and the expectations of Ofsted's Education Inspection Framework. You know how to build a coherent sequence of lessons that develops pupils' knowledge and understanding cumulatively. You write in precise, professional UK English and produce planning that reflects genuine subject expertise."),
    messages: [{ role: "user", content: userPrompt }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
    cancel() {
      anthropicStream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
