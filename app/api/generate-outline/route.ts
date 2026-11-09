import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { buildSystem } from "@/app/lib/systemPrompt";
import { requestLanguage } from "@/app/lib/languages";

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

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "generate-outline",
    ...(await modelFor("generate-outline", "gpt-4o")),
    max_completion_tokens: 512,
    messages: [
      {
        role: "system",
        content: buildSystem(
          "You are an expert UK curriculum designer. You write precise, substantive lesson outlines for any topic and year group. Your bullet points are specific, content-rich, and immediately useful to a teacher."
        ),
      },
      { role: "user", content: userPrompt },
    ],
  });
}
