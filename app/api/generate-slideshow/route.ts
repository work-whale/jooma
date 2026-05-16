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
  includeAudio?: boolean;
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
            "statValue",
            "statCaption",
            "col1Title", "col1Body",
            "col2Title", "col2Body",
            "col3Title", "col3Body",
            "quadrants",
            "timelineItems",
          ],
          properties: {
            layout: {
              type: "string",
              enum: [
                "title-cover", "section-header", "title-bullets", "title-body",
                "image-left", "image-right", "image-full", "two-column", "quote",
                "big-stat", "three-column", "comparison-grid", "timeline",
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
            statValue: { type: "string" },
            statCaption: { type: "string" },
            col1Title: { type: "string" }, col1Body: { type: "string" },
            col2Title: { type: "string" }, col2Body: { type: "string" },
            col3Title: { type: "string" }, col3Body: { type: "string" },
            quadrants: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "body"],
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                },
              },
            },
            timelineItems: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["date", "title", "body"],
                properties: {
                  date: { type: "string" },
                  title: { type: "string" },
                  body: { type: "string" },
                },
              },
            },
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
  statValue: string;
  statCaption: string;
  col1Title: string; col1Body: string;
  col2Title: string; col2Body: string;
  col3Title: string; col3Body: string;
  quadrants: { title: string; body: string }[];
  timelineItems: { date: string; title: string; body: string }[];
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
  // The renderer treats "light" colorScheme as "use the theme's natural palette",
  // which for the Dark theme means a dark background + light text. "dark" and
  // "accent" are reserved for sprinkled contrast slides.
  const preferredSchemeLine = `Use colorScheme "light" on MOST slides (the renderer applies the theme's natural palette — for the Dark theme this still produces dark slides). Sprinkle one or two slides with "dark" or "accent" for visual contrast.`;
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
- "title-bullets": title + 3-5 punchy bullets (max 6 words each). AVOID — prefer image-left/image-right.
- "title-body": title + one paragraph of body text. AVOID — prefer image-left/image-right.
- "image-left" / "image-right": title + body/bullets on one side, photo on the other. STRONGLY PREFERRED for content slides.
- "image-full": dramatic full-bleed photo with a title overlay. Use 1-2 times for emphasis.
- "two-column": compare/contrast two ideas side-by-side (fills twoCol* fields).
- "quote": a single memorable quote, with optional attribution. Use at most ONCE.
- "big-stat": ONE huge headline figure + caption. Fill statValue ("73%") and statCaption ("of UK pupils prefer visual aids"). Great for grabbing attention.
- "three-column": three short titled blurbs side-by-side. Fill col1Title/col1Body, col2Title/col2Body, col3Title/col3Body.
- "comparison-grid": 2x2 grid of titled blurbs. Fill the "quadrants" array with 2-4 items, each having (title, body). Good for pros/cons or four-part frameworks.
- "timeline": chronological events. Fill "timelineItems" (2-5 items, each having date, title, body). Use for history, processes, or sequenced learning.

