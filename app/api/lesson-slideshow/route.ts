import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";
import { streamChat, recordUsage } from "@/app/lib/usage";

export interface LessonSlideData {
  type: "title" | "content" | "two-column" | "activity" | "key-fact";
  title: string;
  lessonTitle: string;
  // title
  subtitle?: string;
  body?: string;
  // content
  bullets?: string[];
  imageSuggestion?: string;
  callout?: { type: "remember" | "key-term" | "example" | "discussion"; text: string };
  // two-column
  leftTitle?: string;
  leftContent?: string;
  rightTitle?: string;
  rightContent?: string;
  // activity
  activityPrompt?: string;
  activityNote?: string;
  // key-fact
  fact?: string;
  factSource?: string;
}

interface GenerateBody {
  action: "generate";
  topic: string;
  subject?: string;
  yearGroup: string;
  slideCount: number;
  additionalContext?: string;
  includeImageSuggestions: boolean;
}

interface RefineBody {
  action: "refine";
  slides: LessonSlideData[];
  instruction: string;
}

type RequestBody = GenerateBody | RefineBody;

function buildGeneratePrompt(body: GenerateBody): string {
  const imageLine = body.includeImageSuggestions
    ? `- Content slides may include an "imageSuggestion" field with a specific image search query (e.g. "diagram of the water cycle"). Omit on all other slide types.`
    : `- Do not include any "imageSuggestion" field.`;

  const context = [
    body.subject && `Subject: ${body.subject}`,
    `Year group: ${body.yearGroup}`,
  ].filter(Boolean).join(" | ");

  const additionalLine = body.additionalContext?.trim()
    ? `\nCurriculum context and learning objectives provided by the teacher:\n${body.additionalContext}\nUse this to shape the content and ensure it aligns with what pupils need to learn.\n`
    : "";

  return `Create a high-quality lesson presentation for pupils on: "${body.topic}".
${context ? `${context}\n` : ""}${additionalLine}
This is a classroom-facing lesson slideshow — content must be accurate, age-appropriate, and engaging for pupils. Use curriculum-accurate terminology. Write as if you are a subject expert and experienced teacher.

Output exactly ${body.slideCount} slides. Always start with 1 title slide.

IMPORTANT: Output each slide as a single JSON object on its own line. No arrays, brackets, separators, or explanation. One valid JSON object per line only.

────────────────────────────────
SLIDE TYPES AND FORMATS
────────────────────────────────

1. TITLE (always slide 1):
{"type":"title","title":"[lesson title — the topic, clearly stated]","lessonTitle":"[same title]","subtitle":"[year group and subject — e.g. 'Year 10 Science']","body":"[Learning objectives: list 3–4 clear, measurable learning objectives as a single string, each on a new line starting with '- ']"}

2. CONTENT (core knowledge slide — use for most slides):
{"type":"content","title":"[clear, specific heading for this concept]","lessonTitle":"[lesson title]","body":"[2–3 sentences of curriculum-accurate explanation. Age-appropriate vocabulary. Maximum 50 words.]","bullets":["concise point","concise point","concise point"],"callout":{"type":"key-term","text":"[term: definition — one sentence]"},"imageSuggestion":"[specific search query for a diagram or photo]"}
(bullets: 2–4 items, each under 8 words — key facts, not full sentences; bullets, callout, imageSuggestion are optional)
(callout.type: "key-term" for vocabulary, "remember" for a must-know fact, "example" for a real-world example, "discussion" for a class discussion nudge)

3. TWO-COLUMN (comparison or contrast slide):
{"type":"two-column","title":"[contrasting headline]","lessonTitle":"[lesson title]","leftTitle":"[left label]","leftContent":"[2–3 sentences or use \\n- for bullets: \\n- Point one\\n- Point two]","rightTitle":"[right label]","rightContent":"[same format]"}
Best uses: before/after, type A vs type B, advantages vs disadvantages, example comparisons.

4. ACTIVITY (pupil task or discussion — use 1–3 times):
{"type":"activity","title":"[activity name — e.g. 'Think, Pair, Share' or 'Quick Check']","lessonTitle":"[lesson title]","activityPrompt":"[the question or task pupils need to complete — 1–2 clear sentences, written directly to pupils]","activityNote":"[optional timing or grouping — e.g. '3 minutes — discuss with a partner']"}

5. KEY FACT (a single high-impact fact, definition, or quote — use 1–2 times):
{"type":"key-fact","title":"[framing headline]","lessonTitle":"[lesson title]","fact":"[the fact, definition, or key statement — max 25 words, written as a complete sentence]","factSource":"[optional — source, scientist, year, or 'Did you know?' context]"}

────────────────────────────────
SLIDE SEQUENCE GUIDANCE
────────────────────────────────
- Slide 1: title with learning objectives
- Slide 2: hook — a key fact to spark curiosity, or a content slide introducing the main concept
- Middle slides: core content — cover the curriculum accurately and progressively
- Include 1–3 activity slides spread through the lesson for engagement
- Use two-column slides for comparisons or when contrasting ideas
- Use key-fact slides for memorable highlights (definitions, statistics, discoveries)
- Final slide: content or activity that recaps what pupils have learned

STRICT RULES:
- ONE concept per slide — if you have two ideas, use two slides
- All content must be curriculum-accurate and appropriate for ${body.yearGroup} pupils
- Write body text as a teacher would explain it — clear, precise, not dumbed down
- "lessonTitle" must be identical on every slide
- No emojis. No text outside the JSON objects.
${imageLine}`;
}

function buildRefinePrompt(body: RefineBody): string {
  return `Modify the following lesson slideshow based on this instruction: "${body.instruction}"

Current slides:
${JSON.stringify(body.slides, null, 2)}

Return the modified slides in exactly the same JSON format:
{"slides": [/* updated slide objects */]}

Apply only the changes described. Keep everything else as-is. Maintain curriculum accuracy.
No text outside the JSON object.`;
}

function parseSlides(text: string): LessonSlideData[] {
  const stripped = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed.slides)) throw new Error("Invalid response structure");
  return parsed.slides;
}

export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body: RequestBody = await req.json();

  if (!body.action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  if (body.action === "generate") {
    if (!body.topic?.trim() || !body.yearGroup?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    return streamChat({
      toolSlug: "lesson-slideshow",
      model: "gpt-4o",
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content: buildSystem(
            "You are an expert UK curriculum teacher and lesson designer. You create engaging, accurate lesson presentations for pupils. Your slides are substantive, age-appropriate, and curriculum-aligned. Output each slide as a single JSON object on its own line — no markdown, no arrays, no separators. One valid JSON object per line only."
          ),
        },
        { role: "user", content: buildGeneratePrompt(body) },
      ],
    });
  }

  if (body.action === "refine") {
    if (!body.instruction?.trim() || !body.slides?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      const message = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 8192,
        messages: [
          {
            role: "system",
            content: buildSystem(
              "You are an expert UK curriculum teacher editing an existing lesson slideshow. Apply the requested changes precisely while maintaining curriculum accuracy and age-appropriate language. Return valid JSON exactly as requested — no additional text, markdown, or code fences."
            ),
          },
          { role: "user", content: buildRefinePrompt(body) },
        ],
        stream: false,
      });
      await recordUsage("lesson-slideshow", "gpt-4o", message.usage);

      const text = message.choices[0]?.message?.content ?? "";
      if (!text) return NextResponse.json({ error: "No response from AI" }, { status: 500 });

      const slides = parseSlides(text);
      return NextResponse.json({ slides });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refine slideshow";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
