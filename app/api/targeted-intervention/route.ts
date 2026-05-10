import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface TargetedInterventionRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  attitudinalData: string;
  aptitudinalData?: string;
  attainmentData?: string;
  otherData?: string;
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body: TargetedInterventionRequest = await req.json();

  const { curriculum, yearGroup, subject, attitudinalData, aptitudinalData, attainmentData, otherData } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !attitudinalData?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const aptitudinalSection = aptitudinalData?.trim()
    ? `\n- Aptitudinal data: ${aptitudinalData.trim()}`
    : "";

  const attainmentSection = attainmentData?.trim()
    ? `\n- Attainment data: ${attainmentData.trim()}`
    : "";

  const otherSection = otherData?.trim()
    ? `\n- Other relevant data: ${otherData.trim()}`
    : "";

  const userPrompt = `You are an expert educational practitioner and intervention specialist. Generate a set of targeted, practical intervention strategies for the following student profile:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Attitudinal data: ${attitudinalData}${aptitudinalSection}${attainmentSection}${otherSection}

Analyse the full student profile carefully. Identify the key strengths, gaps, and tensions in the data — then generate between 8 and 10 specific, personalised intervention strategies to close those gaps.

For each strategy:
- Draw directly on the specific data provided (reference scores, comments, or observations where relevant)
- Ensure the strategy is realistic and practical for a classroom teacher or SENCO to implement
- Include 2–3 concrete activities that put the strategy into practice

Format the output using markdown as follows:

# Intervention Strategies

For each strategy, use this exact structure:

## [Number]. [Strategy Name]

**Strategy Summary:**
[2–3 sentences describing exactly what the teacher or school should do. Be specific and actionable.]

**How to implement:**
- [Concrete classroom activity or task — specific enough to use in a lesson or session]
- [Second activity]
- [Third activity]

[Create a worksheet for this strategy →](/tools/worksheet-generator)

---

Do not include a preamble, introduction, or closing summary. Do not include any research citations or references. Start immediately with "# Intervention Strategies" and the first numbered strategy.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: buildSystem(
          `You are an expert educational practitioner, intervention specialist, and SENCO advisor with deep knowledge of UK schools. You produce targeted, evidence-based intervention strategies grounded in educational research (Hattie, EEF, Rosenshine, etc.). Your strategies are specific, actionable, and directly tied to the student data provided. You write in clear, professional UK English for a teacher audience.`
        ),
      },
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
