import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface GenerateRequest {
  curriculum: string;
  yearGroup: string;
  textSource: "generate" | "own";
  topic?: string;
  ownText?: string;
  passageWordCount?: number;
  contentDomains: string[];
  questionTypes?: string[];
  numQuestions: number;
  complexity?: "Simple" | "Standard" | "Challenging";
  includeAnswerKey?: boolean;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const body: GenerateRequest = await req.json();

  const {
    curriculum,
    yearGroup,
    textSource,
    topic,
    ownText,
    passageWordCount = 300,
    contentDomains,
    questionTypes = [],
    numQuestions,
    complexity = "Standard",
    includeAnswerKey = true,
  } = body;

  if (!curriculum || !yearGroup || !textSource || contentDomains.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (textSource === "generate" && !topic?.trim()) {
    return NextResponse.json({ error: "Topic is required when generating text" }, { status: 400 });
  }

  if (textSource === "own" && !ownText?.trim()) {
    return NextResponse.json({ error: "Text is required when using own text" }, { status: 400 });
  }

  const domainList = contentDomains.join(", ");

  const questionTypeInstruction = questionTypes.length > 0
    ? `\nAcross questions, use a mix of these question formats: ${questionTypes.join(", ")}.`
    : "";

  const answerKeyInstruction = includeAnswerKey
    ? "\nAfter the questions, include a clearly labelled Answer Key section with model answers for each question."
    : "";

  const complexityInstruction =
    complexity === "Challenging"
      ? "Include at least one question per domain that requires extended written response or comparative analysis."
      : complexity === "Simple"
      ? "Keep questions direct and ensure answers can be found explicitly in the text or require simple inference."
      : "Balance retrieval and inference questions with one higher-order thinking question per domain.";

  const userPrompt =
    textSource === "generate"
      ? `Generate a complete reading comprehension activity on the topic: "${topic}" for ${yearGroup} students following the ${curriculum}.

Part 1 — Reading Passage

Write an original, engaging non-fiction or fiction passage of approximately ${passageWordCount} words. The passage must:
- Be written at a complexity level appropriate for ${complexity} readers in ${yearGroup}
- Use varied sentence structures and a rich but accessible vocabulary suited to the year group
- Contain sufficient content depth to support ${numQuestions} question(s) per content domain
- Be clearly titled with a heading above the passage
- Avoid bullet points or lists — the passage must be written in continuous prose paragraphs
- Be accurate and well-researched if non-fiction; show craft and characterisation if fiction

Part 2 — Comprehension Questions

Below the passage, write ${numQuestions} comprehension question(s) for each of the following content domains: ${domainList}.

Formatting and quality rules:
- Use a bold ## heading for each content domain group (e.g. ## 2b – Retrieval)
- Number questions sequentially within each group (1., 2., etc.)
- Questions must be clearly rooted in the passage — do not ask questions that cannot be answered from the text
- For inference and evaluation questions, phrase them to require evidence from the text (e.g. "Using evidence from the text, explain...")
- Allocate marks to each question in brackets, e.g. [2 marks] — align mark allocations with the complexity of the response required
- ${complexityInstruction}${questionTypeInstruction}

${answerKeyInstruction}`
      : `Using the passage below, create a reading comprehension activity for ${yearGroup} students following the ${curriculum}.

The questions should be at ${complexity.toLowerCase()} complexity level.

Write ${numQuestions} comprehension question(s) for each of the following content domains: ${domainList}.

Formatting and quality rules:
- Use a bold ## heading for each content domain group (e.g. ## 2b – Retrieval)
- Number questions sequentially within each group (1., 2., etc.)
- Questions must be clearly rooted in the passage — every question must be answerable from the text provided
- For inference and evaluation questions, phrase them to require evidence from the text (e.g. "Using evidence from the text, explain...")
- Allocate marks to each question in brackets, e.g. [2 marks] — align mark allocations with the complexity of the response required
- ${complexityInstruction}${questionTypeInstruction}

${answerKeyInstruction}

PASSAGE:
${ownText}`;

  const encoder = new TextEncoder();
  const anthropicStream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: buildSystem("You are an expert UK English teacher and literacy specialist with in-depth knowledge of the National Curriculum for English and KS1–KS4 reading assessment frameworks. You create high-quality, age-appropriate reading comprehension activities that develop the full range of reading skills — from retrieval and inference through to evaluation and critical response. Your passages are well-crafted, purposeful, and rich enough to sustain genuine comprehension work. Your questions are precise, unambiguous, and matched to the content domain they are assessing. Write in professional UK English."),
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