Design rules:
- Vary layouts; avoid repeating the same layout more than twice in a row.
- EVERY content slide must visually rich — at least 70% of slides (excluding section-header and quote) MUST use image-left, image-right, image-full, big-stat, three-column, comparison-grid, or timeline. Empty-looking slides are forbidden.
- Only use "title-bullets" or "title-body" when an image truly does not fit (e.g. an objectives list or vocab table). Even then, supply an imageQuery — the renderer will fall back gracefully if no image is found.
- Sprinkle 1 big-stat and 1 timeline/comparison-grid when the topic supports them — they make decks feel professional.
- ${accentLine}
- ${preferredSchemeLine} Sprinkle one or two slides with a contrasting scheme for emphasis.
- All non-applicable fields MUST be empty string ("") or empty array ([]) — never omit fields.
- imageQuery is REQUIRED for: title-cover, image-left, image-right, image-full. Set it on bullet/body slides too whenever a relevant photo could enrich the slide.
- The title-cover slide (slide 1) MUST include a vivid, atmospheric imageQuery for its background. Think hero photo — not a generic concept but a concrete scene that evokes the topic.
- attribution should be empty unless layout is "quote".
- twoCol fields should be empty unless layout is "two-column".
- bullets array must be empty unless layout uses bullets.
- subtitle and body should be empty when not used by the layout.
- statValue and statCaption must be empty unless layout is "big-stat".
- col1Title/col1Body, col2Title/col2Body, col3Title/col3Body must be empty unless layout is "three-column".
- quadrants array must be empty unless layout is "comparison-grid".
- timelineItems array must be empty unless layout is "timeline".
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
      // The client may close the connection (navigate away, refresh) while the
      // server is still doing slow work (image gen, TTS). When that happens, the
      // ReadableStream controller is closed by Next.js and any subsequent
      // `controller.enqueue` throws "Invalid state: Controller is already
      // closed". We track a local flag so:
      //   1. `send` never throws — it just drops the event silently.
      //   2. Slow steps (audio gen, image fetches) bail out early instead of
      //      doing expensive work nobody will read.
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      // If the inbound request aborts (client disconnect), mark closed so we
      // skip the rest of the work in this turn.
      req.signal.addEventListener("abort", () => { closed = true; });

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
            statValue: s.statValue || undefined,
            statCaption: s.statCaption || undefined,
            col1Title: s.col1Title || undefined, col1Body: s.col1Body || undefined,
            col2Title: s.col2Title || undefined, col2Body: s.col2Body || undefined,
            col3Title: s.col3Title || undefined, col3Body: s.col3Body || undefined,
            quadrants: s.quadrants.length ? s.quadrants : undefined,
            timelineItems: s.timelineItems.length ? s.timelineItems : undefined,
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

        // Optional audio activity (one per deck). Generated AFTER all slides
        // stream in so the user can see the deck while TTS runs in the background.
        if (body.includeAudio && !closed) {
          console.log("[generate-slideshow] includeAudio=true — calling /api/generate-audio");
          try {
            send("status", { message: "Recording the audio activity..." });
            const audioRes = await fetch(`${req.nextUrl.origin}/api/generate-audio`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic: body.topic,
                year: body.year,
                readingLevel: body.readingLevel,
              }),
            });
            if (audioRes.ok) {
              const audioData = await audioRes.json();
              console.log("[generate-slideshow] audio generated:", { src: audioData.src, title: audioData.title });
              // Attach to a content slide near the start (slide 2 if it exists,
              // otherwise slide 1). Lets the client place it appropriately.
              const targetIndex = Math.min(1, parsed.slides.length - 1);
              // Bake theme colours into the audio object so the panel matches
              // the deck's visual style instead of hardcoded maroon.
              const palette = theme.palette;
              send("audio", {
                targetIndex,
                audio: {
                  ...audioData,
                  panelBg: palette.accent,
                  panelInk: palette.overlayText,
                  playBg: palette.background,
                  playInk: palette.text,
                  headingFont: theme.fonts.heading,
                  // Background colour for the dedicated audio slide.
                  // Use the theme's "text" colour as the slide bg so the
                  // accent-coloured audio panel pops against it (works for
                  // both light and dark themes).
                  slideBg: palette.text,
                },
              });
            } else {
              const err = await audioRes.json().catch(() => ({}));
              console.error("[generate-slideshow] /api/generate-audio failed:", audioRes.status, err);
              send("error", { message: `Audio generation failed: ${err.error ?? err.message ?? audioRes.statusText}` });
            }
          } catch (err) {
            console.error("[generate-slideshow] audio fetch threw:", err);
            send("error", { message: `Audio generation error: ${err instanceof Error ? err.message : "unknown"}` });
          }
        } else {
          console.log("[generate-slideshow] includeAudio is", body.includeAudio, "— skipping audio");
        }

        send("complete", { title: parsed.title });
      } catch (err) {
        console.error("Generation failed", err);
        send("error", { message: err instanceof Error ? err.message : "Generation failed" });
      } finally {
        try { controller.close(); } catch { /* already closed by abort */ }
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
