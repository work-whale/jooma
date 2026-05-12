import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface ModelAnswerRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  question: string;
  contentRequirements?: string;
  guidelines?: string;
  totalMarks: number;
}


export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body: ModelAnswerRequest = await req.json();
  const { curriculum, yearGroup, subject, question, contentRequirements, guidelines, totalMarks } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !question?.trim() || typeof totalMarks !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const contentBlock = contentRequirements?.trim()
    ? `\n\nContent requirements / exam spec guidance:\n${contentRequirements.trim()}`
    : "";

  const guidelinesBlock = guidelines?.trim()
    ? `\n\nAdditional guidelines:\n${guidelines.trim()}`
    : "";

  const userPrompt = `Generate a comprehensive model answer resource for the following exam-style question:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Total marks: ${totalMarks}
- Exam question: ${question.trim()}${contentBlock}${guidelinesBlock}

This resource is for use in a UK school. The model answer must be genuinely of the standard expected to achieve full marks under the relevant UK examination or assessment framework. The teacher notes must be detailed, specific, and practically useful for classroom instruction.

Format the output exactly as follows (use markdown):

# Model Answer Resource

## Exam Question

${question.trim()} [${totalMarks} marks]

## Model Answer

Write a full, exam-worthy model answer pitched at the level of a high-achieving ${yearGroup} pupil studying ${subject} under the ${curriculum}. Requirements:
- Written entirely in continuous prose paragraphs — absolutely no bullet points, numbered lists, or sub-headings within the answer itself
- Structured with a clear introduction that directly addresses the question, fully developed body paragraphs that present evidence and analysis, and a conclusion that delivers a substantiated judgement or summary
- Length and depth must reflect the mark allocation: for ${totalMarks} marks, the response should be proportionally developed — a 2-mark question requires a concise, precise answer; a 12-mark question requires an extended, multi-paragraph response
- Subject-accurate and precise — include specific examples, terminology, data, or textual evidence as appropriate for ${subject}
- Written in the appropriate register for the question type (analytical, argumentative, descriptive, technical, etc.)
- Demonstrating the higher-order skills the mark scheme rewards at this level, not merely basic recall

## Annotated Teacher Notes

**Key Assessment Criteria** (what the mark scheme rewards for this type of question):

- [Specific criterion 1 — e.g. "Accurate knowledge of [concept/event/text]"]
- [Specific criterion 2 — e.g. "Use of subject-specific terminology correctly applied"]
- [Specific criterion 3]
- [Specific criterion 4]

**Content Coverage** (what specific subject knowledge is demonstrated in the model answer):

- [Specific content point 1 — name the exact concept, event, figure, or idea]
- [Specific content point 2]
- [Specific content point 3]
- [Specific content point 4]

**Skills Demonstrated** (the higher-order skills evidenced in the answer):

- [Skill 1 — e.g. "Evaluation of conflicting interpretations", "Selection and application of evidence", "Sustained analytical argument"]
- [Skill 2]
- [Skill 3]

**Examination Technique Features** (features of the answer that demonstrate strong exam craft):

- [Feature 1 — e.g. "Opening sentence directly addresses the question without preamble"]
- [Feature 2 — e.g. "Each body paragraph follows a clear PEEL/PEEEL structure"]
- [Feature 3 — e.g. "Conclusion offers a qualified, reasoned judgement rather than a simple restatement"]

**What Would Distinguish a Full-Mark Answer from a Near-Miss**:

- [Specific distinction 1 — e.g. "A near-miss might identify causes but fail to explain their relative significance"]
- [Specific distinction 2]

**Common Errors and Misconceptions to Address**:

- [Common error 1 — describe the typical mistake and how to correct it]
- [Common error 2]
- [Common error 3]

## Classroom Teaching Opportunities

- **Whole-class use**: [Specific suggestion for how to use this model answer in a lesson — e.g. live annotation on the board, comparison with a weaker answer, mark-scheme mapping]
- **Common misconception to address**: [One specific misconception that the model answer exposes and how to tackle it with pupils]
- **Peer/self-assessment task**: [A structured peer- or self-assessment activity using this model answer]
- **Differentiation — support**: [How to use this resource with less confident pupils — e.g. gapped version, sentence starters derived from the model]
- **Differentiation — extension**: [A challenge task for high-attaining pupils — e.g. write a counter-argument, find a weakness in the model answer's reasoning, respond to a harder variant of the question]

Do not use any emojis. Do not add any text before the main title or after the last teaching opportunity.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK examiner, subject specialist, and classroom teacher with extensive experience across GCSE, A-level, and primary/secondary assessment frameworks. You have a precise understanding of what examiners reward at each level and how mark schemes are structured. You write model answers that are genuinely exam-worthy — accurate, well-structured, and pitched at the level of a high-achieving pupil — and teacher notes that are specific, evidence-informed, and immediately useful in a UK classroom. You write in professional UK English.") },
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
