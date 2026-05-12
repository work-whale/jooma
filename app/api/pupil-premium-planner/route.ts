import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";


export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body = await req.json();
  const { challenges, educationPhase } = body;

  if (!challenges?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const prompt = `You are an expert school improvement adviser helping a UK school plan their Pupil Premium strategy. Generate evidence-based strategies for the challenges provided, using the DfE Pupil Premium guidance framework of Tier 1, Tier 2, and Tier 3 approaches.

INPUTS:
- Challenges: ${challenges}
- Education phase: ${educationPhase || "Not specified"}

Generate a Pupil Premium Strategy Plan using the structure below. Use proper markdown formatting. No preamble, no explanation after the content.

# Pupil Premium Strategy Plan

For each challenge provided, output a section using this exact structure:

---

## [Challenge name — concise, 5 words or fewer]

### Tier 1: High-quality teaching

- **Approach:** [One specific, named strategy — e.g. "Explicit vocabulary instruction using Frayer models"]
- **Implementation:** [Two or three concrete steps to put this in place]
- **Impact:** [One sentence — expected measurable outcome for disadvantaged pupils]
- **Monitoring:** [One sentence — specific data source and review frequency]

### Tier 2: Targeted academic support

- **Approach:** [One specific, named intervention — e.g. "Small group tuition using a structured phonics programme"]
- **Implementation:** [Two or three concrete steps to put this in place]
- **Impact:** [One sentence — expected measurable outcome]
- **Monitoring:** [One sentence — specific data source and review frequency]

### Tier 3: Wider strategies

- **Approach:** [One specific strategy addressing a non-academic barrier — e.g. "Attendance mentoring with a key worker"]
- **Implementation:** [Two or three concrete steps to put this in place]
- **Impact:** [One sentence — expected measurable outcome]
- **Monitoring:** [One sentence — specific data source and review frequency]

Tier definitions:
- Tier 1: Whole-class teaching approaches that benefit all pupils, with particular benefit to disadvantaged pupils.
- Tier 2: Structured small-group or one-to-one academic interventions.
- Tier 3: Approaches that address non-academic barriers such as attendance, mental health, or family engagement.

Keep each bullet point to one or two short sentences. Be specific and avoid generic advice. Reference EEF evidence where relevant. Use UK English throughout. Be specific to the education phase: ${educationPhase || "the school phase"}.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK school improvement adviser and Pupil Premium specialist with deep knowledge of the EEF Teaching and Learning Toolkit, DfE Pupil Premium guidance, and evidence-based approaches to closing the disadvantage gap. You help school leaders write rigorous, evidence-informed Pupil Premium strategy plans that meet DfE requirements and genuinely improve outcomes for disadvantaged pupils.") },
      { role: "user", content: prompt },
    ],
    stream: true,
  });

  const readableStream = new ReadableStream({
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

  return new NextResponse(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
