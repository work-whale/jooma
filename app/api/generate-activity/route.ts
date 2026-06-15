// Generates the content for one classroom activity slide. The slideshow
// editor's Activities sidebar calls this when the teacher picks a kind,
// optionally types a topic, and chooses a difficulty level. The route picks
// a per-kind prompt, asks gpt-4o for structured content, and returns
// everything the Editor needs to build the slide.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { recordUsage } from "@/app/lib/usage";

export const maxDuration = 60;

type ActivityKind =
  | "listen-answer" | "open-ended" | "quiz" | "which-true"
  | "fill-blanks" | "vocab-match" | "image-match" | "discussion"
  | "true-false" | "true-false-why" | "order" | "creative";

type Level = "Easy" | "Moderate" | "Difficult";

interface RequestBody {
  kind: ActivityKind;
  /** Specific topic — when omitted we fall back to the deck context. */
  topic?: string;
  level: Level;
  /** The deck title + slide titles so the AI can stay on-topic without an
   *  explicit `topic`. */
  deckTitle?: string;
  slideTitles?: string[];
}

// One unified schema covers every kind — fields that don't apply to the
// chosen kind come back as "" or [] (OpenAI strict mode forces them present).
const activitySchema = {
  name: "activity",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "body", "imageQuery", "items", "answers", "options"],
    properties: {
      title: { type: "string" },
      // Main body text the slide shows. `**bold**` markers are honoured by the
      // editor's text renderer. Use `\n\n` between paragraphs.
      body: { type: "string" },
      // 2-4 concrete nouns for the slide's accompanying image. Empty when no
      // image is wanted.
      imageQuery: { type: "string" },
      // Per-kind itemised content:
      //   quiz                — empty (options drives the question list)
      //   which-true          — the candidate statements (a mix true + false)
      //   true-false          — statements (one per line)
      //   true-false-why      — statements (one per line)
      //   order               — items in RANDOM presentation order
      //   vocab-match         — terms (left column)
      //   image-match         — labels (right column)
      //   fill-blanks         — sentences with `____` blanks
      //   discussion          — empty (the prompt is in body)
      //   open-ended          — empty
      //   creative            — empty
      //   listen-answer       — empty (comprehension Qs come from the audio API)
      items: { type: "array", items: { type: "string" } },
      // Model answers / correct values matching `items` 1:1 where applicable:
      //   true-false          — "True" or "False" per item
      //   true-false-why      — "True: …" or "False: …" with explanation
      //   which-true          — "True"/"False" per item (which are the true ones)
      //   order               — items in CORRECT order
      //   vocab-match         — definitions (right column, aligned to items)
      //   image-match         — empty (labels drive matching)
      //   fill-blanks         — the missing word(s) per sentence
      //   open-ended / discussion / creative / quiz / listen-answer — empty
      answers: { type: "array", items: { type: "string" } },
      // For quiz kind only: question-with-options groups. Empty for others.
      options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "choices", "correctIndex"],
          properties: {
            question: { type: "string" },
            choices: { type: "array", items: { type: "string" } },
            // 0-based index of the correct choice.
            correctIndex: { type: "integer" },
          },
        },
      },
    },
  },
} as const;

