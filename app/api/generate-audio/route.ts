// Generates one audio activity for the slideshow editor:
//   1. Ask gpt-4o for a short listening script + comprehension questions
//      relevant to the topic.
//   2. Convert the script to MP3 via OpenAI TTS.
//   3. Upload the MP3 to the `audio` Supabase Storage bucket.
//   4. Return { src, title, description, questions, transcript } so the
//      caller can drop an AudioObject onto a slide.

import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { supabase } from "@/app/lib/supabase";

export const maxDuration = 120;

type ActivityType = "comprehension" | "true-false" | "gap-fills";

interface RequestBody {
  topic: string;
  year?: string;
  readingLevel?: string;
  activityType?: ActivityType;
  additionalInstructions?: string;
  /** Key slide titles / concepts from the deck — used to anchor the audio
   *  script to specific content covered in the lesson, not just the broad topic. */
  slideContext?: string;
  // Optional: when the caller already knows what they want, skip the gpt-4o pass.
  scriptOverride?: string;
  titleOverride?: string;
  // When true, skip TTS + Storage. Just rewrite the questions against an
  // existing transcript. Used by the "Edit audio" panel to swap activity types
  // without re-charging for a new audio file.
  questionsOnly?: boolean;
  existingTranscript?: string;
}

const ACTIVITY_INSTRUCTIONS: Record<ActivityType, string> = {
  "comprehension": "Write 3-4 open-ended comprehension questions that test understanding of the listening passage.",
  "true-false": "Write 4-5 true/false statements based on the listening passage. Mix true and false statements; do not reveal which is which.",
  "gap-fills": "Write 3-4 gap-fill (cloze) sentences drawn from the listening passage. Use an underscore line (e.g. \"________\") to mark the missing word in each.",
};

type Voice = "alloy" | "nova" | "echo" | "fable" | "onyx" | "shimmer";

const scriptSchema = {
  name: "audio_activity",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "description", "script", "questions", "answers"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      script: { type: "string" },
      questions: { type: "array", items: { type: "string" } },
      // Suggested/model answers, ONE per question in the same order. For
      // true/false statements this is "True"/"False" (+ a brief why); for
      // gap-fills it's the missing word; for comprehension it's a model
      // answer. Used to build the audio-activity answer slide.
      answers: { type: "array", items: { type: "string" } },
    },
  },
} as const;

