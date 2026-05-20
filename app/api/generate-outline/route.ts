import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";

interface GenerateOutlineRequest {
  topic: string;
  subject?: string;
  yearGroup?: string;
}

export async function POST(req: NextRequest) {
  const body: GenerateOutlineRequest = await req.json();
  const { topic, subject, yearGroup } = body;

  if (!topic?.trim()) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  const context = [
    subject && `Subject: ${subject}`,
    yearGroup && `Year Group: ${yearGroup}`,
  ].filter(Boolean).join(" | ");

  const userPrompt = `Generate a concise lesson outline for the following:

Topic: ${topic}${context ? `\n${context}` : ""}

Write 5–7 bullet points covering the key content areas, concepts, or learning points a lesson on this topic should address. Each bullet point should be one clear sentence. Make them specific and substantive — not generic.

Output only the bullet points, each on its own line starting with "- ". No introduction, no header, no trailing text.`;

  const client = getOpenAI();
  const encoder = new TextEncoder();

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 512,
    messages: [
      {
        role: "system",
        content: buildSystem(
          "You are an expert UK curriculum designer. You write precise, substantive lesson outlines for any topic and year group. Your bullet points are specific, content-rich, and immediately useful to a teacher."
        ),
      },
      { role: "user", content: userPrompt },
    ],
    stream: true,
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
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
      stream.controller.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
