import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface LessonPlanRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  learningObjective: string;
  abilityLevel?: string;
  outputDetail?: "condensed" | "standard" | "detailed";
  additionalInfo?: string | null;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const body: LessonPlanRequest = await req.json();

  const {
    curriculum,
    yearGroup,
    subject,
    topic,
    learningObjective,
    abilityLevel = "EXS",
    outputDetail = "detailed",
    additionalInfo,
  } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !topic?.trim() || !learningObjective?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const detailPreamble =
    outputDetail === "condensed"
      ? "Produce a concise lesson plan. Keep each section brief — 2–3 bullet points per subsection. Avoid extended prose and use short, direct language throughout.\n\n"
      : outputDetail === "standard"
      ? "Produce a well-structured lesson plan with enough detail for a colleague to follow. Balance conciseness with clarity — 3–4 points per subsection where appropriate.\n\n"
      : "";

  const additionalSection = additionalInfo
    ? `\nAdditional context or theme to incorporate: ${additionalInfo}`
    : "";

  const adaptationLevel =
    abilityLevel === "WTS"
      ? `**WTS – Working Towards Standard**: 2 specific scaffolding strategies — such as graphic organisers, sentence frames, partially completed examples, or modified task demands — that maintain access to the learning objective without removing cognitive challenge.`
      : abilityLevel === "GDS"
      ? `**GDS – Greater Depth Standard**: 2 specific extension ideas that deepen understanding rather than simply accelerate pace — including suggestions for higher-order thinking, independent enquiry, or links to examination-level challenge.`
      : `**EXS – Expected Standard**: Describe what successful engagement looks like at the expected level. Include 1–2 strategies to keep these learners on track and appropriately challenged throughout the lesson.`;

  const userPrompt = `${detailPreamble}Create a classroom-ready lesson plan for the following:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Topic: ${topic}
- Learning Objective: ${learningObjective}${additionalSection}

This plan is for use in a UK school and should reflect current best practice in line with Ofsted's Education Inspection Framework, which places particular emphasis on curriculum intent, implementation, and impact. The plan must be detailed enough for a colleague to pick up and teach without additional preparation.

Structure the lesson plan with exactly these sections using markdown headings:

## Section 1 – Clarity of Objective

Include:
- **Learning Objective**: A refined, specific, and measurable version of the objective above — written as a single sentence beginning with "By the end of this lesson, students will be able to..."
- **Success Criteria**: A numbered list of 3–4 granular, observable outcomes that allow both teacher and student to judge whether the objective has been met. Each criterion should begin with a verb (e.g. "Identify...", "Explain...", "Construct...").
- **Knowledge Covered**: Bullet points of the specific declarative knowledge (facts, concepts, principles) students will learn. Be precise — avoid vague descriptors such as "understand" without qualification.
- **Skills Covered**: Bullet points of the procedural skills or disciplinary thinking students will develop or practise in this lesson.

---

## Section 2 – Key Vocabulary

Provide a markdown table with three columns (Term | Definition | Example in Context) listing 4–6 subject-specific vocabulary items that students must know to access and demonstrate learning in this lesson. Definitions should be precise and age-appropriate for ${yearGroup}.

---

## Section 3 – Evaluation of Prior Knowledge

Provide 5 diagnostic questions a teacher can use at the start of the lesson or in the days before to assess students' prior knowledge and identify gaps. Questions should probe the prerequisite knowledge needed for this lesson — not the lesson content itself. For each question, briefly note what a correct response indicates.

---

## Section 4 – Instructional Strategies

### Starter/Hook Activity

**Description**: A brief, purposeful activity (3–5 minutes) designed to activate relevant prior knowledge or spark curiosity about the topic. The activity should be low-stakes, immediately accessible, and directly connected to the lesson's learning objective.
**Key Formative Assessment Questions**: 2 questions the teacher asks during the starter to gauge prior understanding and adjust the lesson accordingly.

### Main Teacher Input

**Summary of Key Concepts**: A concise bullet-point list of the core concepts, knowledge, and ideas to be taught. This should map directly onto the Success Criteria.
**Sequence of Teacher Input Teaching Steps**: A numbered list of 4–6 detailed, sequential teaching steps. Each step should have a bold title and a description of exactly what the teacher says, shows, or does — including think-alouds, worked examples, and use of the board or resources where relevant.
**Checkpoints**: 3 targeted questions the teacher poses during instruction to check for understanding before students proceed independently. Include brief notes on what incorrect responses might reveal.
**Potential Misconceptions**: Bullet points identifying the most common errors, misconceptions, or points of confusion students are likely to encounter, with a brief note on how to address each one proactively.
**Link to Pedagogical Approach**: One sentence explaining how the teacher input is designed in line with the specified pedagogical approach (or evidence-based best practice if none specified).

### Student Activities

Describe two progressive activities that move from supported to independent practice:

**Activity 1: [Name] ([Type e.g. Guided Practice / Collaborative Task])**
**Description**: A detailed description of what students do, including specific task instructions, expected outputs, and any worked examples or sentence starters provided.
**Teacher Guidance**: How the teacher circulates, prompts, and intervenes during this activity — including specific questions to probe thinking and how to identify students who need additional support.
**Link to Pedagogical Approach**: One sentence.

**Activity 2: [Name] ([Type e.g. Independent Practice / Extended Writing])**
**Description**: A detailed description of the independent or extended task, designed to consolidate and apply the learning from the teacher input and Activity 1.
**Teacher Guidance**: How the teacher monitors, provides feedback, and stretches students during this activity.
**Link to Pedagogical Approach**: One sentence.

### Plenary

**Description**: A structured consolidation activity (5–10 minutes) that requires students to retrieve, connect, or reflect on what they have learned — not a recap by the teacher. Examples include exit tickets, a think-pair-share on a challenging question, or a quick retrieval quiz.
**Assessment Questions**: 2 high-quality questions that require students to demonstrate the lesson's learning objective — not simply recall surface facts.
**Success Criteria Check**: A specific, practical method for the teacher to verify whether each success criterion has been met before students leave (e.g. thumbs up/down, mini-whiteboards, written response reviewed at the door).
**Future Learning**: One sentence explaining what this lesson builds towards and how it connects to subsequent learning in the sequence.
**Link to Pedagogical Approach**: One sentence.

---

## Section 5 – Adaptation Strategies

Write in the context of the Teachers' Standards (particularly TS5: Adapt teaching to respond to the strengths and needs of all pupils) and the SEND Code of Practice.

${adaptationLevel}

**Considerations for Diverse Learning Needs**: 3 bullet points addressing inclusion more broadly — covering EAL learners, pupils with SEND, and those with social, emotional, or mental health needs where relevant. Reference specific adjustments rather than generic statements.

---

## Section 6 – Summative Assessment

**Assessment Opportunities**: 2 bullet points describing concrete methods for assessing whether students have met the learning objective — including both formative checks within the lesson and any summative task or homework that follows.
**Long-term Evaluation**: 1 bullet point describing how the teacher will monitor retention and application of this learning beyond the lesson — for example, through spaced retrieval, marking of extended work, or progress tracking.
**Self-Assessment**: 1 bullet point describing a structured opportunity for students to evaluate their own understanding against the success criteria — such as RAG rating, a written reflection, or a self-marking activity.

---

## Section 7 – Resources and Technology

A structured bullet list of all materials, tools, and technology required. Separate into: printed resources, digital tools, physical materials, and any teacher-facing resources (e.g. mark schemes, model answers).

Do not use any emojis. Write in a professional, teacher-friendly tone appropriate for use in a UK school context.`;

  const encoder = new TextEncoder();
  const anthropicStream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: buildSystem("You are an expert UK secondary and primary school teacher and curriculum designer with deep knowledge of the National Curriculum, Ofsted's Education Inspection Framework, and the Teachers' Standards. You specialise in creating detailed, pedagogically rigorous lesson plans that reflect best practice in curriculum sequencing, formative assessment, and adaptive teaching. You write in precise, professional UK English and produce plans detailed enough to be taught by any competent colleague without modification."),
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
