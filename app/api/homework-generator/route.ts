import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { buildSystem } from "@/app/lib/systemPrompt";
import {
  bandPitch,
  bandUsageStep,
  differentiationPrompt,
  differentiationSummary,
  isBand,
  type Differentiate,
} from "@/app/lib/differentiation";

export interface HomeworkRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  learningObjective: string;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
  /** One band's version of a differentiated set (app/lib/bands.ts). */
  band?: string;
  bandIndex?: number;
  questionTypes?: string[];
  questionCounts?: Record<string, number>;
  homeworkType: string;
  length: string;
  includeAnswers: boolean;
  additionalInstructions?: string;
  lessonContent?: string;
  imageBase64?: string;
  imageMediaType?: string;
}


export async function POST(req: NextRequest) {
  const body: HomeworkRequest = await req.json();

  const {
    curriculum,
    yearGroup,
    subject,
    learningObjective,
    differentiate = "no",
    differentiationLevels = [],
    questionTypes,
    questionCounts,
    homeworkType,
    length,
    includeAnswers,
    additionalInstructions,
    lessonContent,
    imageBase64,
    imageMediaType,
  } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !learningObjective?.trim() || !homeworkType || !length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const lessonContentSection = lessonContent?.trim()
    ? `\n\nThe teacher has provided the following lesson material to base the homework on:\n\n${lessonContent.trim()}`
    : "";

  const imageSection = imageBase64
    ? `\n\nAn image has been provided by the teacher. Use it as visual context — reference it in the homework task where appropriate (e.g. "Look at the image and...").`
    : "";

  const questionTypesSection = questionTypes?.length
    ? `\n- Question Types to use: ${questionTypes.map((t) => {
        const count = questionCounts?.[t];
        return count ? `${t} (${count})` : t;
      }).join(", ")}`
    : "";

  const additionalSection = additionalInstructions?.trim()
    ? `\n\nAdditional instructions from the teacher: ${additionalInstructions.trim()}`
    : "";

  const answerSection = includeAnswers
    ? "Include a full answer sheet / mark scheme at the end, clearly separated from the pupil-facing content."
    : "Do NOT include answers — this is a student-only version.";

  // Opt-in. When off, the task carries no Support/Core/Challenge split and no
  // differentiation line in the brief — the homework is simply pitched at the
  // year group. One band's version is pitched at that band throughout instead,
  // with no split: the other bands are their own documents.
  const band = isBand(body.band) ? body.band : null;
  const adaptation = band ? "" : differentiationPrompt(differentiate, differentiationLevels);
  const summary = band ? "" : differentiationSummary(differentiate, differentiationLevels);
  const differentiationBrief = summary ? `\n- Differentiation: ${summary}` : "";
  const taskDifferentiation = band ? ` ${bandPitch(band)}` : adaptation ? ` ${adaptation}` : "";

  const userPrompt = `Create a high-quality, classroom-ready homework task for the following:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Learning Objective: ${learningObjective}${differentiationBrief}
- Homework Type: ${homeworkType}
- Length / Effort Level: ${length}
- Include Answers: ${includeAnswers ? "Yes" : "No"}${questionTypesSection}${lessonContentSection}${imageSection}${additionalSection}

This homework is for use in a UK school. It must be precisely pitched for ${yearGroup} students and directly address the learning objective. The task should be sized to match the effort level (${length}).

Structure the homework using markdown as follows:

# [Homework Title — specific to the topic, not generic]

**Subject:** ${subject} | **Year Group:** ${yearGroup} | **Homework Type:** ${homeworkType}

**Learning Objective:** [Restate in clear, student-facing language: "By the end of this task, you should be able to..."]

**Time:** ${length}

**Name:** ______________________________ **Date:** ______________ **Class:** ______________

---

## Instructions

Write 2–3 clear, concise sentences explaining what the student should do. Keep the language appropriate for ${yearGroup}.

---

## Key Vocabulary / Reminder

List 4–6 key terms or concepts the student should know to complete this task. Present as a brief glossary or reminder box. Format as:
- **Term**: definition or reminder

---

## Task

Generate the main homework task appropriate for the homework type (${homeworkType})${questionTypes?.length ? ` using these question types: ${questionTypes.map((t) => { const c = questionCounts?.[t]; return c ? `${t} ×${c}` : t; }).join(", ")}` : ""}.${taskDifferentiation}

Ensure the task is sized to fit ${length} of work. Do not pad with unnecessary filler — every part of the task should be purposeful.

---

${includeAnswers ? `## Answer Sheet / Mark Scheme

Provide complete model answers and/or a mark scheme for all parts of the task. For extended writing tasks, provide a level descriptor or bullet-point criteria for a strong response. Clearly label marks where applicable.

---` : ""}

## Self-Assessment Checklist

Provide 3–5 bullet points the student can tick off when they have completed the task well. These should relate directly to the learning objective and the task.

- [ ] ...
- [ ] ...
- [ ] ...

${answerSection}`;

  type OpenAIUserContent = Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

  const userMessageContent: string | OpenAIUserContent = imageBase64 && imageMediaType
    ? [
        { type: "image_url", image_url: { url: `data:${imageMediaType};base64,${imageBase64}` } },
        { type: "text", text: userPrompt },
      ]
    : userPrompt;

  return streamChat({
    toolSlug: "homework-generator",
    step: bandUsageStep(body.band, body.bandIndex),
    ...(await modelFor("homework-generator", "gpt-4o")),
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: buildSystem(
          `You are an expert UK teacher and curriculum designer with extensive experience creating high-quality homework tasks for KS1 through KS5. You understand how to pitch work accurately for different year groups, apply Bloom's Taxonomy, and scaffold without reducing challenge. You produce homework that is purposeful, clearly structured, and appropriately differentiated. You write in professional UK English. Never use emojis. When labelling sub-questions use plain text: (a), (b), (c) — never use the © symbol.`
        ),
      },
      { role: "user", content: userMessageContent },
    ],
  });
}
