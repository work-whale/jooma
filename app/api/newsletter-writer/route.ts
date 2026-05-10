import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystem } from "@/app/lib/systemPrompt";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { newsletterTitle, schoolName, tone, sections } = body;

  const filledSections: string[] = (sections as string[]).filter((s: string) => s.trim());

  if (!filledSections.length) {
    return NextResponse.json({ error: "Please add at least one section." }, { status: 400 });
  }

  const titleLine = newsletterTitle?.trim() ? `Newsletter title: ${newsletterTitle.trim()}` : "";
  const schoolLine = schoolName?.trim() ? `School name: ${schoolName.trim()}` : "";
  const toneLine = `Tone: ${tone || "Professional and formal"}`;

  const sectionsText = filledSections
    .map((s, i) => `Section ${i + 1}: ${s.trim()}`)
    .join("\n");

  const prompt = `You are an expert school communications specialist. Write a complete school newsletter based on the inputs below.

INPUTS:
${[titleLine, schoolLine, toneLine].filter(Boolean).join("\n")}

Sections to include:
${sectionsText}

Generate the newsletter using the structure below. No preamble, no explanation after the output.

# Newsletter from ${schoolName?.trim() || "our school"}${newsletterTitle?.trim() ? ` — ${newsletterTitle.trim()}` : ""}

For each section provided, write a clearly headed section with 2–3 paragraphs of flowing, engaging prose. Each paragraph should be 3–5 sentences. Do not use bullet points — write in full paragraphs only.

Section headings should be descriptive and engaging, not just a restatement of the input. Each section should read as a natural part of the newsletter, consistent in tone throughout.

Tone guidance:
- Professional and formal: authoritative, precise, respectful — suitable for governors, inspectors, or formal communications
- Warm and friendly: approachable, conversational, celebratory — suitable for parents and carers
- Inspiring and motivational: uplifting, forward-looking, values-driven — suitable for whole-community communications

Apply the "${tone || "Professional and formal"}" tone consistently across all sections.

Use the school name "${schoolName?.trim() || "our school"}" naturally in the text where appropriate. Use UK English throughout.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      { role: "system", content: buildSystem("You are an expert school communications specialist and newsletter writer with extensive experience producing high-quality, engaging school newsletters for UK primary and secondary schools. You write clearly, warmly, and professionally, adapting tone to the audience — whether parents, staff, or the wider community. Your newsletters are free of clichés, genuinely informative, and reflect the values and culture of the school.") },
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
