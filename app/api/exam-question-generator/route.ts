import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface ExamQuestionGeneratorRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  examType: string;
  topic: string;
  content?: string | null;
  numQuestions: number;
  minMarks: number;
  maxMarks: number;
  includeMarkScheme: boolean;
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body: ExamQuestionGeneratorRequest = await req.json();

  const {
    curriculum,
    yearGroup,
    subject,
    examType,
    topic,
    content,
    numQuestions,
    minMarks,
    maxMarks,
    includeMarkScheme,
  } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !topic?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const contentSection = content?.trim()
    ? `\n- Knowledge, skills and content to cover: ${content}`
    : "";

  const markSchemeInstruction = includeMarkScheme
    ? `\n\nAfter the final question, add a clearly labelled ## Mark Scheme section. For each question provide: the question number, acceptable answers or mark points, mark allocation guidance (e.g. 1 mark per valid point up to the total), and any specific marking notes. Mark scheme content should be indicative and reflective of the standard expected for ${examType} level.`
    : "";

  const userPrompt = `Generate a complete examination paper with the following specifications:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Examination Type: ${examType}
- Topic: ${topic}
- Number of Questions: ${numQuestions}
- Mark range per question: ${minMarks}–${maxMarks} marks${contentSection}

Structure the output exactly as follows:

# ${subject} Examination Package: ${topic}

## Examination Paper

**Student Information**

Name: ___________________________
Date: ___________________________
Year Group: ${yearGroup}

**Instructions**

- Answer all questions in the spaces provided
- The total mark for this assessment is [calculate and insert the exact total]
- The marks for each question are shown in brackets

Then write each question using this exact format:

## Question [N] ([x] marks)

[Question text]

---

Rules:
- Write exactly ${numQuestions} questions
- Distribute marks across ${minMarks}–${maxMarks}, starting with ${minMarks}-mark questions and increasing in demand towards the end — the final questions should carry ${maxMarks} marks
- Questions must escalate in cognitive demand: begin with knowledge and recall, progress through understanding and application, and end with analysis, evaluation, or extended response
- All questions must relate specifically to the topic "${topic}" and be appropriate for ${examType} level
- Questions with higher marks should require extended written responses with evidence, argument, or analysis
- Do not include answer lines or writing space indicators
- Calculate the total marks precisely and include it in the instructions${markSchemeInstruction}

Do not add any text before the title or after the last section. Write in a professional UK examination style.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem(`You are an expert UK examiner and assessment specialist with extensive experience writing examination papers across all subjects, key stages, and examination types including GCSE, A-level, Functional Skills, and internal assessments. You write questions with precision and clarity, ensure mark allocations reflect the cognitive demand of each question, and produce mark schemes that are both fair and detailed. Your examination papers reflect the style, rigour, and language conventions of the specified examination type. You write in professional UK English.`) },
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
