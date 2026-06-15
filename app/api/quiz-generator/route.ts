import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";
import { recordUsage } from "@/app/lib/usage";

export interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number; // 0–3
}

interface GenerateBody {
  action: "generate";
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  numQuestions: number;
  timeLimit: number;
  answerType: string;
}

interface AddBody {
  action: "add";
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  answerType: string;
  existingQuestions: QuizQuestion[];
}

interface RefineBody {
  action: "refine";
  existingQuestions: QuizQuestion[];
  instruction: string;
}

type RequestBody = GenerateBody | AddBody | RefineBody;


function buildGeneratePrompt(body: GenerateBody): string {
  return `Generate a multiple choice quiz with exactly ${body.numQuestions} questions about "${body.topic}" for ${body.yearGroup} pupils following the ${body.curriculum} in ${body.subject}.

Each question must have exactly 4 answer options and exactly 1 correct answer.

Return ONLY a raw JSON object — no markdown, no code fences, no explanation. The JSON must follow this exact structure:
{"questions":[{"question":"Question text here?","options":["Option A","Option B","Option C","Option D"],"correctIndex":2}]}

Rules for question quality:
- correctIndex is 0–3 (the index of the correct answer in the options array)
- Vary the position of the correct answer across questions — distribute it across all four positions
- Questions must be factually accurate, unambiguous, and pitched correctly for ${body.yearGroup} pupils studying ${body.subject} on the ${body.curriculum}
- Each question must test a distinct aspect of the topic — do not repeat the same concept
- Include a range of question types: recall of key facts, application of knowledge, interpretation of a scenario or example, and vocabulary/terminology
- Distractors (wrong answers) must be plausible and based on common misconceptions or errors — not obviously wrong
- All answer options must be grammatically consistent with the question stem
- Questions must be written in clear, age-appropriate UK English
- Avoid trick questions or questions that depend on ambiguous phrasing
- No duplicate questions
- Do not include any text outside the JSON object`;
}

function buildAddPrompt(body: AddBody): string {
  const existing = body.existingQuestions
    .map((q, i) => `${i + 1}. ${q.question}`)
    .join("\n");
  return `You are adding one new question to an existing quiz about ${body.subject} for ${body.yearGroup} pupils following the ${body.curriculum}.

Existing questions (do not duplicate, closely mirror, or test the same concept as any of these):
${existing}

Generate exactly 1 new multiple choice question that covers a genuinely different aspect of the topic not already tested. The question must:
- Be factually accurate and precisely pitched for ${body.yearGroup} pupils
- Have exactly 4 answer options with exactly 1 correct answer
- Use plausible distractors based on common misconceptions — not obviously wrong alternatives
- Be written in clear, unambiguous UK English

Return ONLY a raw JSON object:
{"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0}]}

Rules:
- correctIndex is 0–3
- 4 options exactly
- No text outside the JSON object`;
}

function buildRefinePrompt(body: RefineBody): string {
  return `Modify the following quiz questions according to this instruction: "${body.instruction}"

Apply the instruction precisely and consistently across all questions where it is relevant. Do not make changes beyond what the instruction specifies. Maintain factual accuracy and ensure all questions remain appropriate for the original year group and subject.

Current questions:
${JSON.stringify(body.existingQuestions, null, 2)}

Return the same number of questions unless the instruction explicitly says to add or remove questions.

Return ONLY a raw JSON object:
{"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0},...]}

No text outside the JSON object.`;
}

function parseQuestions(text: string): QuizQuestion[] {
  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed.questions)) throw new Error("Invalid response structure");
  return parsed.questions.map((q: Partial<QuizQuestion>) => {
    if (
      typeof q.question !== "string" ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      typeof q.correctIndex !== "number"
    ) {
      throw new Error("Malformed question in response");
    }
    return {
      question: q.question,
      options: q.options as [string, string, string, string],
      correctIndex: Math.max(0, Math.min(3, q.correctIndex)),
    };
  });
}

export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body: RequestBody = await req.json();

  if (!body.action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  let prompt: string;

  if (body.action === "generate") {
    if (!body.curriculum || !body.yearGroup || !body.subject?.trim() || !body.topic?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    prompt = buildGeneratePrompt(body);
  } else if (body.action === "add") {
    if (!body.curriculum || !body.yearGroup || !body.subject?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    prompt = buildAddPrompt(body);
  } else if (body.action === "refine") {
    if (!body.instruction?.trim() || !body.existingQuestions?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    prompt = buildRefinePrompt(body);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const message = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        { role: "system", content: buildSystem("You are an expert UK teacher and assessment specialist creating multiple choice quizzes for school pupils across all year groups and subjects. You have a thorough understanding of what constitutes a well-designed multiple choice question: a clear, unambiguous stem; exactly one unambiguously correct answer; plausible distractors based on common misconceptions; and options that are grammatically parallel. You always return valid JSON exactly as requested, with no additional text, markdown, or code fences. Your questions are subject-accurate, age-appropriate, and test genuine curriculum knowledge rather than trivial recall.") },
        { role: "user", content: prompt },
      ],
      stream: false,
    });
    await recordUsage("quiz-generator", "gpt-4o", message.usage);

    const text = message.choices[0]?.message?.content ?? "";
    if (!text) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    const questions = parseQuestions(text);
    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate quiz";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