function instructionFor(kind: ActivityKind): string {
  switch (kind) {
    case "listen-answer":
      return `Generate the COMPREHENSION QUESTIONS that would accompany a short listening clip on this topic. Put the questions in "items" (3-4 items, one question each). Put model answers in "answers" (1:1 with items). Body text should be a short instruction line: "Listen to the audio and answer the questions below." Leave options empty.`;
    case "open-ended":
      return `Generate ONE open-ended task — a single rich prompt that asks students to do something concrete (find / explain / justify / compare). Body should be 2-3 sentences with **bold** markers around the most important nouns and verbs (e.g. "Find **two different 2-digit numbers** that result in a **product** between 1,200 and 1,300."). Choose a vivid, lesson-relevant imageQuery (2-4 concrete nouns). items/answers/options stay empty.`;
    case "quiz":
      return `Generate a 3-question multiple-choice quiz. Each question has 4 plausible choices. Put each as a group in "options" with a "correctIndex" (0-3). Body should be a short instruction ("Choose the best answer for each question."). Leave items/answers empty.`;
    case "which-true":
      return `Generate 4-5 candidate statements about the topic — a MIX of true and false (at least 2 of each). Put statements in "items". Put "True"/"False" verdicts in "answers" 1:1. Body: a short instruction line asking students to tick the statements that are true.`;
    case "fill-blanks":
      return `Generate 3-4 sentences with ONE missing key word each, marked with "______" (six underscores). Put each sentence in "items". Put the missing word for each in "answers" (1:1). Body: a short instruction ("Fill in the blanks").`;
    case "vocab-match":
      return `Generate 4-6 vocabulary pairs. Put the TERMS in "items" and DEFINITIONS in "answers" (1:1, aligned). Body: a short instruction ("Match each term to its definition").`;
    case "image-match":
      return `Generate 3-4 short LABELS the teacher will match to images. Put labels in "items". Body: a short instruction. imageQuery is the GENERAL topic the labels relate to (the teacher will add specific images per label).`;
    case "discussion":
      return `Generate ONE thought-provoking open discussion question. Body should be the question itself, written to spark debate. Use **bold** markers on 1-2 key phrases. imageQuery: a vivid lesson-relevant image. items/answers/options empty.`;
    case "true-false":
      return `Generate 3-5 statements about the topic — about half true and half false. Put statements in "items". Put "True" or "False" in "answers" 1:1. Body: a short instruction.`;
    case "true-false-why":
      return `Generate 3-4 statements about the topic. Put statements in "items". For each, put "True: <one-sentence reason>" or "False: <one-sentence correction>" in "answers". Body: a short instruction asking students to mark T/F AND explain why.`;
    case "order":
      return `Generate 4 items the student must put in a meaningful order (chronological, smallest-to-largest, etc.). Put items in RANDOM presentation order in "items". Put the SAME items in the CORRECT order in "answers". Body: a short instruction including the ordering criterion.`;
    case "creative":
      return `Generate ONE open-ended creative task that invites students to make/imagine/design something tied to the topic. Body should be a 2-3 sentence prompt with **bold** markers around the key creative verbs and nouns. imageQuery: a vivid lesson-relevant image. items/answers/options empty.`;
  }
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.kind) return NextResponse.json({ error: "Missing kind" }, { status: 400 });
  if (!body.level) return NextResponse.json({ error: "Missing level" }, { status: 400 });

  const topicLine = body.topic?.trim()
    ? `Specific topic: ${body.topic.trim()}.`
    : body.deckTitle
    ? `The activity is part of a lesson titled "${body.deckTitle}".`
    : "";
  const contextLine = body.slideTitles?.length
    ? `Lesson slides cover:\n${body.slideTitles.slice(0, 8).map((t) => `- ${t}`).join("\n")}`
    : "";
  const levelLine = `Difficulty level: ${body.level}.`;

  const prompt = `Design ONE classroom activity slide.

${topicLine}
${contextLine}
${levelLine}

${instructionFor(body.kind)}

Title: a short evocative title (3-6 words) — creative, not generic ("Banned: Topic", "Introduction", "Activity 1").
Use British English. Body should be tight and concrete — the kind of writing a confident teacher would put on a slide.`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a UK classroom activity designer. You write tight, specific prompts kids can act on." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: activitySchema },
    });
    void recordUsage("generate-activity", "gpt-4o-2024-08-06", completion.usage);
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    const parsed = JSON.parse(content) as {
      title: string;
      body: string;
      imageQuery: string;
      items: string[];
      answers: string[];
      options: { question: string; choices: string[]; correctIndex: number }[];
    };
    return NextResponse.json({ kind: body.kind, ...parsed });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: "Activity generation failed", message: e?.message }, { status: 500 });
  }
}
