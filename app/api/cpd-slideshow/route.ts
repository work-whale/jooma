import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface SlideData {
  type: "title" | "content";
  title: string;
  presentationTitle: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  imageSuggestion?: string;
}

interface GenerateBody {
  action: "generate";
  topic: string;
  slideCount: number;
  additionalFocus: string;
  presentationFocus: "Practical application" | "Research and theory";
  contentFormat: "Text" | "Text and bullet point summary";
  includeImageSuggestions: boolean;
}

interface RefineBody {
  action: "refine";
  slides: SlideData[];
  instruction: string;
}

type RequestBody = GenerateBody | RefineBody;


function buildGeneratePrompt(body: GenerateBody): string {
  const imageLine = body.includeImageSuggestions
    ? `- Each content slide must include an "imageSuggestion" field with a short, specific image search query (e.g. "teachers collaborating in a staff room"). Omit on the title slide.`
    : `- Do not include any "imageSuggestion" field.`;

  const bulletLine =
    body.contentFormat === "Text and bullet point summary"
      ? `- Each content slide must include a "bullets" array with exactly 3 bullet points. Each bullet must be no more than 6 words. They should be punchy, memorable takeaways — not full sentences.`
      : `- Do not include any "bullets" field.`;

  const focusLine =
    body.presentationFocus === "Practical application"
      ? "Focus on practical classroom application — one concrete strategy or actionable step per slide. Name the technique, describe it in a single clear sentence, and ground it in what it looks like in a UK classroom."
      : "Focus on the research base and theoretical frameworks — one key finding or concept per slide. Name the researcher or study, state the finding in plain language, and give its direct classroom implication in one sentence.";

  const additionalLine = body.additionalFocus?.trim()
    ? `Additional focus areas to weave through the presentation: ${body.additionalFocus}`
    : "";

  return `Create a high-quality CPD (Continuing Professional Development) slideshow for teachers on: "${body.topic}".

${focusLine}
${additionalLine ? additionalLine + "\n" : ""}
This slideshow is for use in a UK school CPD session. It should reflect current best practice and, where relevant, reference the Teachers' Standards, Ofsted's Education Inspection Framework, or DfE guidance.

Output exactly ${body.slideCount} slides: 1 title slide followed by ${body.slideCount - 1} content slides.

IMPORTANT: Output each slide as a single JSON object on its own line. Do not wrap them in an array. Do not output anything else — no brackets, no separators, no explanation. One JSON object per line only.

Title slide format:
{"type":"title","title":"[compelling presentation title — maximum 6 words]","presentationTitle":"[same title]","subtitle":"[one sentence beginning with 'By the end of this session, participants will...']"}

Content slide format:
{"type":"content","title":"[action-oriented headline that states the key message of this slide — e.g. 'Retrieval Practice Boosts Long-Term Retention']","presentationTitle":"[same title as above]","body":"[STRICT LIMIT: 2 sentences maximum. First sentence states the single key idea. Second sentence gives one specific example, statistic, or classroom application. Total must not exceed 40 words.]","bullets":["max 6 words","max 6 words","max 6 words"],"imageSuggestion":"[specific image search query]"}

Slide design principles — follow these strictly:
- ONE key message per slide. If you find yourself writing more than one idea, split it into two slides.
- The "title" field is the headline — it must communicate the takeaway on its own, not just label the topic. Bad: "Feedback". Good: "Specific Feedback Accelerates Progress".
- The "body" field is the support — maximum 2 sentences, maximum 40 words total. No padding, no repetition of the title, no filler phrases.
- Bullet points (if included) are 6 words or fewer each — they are visual anchors, not sentences.
- Slides must build logically: early slides set the rationale, middle slides deliver the core content, final slides focus on implementation and next steps.
- "presentationTitle" must be identical on every slide.
${bulletLine}
${imageLine}
- No emojis. No text outside the JSON objects.`;
}

function buildRefinePrompt(body: RefineBody): string {
  return `Modify the following CPD slideshow based on this instruction: "${body.instruction}"

Current slides:
${JSON.stringify(body.slides, null, 2)}

Return the modified slides in exactly the same JSON format:
{"slides": [/* updated slide objects */]}

Apply only the changes described. Keep everything else as-is.
No text outside the JSON object.`;
}

function parseSlides(text: string): SlideData[] {
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

  // Generate: stream NDJSON — one slide JSON per line
  if (body.action === "generate") {
    if (!body.topic?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const openaiStream = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 8192,
      messages: [
        { role: "system", content: buildSystem("You are an expert UK CPD facilitator, school leader, and teacher educator with extensive experience designing and delivering professional development for teachers across all phases. You understand what makes CPD effective — it must be specific, evidence-informed, relevant to classroom practice, and actionable. Your slideshows are substantive and authoritative, referencing current educational research, the Teachers' Standards, and DfE or Ofsted guidance where appropriate. Output each slide as a single JSON object on its own line with no other text. No markdown, no code fences, no arrays, no separators. One valid JSON object per line only.") },
        { role: "user", content: buildGeneratePrompt(body) },
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

  // Refine: standard JSON response
  if (body.action === "refine") {
    if (!body.instruction?.trim() || !body.slides?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      const message = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 8192,
        messages: [
          { role: "system", content: buildSystem("You are an expert UK CPD facilitator editing an existing teacher professional development slideshow. Apply the requested changes precisely and consistently while maintaining the quality, accuracy, and professional tone of the original content. Return valid JSON exactly as requested — no additional text, markdown, or code fences.") },
          { role: "user", content: buildRefinePrompt(body) },
        ],
        stream: false,
      });

      const text = message.choices[0]?.message?.content ?? "";
      if (!text) {
        return NextResponse.json({ error: "No response from AI" }, { status: 500 });
      }

      const slides = parseSlides(text);
      return NextResponse.json({ slides });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refine slideshow";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
