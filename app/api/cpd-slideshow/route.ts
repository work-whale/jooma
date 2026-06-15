import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";
import { streamChat, recordUsage } from "@/app/lib/usage";

export interface SlideData {
  type: "title" | "content" | "quote" | "stat" | "two-column" | "activity";
  title: string;
  presentationTitle: string;
  // title / content
  subtitle?: string;
  body?: string;
  bullets?: string[];
  imageSuggestion?: string;
  callout?: { type: "key-point" | "reflection" | "try-this" | "discussion"; text: string };
  // quote
  quote?: string;
  quoteAuthor?: string;
  // stat
  stat?: string;
  statLabel?: string;
  statContext?: string;
  // two-column
  leftTitle?: string;
  leftContent?: string;
  rightTitle?: string;
  rightContent?: string;
  // activity
  activityPrompt?: string;
  activitySubtask?: string;
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
    ? `- Content slides may include an "imageSuggestion" field with a specific image search query (e.g. "teachers collaborating in a staff room"). Omit on all other slide types.`
    : `- Do not include any "imageSuggestion" field.`;

  const bulletLine =
    body.contentFormat === "Text and bullet point summary"
      ? `- Content slides may include a "bullets" array with 2–3 bullet points. Each bullet must be no more than 6 words — punchy visual anchors, not sentences.`
      : `- Do not include any "bullets" field.`;

  const focusLine =
    body.presentationFocus === "Practical application"
      ? "Focus on practical classroom application — concrete strategies and actionable steps. Name the technique, describe it clearly, ground it in UK classroom reality."
      : "Focus on the research base and theoretical frameworks — key findings, named researchers, and direct classroom implications in plain language.";

  const additionalLine = body.additionalFocus?.trim()
    ? `Additional focus areas to weave through: ${body.additionalFocus}`
    : "";

  return `Create a high-quality CPD (Continuing Professional Development) slideshow for teachers on: "${body.topic}".

${focusLine}
${additionalLine ? additionalLine + "\n" : ""}This slideshow is for a UK school CPD session. Reflect current best practice and reference the Teachers' Standards, Ofsted's Education Inspection Framework, or DfE guidance where relevant.

Output exactly ${body.slideCount} slides. Always start with 1 title slide.

IMPORTANT: Output each slide as a single JSON object on its own line. No arrays, brackets, separators, or explanation. One valid JSON object per line only.

────────────────────────────────
SLIDE TYPES AND FORMATS
────────────────────────────────

1. TITLE (always slide 1):
{"type":"title","title":"[compelling title — max 6 words]","presentationTitle":"[same title]","subtitle":"[one sentence beginning with 'By the end of this session, participants will...']"}

2. CONTENT (standard narrative — use for most slides):
{"type":"content","title":"[action headline stating the key message — not a topic label]","presentationTitle":"[presentation title]","body":"[max 2 sentences, max 40 words. First: key idea. Second: example or classroom application. No padding.]","bullets":["max 6 words","max 6 words","max 6 words"],"callout":{"type":"key-point","text":"[one punchy sentence]"},"imageSuggestion":"[specific search query]"}
(bullets, callout, and imageSuggestion are optional — omit when not genuinely useful)
(callout.type options: "key-point" for key takeaway, "reflection" for self-audit prompt, "try-this" for actionable tip, "discussion" for a discussion nudge)

3. QUOTE (powerful pull quote from a credible source — use 1–2 times):
{"type":"quote","title":"","presentationTitle":"[presentation title]","quote":"[verbatim or near-verbatim quote — max 30 words. Must be from a real researcher, Ofsted, DfE, or recognised educator.]","quoteAuthor":"[Full Name, Role/Organisation, Year]","body":"[one sentence explaining why this matters for the CPD topic]"}

4. STAT (single compelling statistic as the visual centrepiece — use 1–2 times):
{"type":"stat","title":"[framing headline that contextualises the stat]","presentationTitle":"[presentation title]","stat":"[the number — e.g. '72%' or '1 in 4']","statLabel":"[what it measures — one short phrase]","statContext":"[one sentence of context, implication, or source]"}

5. TWO-COLUMN (side-by-side comparison — use for contrasts):
{"type":"two-column","title":"[contrasting or comparative headline]","presentationTitle":"[presentation title]","leftTitle":"[left panel label]","leftContent":"[2–3 sentences or use \\n- for bullet lines: \\n- Point one\\n- Point two]","rightTitle":"[right panel label]","rightContent":"[2–3 sentences or use \\n- for bullets]"}
Best uses: myth vs. reality, common vs. effective practice, before vs. after, lower vs. higher impact.

6. ACTIVITY (group discussion or reflection task — use 1–2 times):
{"type":"activity","title":"[activity title — e.g. 'Pair Discussion' or 'Quick Reflection']","presentationTitle":"[presentation title]","activityPrompt":"[the main question or task — 1–2 clear sentences]","activitySubtask":"[timing or grouping note — e.g. '5 minutes — discuss in pairs, then share with the group']"}

────────────────────────────────
SLIDE SEQUENCE GUIDANCE
────────────────────────────────
- Slide 1: title
- Slide 2: hook — use a stat or quote to establish why this matters
- Middle slides: core content using content, two-column, quote, stat — ONE key message each
- Include 1–2 activity slides: one mid-presentation for discussion, optionally one at the end for reflection
- Final slide: content focused on next steps and implementation
- Slides must build a coherent narrative. Each title should stand alone as a meaningful statement.

STRICT RULES:
- ONE key message per slide — if you have two ideas, use two slides
- "body" field: max 2 sentences, max 40 words — no padding, no repetition of the title
- "presentationTitle" must be identical on every slide
- No emojis. No text outside the JSON objects.
${bulletLine}
${imageLine}`;
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

    return streamChat({
      toolSlug: "cpd-slideshow",
      model: "gpt-4o",
      max_tokens: 8192,
      messages: [
        { role: "system", content: buildSystem("You are an expert UK CPD facilitator, school leader, and teacher educator with extensive experience designing and delivering professional development for teachers across all phases. You understand what makes CPD effective — it must be specific, evidence-informed, relevant to classroom practice, and actionable. Your slideshows are substantive and authoritative, referencing current educational research, the Teachers' Standards, and DfE or Ofsted guidance where appropriate. Output each slide as a single JSON object on its own line with no other text. No markdown, no code fences, no arrays, no separators. One valid JSON object per line only.") },
        { role: "user", content: buildGeneratePrompt(body) },
      ],
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
      await recordUsage("cpd-slideshow", "gpt-4o", message.usage);

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
