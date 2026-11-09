import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { buildSystem } from "@/app/lib/systemPrompt";
import { requestLanguage } from "@/app/lib/languages";

export interface TopicOverviewRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  numLessons: number;
  additionalInfo?: string | null;
}


export async function POST(req: NextRequest) {
  const body: TopicOverviewRequest = await req.json();
  const { curriculum, yearGroup, subject, topic, numLessons, additionalInfo } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !topic?.trim() || !numLessons) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const additionalLine = additionalInfo ? `\nAdditional instructions: ${additionalInfo}` : "";

  const userPrompt = `Create a detailed, sequenced topic overview for the following:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Topic: ${topic}
- Number of Lessons: ${numLessons}${additionalLine}

This overview is for a UK school and should reflect curriculum coherence — lessons must build progressively on one another, with knowledge and skills introduced, developed, and consolidated across the sequence. The overview should be practical enough to guide lesson-by-lesson planning.

Output the topic overview using this exact markdown structure:

# ${topic} — Topic Overview

**Curriculum:** ${curriculum} | **Year Group:** ${yearGroup} | **Subject:** ${subject}

---

## Lesson Breakdown

Produce a markdown table with exactly these columns (in this order):

| Lesson | Learning Objective | Starter | Input | Activity | Plenary | Resources | Questions | Key Vocabulary |

Rules for each column:
- **Lesson**: "Lesson 1: [Title]", "Lesson 2: [Title]", etc. Titles must be specific and descriptive (e.g. "Lesson 1: Introducing the Water Cycle"), not generic (e.g. "Lesson 1: Introduction").
- **Learning Objective**: One specific, measurable sentence beginning with "Students will be able to…" — use an active verb (e.g. identify, explain, analyse, evaluate). Objectives must progress across the sequence.
- **Starter**: A brief, purposeful activity (2–3 sentences) to activate relevant prior knowledge or retrieval practice. Should connect explicitly to prior learning or the lesson's objective.
- **Input**: The core direct teaching for the lesson — what the teacher explains, models, or demonstrates (2–3 sentences). Be specific about the content taught, not just the method.
- **Activity**: The main student task(s) designed to practise or apply the lesson's learning objective (2–3 sentences). Should be varied across the sequence (e.g. mix paired tasks, written tasks, practical work).
- **Plenary**: A consolidation or formative assessment activity to close the lesson (1–2 sentences). Should check success criteria, not merely summarise.
- **Resources**: Comma-separated list of 2–4 specific materials, tools, or digital resources needed.
- **Questions**: 2–3 precise probing questions to deepen understanding, separated by " / ". Questions should range from retrieval to higher-order thinking.
- **Key Vocabulary**: 3–5 specific subject vocabulary terms students must know for this lesson, comma-separated.

Generate exactly ${numLessons} rows — one per lesson. Ensure the sequence tells a coherent curriculum story from introduction through to consolidation.

---

## Assessment Opportunities

Describe 3 concrete assessment opportunities across the topic as a bullet list. For each, note: the type of assessment (formative/summative), when in the sequence it occurs, and what it is designed to reveal about student understanding.

Write in a clear, professional tone suitable for ${yearGroup} in a UK school context. Do not use any emojis. When labelling items use plain text letters: (a), (b), (c) — never use the © symbol.`;

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "topic-overview",
    ...(await modelFor("topic-overview", "gpt-4o")),
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK teacher and curriculum designer with deep knowledge of the National Curriculum and subject-specific pedagogy across primary and secondary phases. You specialise in creating coherent, well-sequenced topic overviews that reflect curriculum intent — where each lesson builds deliberately on the last. Your output must include a properly formatted markdown table with columns: Lesson, Learning Objective, Starter, Input, Activity, Plenary, Resources, Questions, Key Vocabulary. Write clearly and at an appropriate level for the year group specified, using professional UK English. Never use the © symbol — always write labels as plain text: (a), (b), (c), (d).") },
      { role: "user", content: userPrompt },
    ],
  });
}
