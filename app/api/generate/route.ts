import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";

export interface GenerateRequest {
  curriculum: string;
  yearGroup: string;
  textSource: "generate" | "own";
  topic?: string;
  ownText?: string;
  readingFocuses: string[];
  numQuestions: number;
  complexity?: "Simple" | "Standard" | "Challenging";
  includeAnswerKey?: boolean;
}


export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body: GenerateRequest = await req.json();

  const { curriculum, yearGroup, textSource, topic, ownText, readingFocuses, numQuestions, complexity = "Standard", includeAnswerKey = true } = body;

  if (!curriculum || !yearGroup || !textSource || readingFocuses.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (textSource === "generate" && !topic?.trim()) {
    return NextResponse.json({ error: "Topic is required when generating text" }, { status: 400 });
  }

  if (textSource === "own" && !ownText?.trim()) {
    return NextResponse.json({ error: "Text is required when using own text" }, { status: 400 });
  }

  const focusList = readingFocuses.join(", ");

  const answerKeyInstruction = includeAnswerKey
    ? "\nAfter the questions, include a clearly labelled Answer Key section with model answers for each question."
    : "";

  const userPrompt =
    textSource === "generate"
      ? `Generate a reading comprehension activity on the topic: "${topic}".
First write an engaging passage (around 250–400 words) appropriate for ${yearGroup} students following the ${curriculum}. The complexity level should be ${complexity}.
Then write ${numQuestions} comprehension question(s) for each of the following reading focuses: ${focusList}.
Group the questions clearly by reading focus with a heading for each group.${answerKeyInstruction}`
      : `Using the passage below, write ${numQuestions} comprehension question(s) for each of the following reading focuses: ${focusList}.
The questions should be ${complexity.toLowerCase()} level and appropriate for ${yearGroup} students following the ${curriculum}.
Group the questions clearly by reading focus with a heading for each group.${answerKeyInstruction}

PASSAGE:
${ownText}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: "You are an expert teacher and curriculum designer. You create high-quality, age-appropriate reading comprehension activities. Write clearly and engagingly. Do not use any emojis anywhere in your output." },
      { role: "user", content: userPrompt },
    ],
    stream: false,
  });
  const output = response.choices[0].message.content ?? "";

  return NextResponse.json({ output });
}
