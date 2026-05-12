import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface WorksheetRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  learningObjective: string;
  questionTypes?: string[];
  questionCount?: number;
  abilityLevel?: string;
  outputDetail?: "condensed" | "standard" | "detailed";
  additionalInfo?: string | null;
}


export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body: WorksheetRequest = await req.json();

  const {
    curriculum,
    yearGroup,
    subject,
    learningObjective,
    questionTypes = [],
    questionCount = 10,
    abilityLevel = "EXS",
    outputDetail = "detailed",
    additionalInfo,
  } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !learningObjective?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const detailPreamble =
    outputDetail === "condensed"
      ? "Produce a concise worksheet. Keep questions brief and mark schemes compact.\n\n"
      : outputDetail === "standard"
      ? "Produce a well-structured worksheet with clear questions and guidance. Balance brevity with clarity.\n\n"
      : "";

  const typesLine = questionTypes.length
    ? `Use only these question types across the worksheet: ${questionTypes.join(", ")}.`
    : "";

  const abilityLine =
    abilityLevel === "WTS"
      ? "Pitch the questions for Working Towards Standard (WTS) students — use accessible language, provide sentence starters or scaffolding where helpful, and avoid unnecessary complexity."
      : abilityLevel === "GDS"
      ? "Pitch the questions for Greater Depth Standard (GDS) students — include higher-order thinking, open-ended challenge, and questions that require justification or extension beyond the objective."
      : "Pitch the questions at the Expected Standard (EXS) — appropriate challenge for most students in this year group.";

  const additionalLine = additionalInfo ? `\nAdditional instructions: ${additionalInfo}` : "";

  const sectionA = Math.round(questionCount * 0.35);
  const sectionB = Math.round(questionCount * 0.3);
  const sectionC = Math.round(questionCount * 0.2);
  const sectionD = questionCount - sectionA - sectionB - sectionC;

  const userPrompt = `${detailPreamble}Create a high-quality, classroom-ready worksheet for the following:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Learning Objective: ${learningObjective}
- Total questions: approximately ${questionCount}
- ${abilityLine}
- ${typesLine}${additionalLine}

This worksheet is for use in a UK school. Questions must build progressively from knowledge recall through to higher-order thinking, in line with Bloom's Taxonomy. Number all questions sequentially within each section. When labelling sub-questions use plain text: (a), (b), (c) — never use the © symbol.

Structure the worksheet using markdown as follows:

# [Worksheet Title — specific to the topic, not generic]

**Curriculum:** ${curriculum} | **Year Group:** ${yearGroup} | **Subject:** ${subject}

**Learning Objective:** [Restate in student-facing language beginning with "I am learning to..."]

**Name:** ______________________________ **Date:** ______________ **Class:** ______________

---

## Section A – Knowledge Recall [1 mark each]

Write approximately ${sectionA} questions testing recall of key facts, definitions, or processes. Questions should have a single correct answer. Show answer blanks as: ___________________________________

---

## Section B – Understanding [2 marks each]

Write approximately ${sectionB} questions requiring students to explain concepts, identify relationships, or interpret information. Include mark allocations in brackets, e.g. [2 marks].

---

## Section C – Application [3–4 marks each]

Write approximately ${sectionC} questions where students apply knowledge to a new scenario or context. Include a brief stimulus where appropriate. Include mark allocations.

---

## Section D – Analysis and Evaluation [6–8 marks]

Write approximately ${sectionD} higher-order questions requiring extended responses — analysis, evaluation, justification, or argument. State mark allocation and include a note on what a strong response will include.

---

## Common Misconceptions

Provide 4–6 bullet points identifying the most common misconceptions students have about this topic. For each, briefly explain why the misconception occurs and how it can be addressed.

---

## Answer Key

Provide a comprehensive answer key for all sections:
- Section A: exact model answers
- Section B: mark scheme noting what earns each mark
- Section C: full model answers with annotations
- Section D: level descriptor or bullet-pointed mark scheme for full, partial, and no marks

Write in clear, professional language appropriate for ${yearGroup}. Do not use any emojis.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK teacher and curriculum designer with extensive experience creating high-quality classroom worksheets for KS1 through KS5. You understand Bloom's Taxonomy, tiered questioning, and how to scaffold access without reducing challenge. Your worksheets are precisely pitched for the specified year group, subject-accurate, and built around a clear learning objective. You write in professional UK English and produce materials that could be used in any well-run UK school without amendment. Never use the © symbol — always write sub-question labels as plain text: (a), (b), (c), (d).") },
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
