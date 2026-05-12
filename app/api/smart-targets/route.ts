import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface SmartTargetsRequest {
  curriculum: string;
  yearGroup: string;
  targets: string;
}


export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body: SmartTargetsRequest = await req.json();

  const { curriculum, yearGroup, targets } = body;

  if (!curriculum || !yearGroup || !targets?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const userPrompt = `Generate a SMART targets table for the following pupil:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Targets (as provided by the teacher or SENCO): ${targets}

This resource is for use in a UK school context and may be shared with the pupil, their parents or carers, and key support staff. SMART targets are a standard tool in SEND and inclusion practice, aligned with the SEND Code of Practice (2015), which emphasises outcomes-focused planning and pupil participation.

Output a markdown table with the heading "## SMART Targets" followed by a table with exactly these 6 columns:

| Target | Specific | Measurable | Achievable | Relevant | Time-bound |

Column guidance:
- **Target**: A short, plain-English summary of the target written in accessible, pupil-facing language. Avoid jargon. If the input target is vague, sharpen it into something precise and meaningful.
- **Specific**: An "I will..." statement that describes exactly what the pupil will do — not a general aspiration but a precise description of the behaviour, skill, or knowledge the pupil is working towards. Include the context (e.g. in lessons, at home, during group work).
- **Measurable**: An "I can show this by..." or "I will know I have achieved this when..." statement with a concrete, observable indicator of success. Avoid vague measures like "improvement" — specify frequency, accuracy, or observable output (e.g. "I can read back a sentence I have written without adult support").
- **Achievable**: Describe the specific support, resources, strategies, or scaffolding that will help the pupil reach the target. This should be realistic and practical — name the type of adult support, the tool, or the adjusted expectation where relevant.
- **Relevant**: 1–2 sentences explaining why this target matters to the pupil's learning, development, or wellbeing — and how it connects to their wider curriculum progress, EHCP outcomes (if applicable), or personal goals.
- **Time-bound**: A specific, realistic timeframe (e.g. "By the end of the half-term on [approximate date]", "Within 4 weeks, reviewed at the next SEND review", "Daily for 3 weeks from the plan start date"). Avoid open-ended deadlines.

Additional rules:
- Write in age-appropriate, accessible language for ${yearGroup} pupils — a pupil should be able to read and understand their own target
- Each cell must be concise and clear — no more than 2–3 sentences per cell
- Do not use emojis
- If multiple targets are provided, each must have its own table row
- Targets must be genuinely SMART — do not produce generic or aspirational statements that lack specificity`;


  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK SENCO and inclusion specialist with extensive experience writing SMART targets within the framework of the SEND Code of Practice (2015) and EHCPs. You understand that genuinely SMART targets must be outcomes-focused, specific enough to act on, and measurable in a practical classroom context. You write targets that are accessible to pupils and useful to teachers — not bureaucratic tick-boxes. You are skilled at taking vague teacher input and converting it into precise, actionable, pupil-facing targets. You write in professional UK English.") },
      { role: "user", content: userPrompt },
    ],
    stream: true,
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
    cancel() {
      openaiStream.controller.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
