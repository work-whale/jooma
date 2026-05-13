import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { renderSlide, type SlideSpec, type SlideLayout, type ColorScheme } from "@/app/lib/slideshow-layouts";
import { getTheme } from "@/app/lib/slideshowThemes";
import { generateAIImage, type ImageStyle } from "@/app/lib/ai-image";
import type { SlideJSON } from "@/app/lib/presentations";

export const maxDuration = 120; // AI image gen can push past the default

type ImageSource = "auto" | "ai" | "web";

interface RequestBody {
  topic: string;
  year?: string;
  readingLevel?: string;
  slideCount?: number;
  additionalInstructions?: string;
  includeObjectives?: boolean;
  includeVocab?: boolean;
  imageSource?: ImageSource;
  imageStyle?: ImageStyle;
  themeId?: string;
}

// ── OpenAI structured-output schema ──────────────────────────────────────
const slideshowSchema = {
  name: "slideshow",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "slides"],
    properties: {
      title: { type: "string" },
      slides: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "layout",
            "colorScheme",
            "accentColor",
            "title",
            "subtitle",
            "body",
            "bullets",
            "imageQuery",
            "attribution",
            "twoColLeftTitle",
            "twoColLeftBody",
            "twoColRightTitle",
            "twoColRightBody",
          ],
          properties: {
            layout: {
              type: "string",
              enum: [
                "title-cover", "section-header", "title-bullets", "title-body",
                "image-left", "image-right", "image-full", "two-column", "quote",
              ],
            },
            colorScheme: { type: "string", enum: ["light", "dark", "accent"] },
            accentColor: { type: "string" },
            title: { type: "string" },
            subtitle: { type: "string" },
            body: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
            imageQuery: { type: "string" },
            attribution: { type: "string" },
            twoColLeftTitle: { type: "string" },
            twoColLeftBody: { type: "string" },
            twoColRightTitle: { type: "string" },
            twoColRightBody: { type: "string" },
          },
        },
      },
    },
  },
} as const;

interface AISlideSpec {
  layout: SlideLayout;
  colorScheme: ColorScheme;
  accentColor: string;
  title: string;
  subtitle: string;
  body: string;
  bullets: string[];
  imageQuery: string;
  attribution: string;
  twoColLeftTitle: string;
  twoColLeftBody: string;
  twoColRightTitle: string;
  twoColRightBody: string;
}

// ── Image fetching ───────────────────────────────────────────────────────

interface FetchedImage { dataUrl: string; width: number; height: number }

interface PixabayHit {
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  views: number;
  likes: number;
  tags: string;
}

async function fetchHit(hit: PixabayHit): Promise<FetchedImage | null> {
  const imgRes = await fetch(hit.largeImageURL);
  if (!imgRes.ok) return null;
  const buf = await imgRes.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = imgRes.headers.get("content-type") || "image/jpeg";
  return { dataUrl: `data:${mime};base64,${b64}`, width: hit.imageWidth, height: hit.imageHeight };
}

// Score a hit by how well its tags overlap with the search query words.
// Helps avoid generic top results (e.g. searching "saturn" returning a Jupiter photo).
function scoreHit(hit: PixabayHit, queryWords: string[]): number {
  const tags = hit.tags.toLowerCase();
  let score = 0;
  for (const word of queryWords) {
    if (tags.includes(word)) score += 2;
  }
  // Slight popularity tiebreaker
  score += Math.log10(1 + hit.likes) * 0.1;
  return score;
}