// Use the British-accented voice across all year groups so listening clips
// match the UK English script. "fable" is OpenAI tts-1's RP-style voice;
// the others (alloy/nova/echo/onyx/shimmer) are American.
function pickVoice(_year?: string): Voice {
  return "fable";
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  const client = getOpenAI();
  let title: string;
  let description: string;
  let script: string;
  let questions: string[];
  let answers: string[];
  // gpt-4o usage for the script-writing call, captured for cost reporting.
  let scriptUsage: { prompt_tokens: number; completion_tokens: number } | null = null;

  const activity = body.activityType ?? "comprehension";
  const activityInstruction = ACTIVITY_INSTRUCTIONS[activity];
  const extraInstr = body.additionalInstructions?.trim()
    ? `\nAdditional instructions from the teacher: ${body.additionalInstructions.trim()}`
    : "";

  // Questions-only mode: caller already has the audio + transcript, they just
  // want a different set of questions (e.g. switching from comprehension to
  // true/false). Skip TTS + Storage entirely.
  if (body.questionsOnly) {
    if (!body.existingTranscript?.trim()) {
      return NextResponse.json({ error: "questionsOnly requires existingTranscript" }, { status: 400 });
    }
    const qPrompt = `Re-write the activity questions for this listening transcript:

"${body.existingTranscript.trim()}"

${activityInstruction}${extraInstr}

Return the questions array, plus an "answers" array with ONE model answer per question in the same order, plus a brief title and one-sentence description for the activity.`;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You design clear, age-appropriate UK classroom listening activities." },
        { role: "user", content: qPrompt },
      ],
      response_format: { type: "json_schema", json_schema: scriptSchema },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    const parsed: { title: string; description: string; script: string; questions: string[]; answers: string[] } = JSON.parse(content);
    return NextResponse.json({
      title: parsed.title,
      description: parsed.description,
      questions: parsed.questions,
      answers: parsed.answers,
      transcript: body.existingTranscript,
      // No new audio file — caller keeps the existing src.
    });
  }

  // 1) Write the script + activity (unless caller supplied one).
  if (body.scriptOverride) {
    // User-supplied script: use it verbatim for TTS, but still ask gpt-4o for
    // a fitting title, description, and activity questions so the slide isn't
    // bare.
    script = body.scriptOverride;
    const qPrompt = `A teacher has supplied this listening script for a classroom audio activity:

"${body.scriptOverride.trim()}"

Topic / context: "${body.topic}".

Write:
- A short title (max 6 words) summarising the clip.
- A one-sentence description telling pupils what they'll hear.
- Activity questions tied to the script. ${activityInstruction}${extraInstr}
- An "answers" array with ONE model answer per question, in the same order.

Do NOT rewrite the script — leave the "script" field equal to the supplied text. Use British English in everything you write.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You design clear, age-appropriate UK classroom listening activities." },
        { role: "user", content: qPrompt },
      ],
      response_format: { type: "json_schema", json_schema: scriptSchema },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    const parsed: { title: string; description: string; script: string; questions: string[]; answers: string[] } = JSON.parse(content);
    title = body.titleOverride || parsed.title;
    description = parsed.description;
    questions = parsed.questions;
    answers = parsed.answers;
  } else {
    const yearLine = body.year ? `Audience: UK ${body.year} pupils.` : "";
    const readingLine = body.readingLevel && body.readingLevel !== "Same as Year"
      ? `Reading level: ${body.readingLevel}.`
      : "";
    const contextLine = body.slideContext?.trim()
      ? `\nThe lesson covers these specific concepts (use them as the source of the script — reference at least one directly):\n${body.slideContext.trim()}`
      : "";
    const prompt = `Design a short LISTENING activity for a classroom lesson on: "${body.topic}".

${yearLine}
${readingLine}
${contextLine}

Write:
- A short title (max 6 words) for the activity — must name a specific concept from the lesson, not just the broad topic.
- A one-sentence description telling pupils what they will hear.
- A "script" of 25-50 seconds spoken aloud — a first-person account, a vivid scene, a narrated explanation, or a short dialogue. The script MUST be grounded in the specific concepts listed above, not the broad topic in general. Concrete and engaging — no filler. Use British English: spellings (colour, organise, realise, learnt), idiom (rubbish bin, lift, pavement, lorry, queue, holiday), and British settings/place names where the topic allows. Avoid American Englishisms (color, organize, sidewalk, vacation, trash can).
- Activity questions for pupils to complete while/after listening. Questions must test the specific content of the script, not general topic knowledge. ${activityInstruction}${extraInstr}
- An "answers" array with ONE model answer per question, in the same order (for true/false, give "True"/"False" plus a short reason; for gap-fills, the missing word; for comprehension, a concise model answer).

The "script" must be plain spoken text only — no stage directions, sound effects, or speaker tags.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You design clear, age-appropriate UK classroom listening activities." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: scriptSchema },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    if (completion.usage) scriptUsage = completion.usage;
    const parsed: { title: string; description: string; script: string; questions: string[]; answers: string[] } = JSON.parse(content);
    title = parsed.title;
    description = parsed.description;
    script = parsed.script;
    questions = parsed.questions;
    answers = parsed.answers;
  }

  // 2) TTS the script.
  let mp3Buffer: Buffer;
  try {
    const tts = await client.audio.speech.create({
      model: "tts-1",
      voice: pickVoice(body.year),
      input: script,
      response_format: "mp3",
    });
    const arr = await tts.arrayBuffer();
    mp3Buffer = Buffer.from(arr);
  } catch (err) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({
      error: "TTS failed",
      message: e?.message,
      status: e?.status,
    }, { status: 500 });
  }

  // 3) Upload to Supabase Storage. Filename includes a timestamp + random
  // segment to avoid collisions.
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;
  const { error: uploadErr } = await supabase.storage
    .from("audio")
    .upload(filename, mp3Buffer, { contentType: "audio/mpeg", upsert: false });
  if (uploadErr) {
    return NextResponse.json({
      error: "Storage upload failed",
      message: uploadErr.message,
    }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from("audio").getPublicUrl(filename);

  // Cost: gpt-4o script tokens + tts-1 characters. Pricing (USD):
  // gpt-4o $2.5/1M in, $10/1M out · tts-1 $15/1M chars.
  const scriptCost = scriptUsage
    ? (scriptUsage.prompt_tokens / 1_000_000) * 2.5 +
      (scriptUsage.completion_tokens / 1_000_000) * 10.0
    : 0;
  const ttsCost = (script.length / 1_000_000) * 15.0;
  const costUsd = scriptCost + ttsCost;

  return NextResponse.json({
    src: pub.publicUrl,
    title,
    description,
    transcript: script,
    questions,
    answers,
    costUsd,
  });
}