async function searchPixabay(query: string): Promise<FetchedImage | null> {
  const key = process.env.NEXT_PUBLIC_PIXABAY_KEY;
  if (!key || !query.trim()) return null;
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  try {
    const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=20&image_type=all&safesearch=true&orientation=horizontal&order=popular`;
    const r = await fetch(url);
    const data: { hits?: PixabayHit[] } = await r.json();
    const hits = data.hits ?? [];
    if (hits.length === 0) return null;
    // Pick the hit with the highest tag-overlap score, not just the most popular.
    const ranked = hits
      .map((h) => ({ hit: h, score: scoreHit(h, queryWords) }))
      .sort((a, b) => b.score - a.score);
    return await fetchHit(ranked[0].hit);
  } catch { return null; }
}

async function fetchImageForSlide(
  query: string,
  source: ImageSource,
  style: ImageStyle,
  index: number,
): Promise<(FetchedImage & { provider: "ai" | "web" }) | null> {
  const tryAI = async () => {
    const r = await generateAIImage(query, style);
    return r ? { ...r, provider: "ai" as const } : null;
  };
  const tryWeb = async () => {
    const r = await searchPixabay(query);
    return r ? { ...r, provider: "web" as const } : null;
  };
  if (source === "web") return tryWeb();
  if (source === "ai") return tryAI();
  // auto: alternate to keep balance + speed
  return index % 2 === 0
    ? (await tryAI()) ?? tryWeb()
    : (await tryWeb()) ?? tryAI();
}

// ── Prompt builder ───────────────────────────────────────────────────────

function buildPrompt(body: RequestBody): string {
  const count = Math.max(3, Math.min(15, body.slideCount ?? 8));
  const theme = getTheme(body.themeId);
  const yearLine = body.year ? `Audience: UK ${body.year} pupils.` : "";
  const readingLine = body.readingLevel && body.readingLevel !== "Same as Year"
    ? `Reading level: ${body.readingLevel}.`
    : "";
  const extraLine = body.additionalInstructions?.trim()
    ? `Additional instructions from the teacher: ${body.additionalInstructions.trim()}`
    : "";
  const themeLine = `Visual theme: "${theme.name}". ${theme.promptHint}`;
  const preferredSchemeLine = `Prefer colorScheme "${theme.preferredScheme}" on most slides (the renderer will apply the theme's palette).`;
  const accentLine = `Use the theme's accent colour "${theme.palette.accent}" as accentColor on every slide for consistency.`;
  const objectivesLine = body.includeObjectives
    ? `- Make slide 2 a "title-bullets" layout titled "Learning objectives" with 3-5 bullets describing what pupils will know or be able to do.`
    : "";
  const vocabLine = body.includeVocab
    ? `- Include a "title-bullets" layout titled "Key vocabulary" listing key terms with one-line definitions (format: "Term: short definition").`
    : "";

  return `Design a ${count}-slide visual presentation on: "${body.topic}".

${yearLine}
${readingLine}
${themeLine}
${extraLine}

You're a senior presentation designer. Plan a deck that varies layouts so it doesn't feel monotonous. Use this layout vocabulary:
- "title-cover": opener slide. Use ONCE as slide 1.
- "section-header": divider between sections. Use sparingly.
- "title-bullets": title + 3-5 punchy bullets (max 6 words each).
- "title-body": title + one paragraph of body text.
- "image-left" / "image-right": title + body/bullets on one side, photo on the other.
- "image-full": dramatic full-bleed photo with a title overlay. Use 1-2 times for emphasis.
- "two-column": compare/contrast two ideas side-by-side.
- "quote": a single memorable quote, with optional attribution. Use at most ONCE.

Design rules:
- Vary layouts; avoid repeating the same layout more than twice in a row.
- ~40% of content slides should include an imageQuery (2-4 word search query) for image-* and image-full layouts.
- ${accentLine}
- ${preferredSchemeLine} Sprinkle one or two slides with a contrasting scheme for emphasis.
- All non-applicable fields MUST be empty string ("") or empty array ([]) — never omit fields.
- imageQuery should be empty unless layout is image-left / image-right / image-full / title-cover.
- The title-cover slide (slide 1) MUST include a vivid, atmospheric imageQuery for its background. Think hero photo — not a generic concept but a concrete scene that evokes the topic.
- attribution should be empty unless layout is "quote".
- twoCol fields should be empty unless layout is "two-column".
- bullets array must be empty unless layout uses bullets.
- subtitle and body should be empty when not used by the layout.
${objectivesLine}
${vocabLine}

CRITICAL imageQuery rules — image relevance depends on this:
- Use 2-4 CONCRETE NOUNS. Never generic terms like "planets", "people", "science", or "education".
- Bad: "planets" → returns gas giants when the slide is about rocky planets.
- Good: "mercury venus mars rocky planet" or "earth surface from space".
- Bad: "history" → returns abstract scrolls.
- Good: "victorian factory workers" or "ancient roman colosseum".
- If the slide is about a specific entity, name it explicitly in the query.
- Avoid filler words. Single-image search terms only.

Write the deck title as a short title (≤ 6 words).
Write slide content that's substantive, specific, and engaging — no filler. Use UK English spelling.`;
}

// ── Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  const imageSource: ImageSource = body.imageSource ?? "auto";
  const imageStyle: ImageStyle = body.imageStyle ?? "photographic";
  const theme = getTheme(body.themeId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send("status", { message: "Designing your deck..." });

        const client = getOpenAI();
        const completion = await client.chat.completions.create({
          model: "gpt-4o-2024-08-06",
          messages: [
            { role: "system", content: "You design clean, varied, content-rich UK classroom presentation decks." },
            { role: "user", content: buildPrompt(body) },
          ],
          response_format: { type: "json_schema", json_schema: slideshowSchema },
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("Empty AI response");
        const parsed: { title: string; slides: AISlideSpec[] } = JSON.parse(content);

        send("meta", {
          title: parsed.title,
          total: parsed.slides.length,
          slideTitles: parsed.slides.map((s) => s.title),
        });

        // Process slides sequentially so the client can render them as they arrive.
        // Image fetches happen per slide; the text content of each slide ships
        // immediately (before its image) so the user sees structure first.
        for (let idx = 0; idx < parsed.slides.length; idx++) {
          const s = parsed.slides[idx];
          const spec: SlideSpec = {
            layout: s.layout,
            colorScheme: s.colorScheme,
            accentColor: s.accentColor,
            title: s.title,
            subtitle: s.subtitle || undefined,
            body: s.body || undefined,
            bullets: s.bullets.length ? s.bullets : undefined,
            imageQuery: s.imageQuery || undefined,
            attribution: s.attribution || undefined,
            twoColLeftTitle: s.twoColLeftTitle || undefined,
            twoColLeftBody: s.twoColLeftBody || undefined,
            twoColRightTitle: s.twoColRightTitle || undefined,
            twoColRightBody: s.twoColRightBody || undefined,
          };
          let imageProvider: "ai" | "web" | null = null;
          if (spec.imageQuery) {
            const img = await fetchImageForSlide(spec.imageQuery, imageSource, imageStyle, idx);
            if (img) {
              spec.imageDataUrl = img.dataUrl;
              spec.imageWidth = img.width;
              spec.imageHeight = img.height;
              imageProvider = img.provider;
            }
          }
          const slide: SlideJSON = renderSlide(spec, theme);
          send("slide", {
            index: idx,
            total: parsed.slides.length,
            slide,
            title: s.title,
            // Only AI images flow into the AI gallery; web (Pixabay) ones don't.
            galleryImage: imageProvider === "ai" && spec.imageDataUrl && spec.imageQuery
              ? { prompt: spec.imageQuery, style: imageStyle, dataUrl: spec.imageDataUrl }
              : undefined,
          });
        }

        send("complete", { title: parsed.title });
      } catch (err) {
        console.error("Generation failed", err);
        send("error", { message: err instanceof Error ? err.message : "Generation failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
