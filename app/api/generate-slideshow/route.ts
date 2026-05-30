import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { renderSlide, type SlideSpec, type SlideLayout } from "@/app/lib/slideshow-layouts";
import { getTheme } from "@/app/lib/slideshowThemes";
import { generateAIImage, type ImageStyle, type AIImageOrientation } from "@/app/lib/ai-image";
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
  /** Teacher-curated key vocabulary terms. When present, the vocab slide uses
   *  exactly these instead of letting the AI pick its own. */
  vocabulary?: string[];
  includeAudio?: boolean;
  includeYouTube?: boolean;
  youtubeLength?: "short" | "medium" | "long" | "any";
  imageSource?: ImageSource;
  imageStyle?: ImageStyle;
  themeId?: string;
  /** Text extracted from a teacher-supplied resource (URL or uploaded file)
   *  via /api/extract-resource. Anchors the AI to the actual lesson content. */
  resourceText?: string;
  /** Short label for the resource shown in the prompt header ("report.pdf",
   *  "wikipedia.org/wiki/..."). */
  resourceSource?: string;
  /** Curriculum alignment from the GenerateModal — country, named curriculum,
   *  grade, subject, strand. Used purely as AI prompt context so the deck
   *  targets the right area. */
  curriculum?: {
    countryName: string;
    curriculumName: string;
    grade: string;
    subject: string;
    strand: string;
  };
}

// ── OpenAI structured-output schema ──────────────────────────────────────
// New competitor-style schema. Every field is required (OpenAI strict mode);
// unused fields are passed as empty string / empty array. Legacy layouts are
// dropped from the AI's vocabulary — old decks still render fine because the
// renderer in slideshow-layouts.ts keeps the old layout cases for back-compat.
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
            "title",
            "subHook",
            "body",
            "bulletsLeadIn",
            "bullets",
            "imageQuery",
            "calloutVariant",
            "calloutLabel",
            "calloutBody",
            "badgeText",
            "blockquoteText",
            "blockquoteAttribution",
            "activityKind",
            "activityItems",
            "activityCorrectOrder",
            "activityImageQuery",
            "secondaryImageQuery",
            "secondaryBody",
            "subtitle",
          ],
          properties: {
            layout: {
              type: "string",
              enum: [
                "title-hero",
                "paper-image-right",
                "paper-image-left",
                "paper-two-images",
                "paper-image-right-badge",
                "paper-banner-image-top",
                "paper-quote",
                "paper-vocab-grid",
                "activity-ordering",
                "activity-ordering-answer",
                "activity-question",
                "activity-question-answer",
              ],
            },
            title: { type: "string" },
            // Italic sub-headline question / declarative under the title.
            subHook: { type: "string" },
            // Body paragraph(s); may contain **bold** markers. Use \n\n between
            // paragraphs. Keep each paragraph short (2-3 sentences).
            body: { type: "string" },
            // Optional one-line lead-in above bullets (e.g. "Two forces are in
            // constant battle:"). Empty when no bullets or no lead-in needed.
            bulletsLeadIn: { type: "string" },
            // Bullet items. Each item may use **bold** for the leading noun.
            // Empty array for slides that don't use a list.
            bullets: { type: "array", items: { type: "string" } },
            // 2-4 concrete nouns describing the slide's photo. Empty for
            // activity-ordering / activity-ordering-answer (no image).
            imageQuery: { type: "string" },
            // Callout card. variant is one of "key" | "remember" | "fun" — or
            // empty string if no callout on this slide. Body may include
            // **bold**.
            calloutVariant: { type: "string", enum: ["key", "remember", "fun", ""] },
            calloutLabel: { type: "string" },
            calloutBody: { type: "string" },
            // Sub-genre badge (e.g. "STAR DYNAMICS"). Empty for slides without.
            badgeText: { type: "string" },
            // Closing-slide italic quote + attribution. Only on paper-quote
            // layout; empty otherwise.
            blockquoteText: { type: "string" },
            blockquoteAttribution: { type: "string" },
            // Activity content. activityKind is "order" | "question" | "" for
            // non-activity slides.
            activityKind: { type: "string", enum: ["order", "question", ""] },
            // For "order" question slide: the 4 items in RANDOM presentation
            // order. For "order" answer slide: same 4 items, same RANDOM order
            // — `activityCorrectOrder` carries the indices to sort by.
            // For "question" question slide: empty array (the question lives in
            // `body`). For "question" answer slide: 3-5 "you might have said"
            // bullets.
            activityItems: { type: "array", items: { type: "string" } },
            // Indices into `activityItems` that put them in the correct order.
            // Empty unless layout is activity-ordering-answer.
            activityCorrectOrder: { type: "array", items: { type: "integer" } },
            // Image for activity-question slides. Empty for other layouts.
            activityImageQuery: { type: "string" },
            // Second image for paper-two-images. Empty otherwise.
            secondaryImageQuery: { type: "string" },
            // Second body for paper-two-images (the label/paragraph under the
            // right cell). Empty otherwise. The left cell's label/paragraph is
            // in the main `body` field.
            secondaryBody: { type: "string" },
            // Subtitle line; only used by title-hero (slide 1).
            subtitle: { type: "string" },
          },
        },
      },
    },
  },
} as const;

interface AISlideSpec {
  layout: SlideLayout;
  title: string;
  subHook: string;
  body: string;
  bulletsLeadIn: string;
  bullets: string[];
  imageQuery: string;
  calloutVariant: "key" | "remember" | "fun" | "";
  calloutLabel: string;
  calloutBody: string;
  badgeText: string;
  blockquoteText: string;
  blockquoteAttribution: string;
  activityKind: "order" | "question" | "";
  activityItems: string[];
  activityCorrectOrder: number[];
  activityImageQuery: string;
  secondaryImageQuery: string;
  secondaryBody: string;
  subtitle: string;
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
  const mime = imgRes.headers.get("content-type") || "image/jpeg";
  // Upload to Supabase Storage and return its public URL. We used to inline
  // the image as a base64 data URL, but that bloated slides to many MB each
  // and tripped Postgres' statement timeout. URLs are tiny + CDN-cached.
  try {
    const { uploadImageBytes } = await import("@/app/lib/imageStorage");
    const bytes = new Uint8Array(buf);
    const publicUrl = await uploadImageBytes(bytes, mime, "pixabay");
    return { dataUrl: publicUrl, width: hit.imageWidth, height: hit.imageHeight };
  } catch (err) {
    console.error("Pixabay → Storage upload failed:", err);
    return null;
  }
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

async function searchPixabay(
  query: string,
  orientation: AIImageOrientation = "landscape",
): Promise<FetchedImage | null> {
  const key = process.env.NEXT_PUBLIC_PIXABAY_KEY;
  if (!key || !query.trim()) return null;
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  // Pixabay supports horizontal | vertical | all. "all" for square because
  // there's no native square filter — we score square-ness in scoreHit below.
  const pbOrient = orientation === "landscape" ? "horizontal"
                 : orientation === "portrait"  ? "vertical"
                 :                                "all";
  // Target aspect we score hits against. Landscape ~1.5, portrait ~0.67, square 1.
  const targetAspect = orientation === "landscape" ? 1.5
                     : orientation === "portrait"  ? 0.67
                     :                                1.0;
  try {
    const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=20&image_type=all&safesearch=true&orientation=${pbOrient}&order=popular`;
    const r = await fetch(url);
    const data: { hits?: PixabayHit[] } = await r.json();
    const hits = data.hits ?? [];
    if (hits.length === 0) return null;
    // Rank by tag-overlap AND closeness to the target aspect — so a square
    // request gets a near-square hit instead of a panoramic one that
    // cover-fits awkwardly into the frame.
    const ranked = hits
      .map((h) => {
        const aspect = h.imageWidth / Math.max(1, h.imageHeight);
        // Aspect penalty: 0 when perfect, grows as we drift away.
        const aspectPenalty = Math.abs(Math.log(aspect / targetAspect)) * 1.5;
        return { hit: h, score: scoreHit(h, queryWords) - aspectPenalty };
      })
      .sort((a, b) => b.score - a.score);
    return await fetchHit(ranked[0].hit);
  } catch { return null; }
}

async function fetchImageForSlide(
  query: string,
  source: ImageSource,
  style: ImageStyle,
  orientation: AIImageOrientation,
  index: number,
  slideTitle?: string,
): Promise<(FetchedImage & { provider: "ai" | "web" }) | null> {
  const tryAI = async () => {
    const r = await generateAIImage(query, style, orientation, slideTitle);
    return r ? { ...r, provider: "ai" as const } : null;
  };
  const tryWeb = async () => {
    const r = await searchPixabay(query, orientation);
    return r ? { ...r, provider: "web" as const } : null;
  };
  if (source === "web") return tryWeb();
  if (source === "ai") return tryAI();
  // auto: Pixabay first (fast, ~200ms) — AI fallback only when Pixabay misses.
  // This means most slides get an image quickly; AI fills the gaps.
  void index;
  return (await tryWeb()) ?? tryAI();
}

// Map a slide's layout to the orientation that best fits where the AI image
// will land. Anything that occupies the whole slide (title cover hero,
// image-full) is landscape — the slide canvas is 1280×720 (1.78). Anything
// that fits in a side panel (image-left/right, promoted bullets/body) lands
// in a ~560×600 frame (0.93), which is best generated as square so the
// composition doesn't get cropped.
function orientationForLayout(layout: SlideLayout): AIImageOrientation {
  switch (layout) {
    case "title-cover":
    case "image-full":
    case "paper-banner-image-top":
      return "landscape";
    case "paper-two-images":
      // Each cell is 520×280 (1.86:1) — landscape AI (1.5:1) cover-fits much
      // more naturally than square (1:1), which crops ~50% of the height.
      return "landscape";
    default:
      return "square";
  }
}

/** Fisher-Yates shuffle — returns a new array. */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tiny promise-concurrency limiter — caps the number of in-flight
 *  `slideJob` calls so we don't fire 9+ simultaneous gpt-image-1 calls and
 *  trip OpenAI's image-gen rate limit. */
function pLimit(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) { active++; fn(); }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => fn().then(resolve, reject).finally(next);
      if (active < max) { active++; run(); }
      else queue.push(run);
    });
}

// ── Streaming JSON parser for OpenAI slide responses ────────────────────
// OpenAI's structured-output completion can be slow (10-30s for a long deck).
// Streaming lets us emit each slide to the client as soon as the AI finishes
// writing it, instead of waiting for the whole response. This parser scans
// the streamed string for complete top-level slide objects inside the
// `"slides": [ ... ]` array using brace-depth tracking that survives string
// literals + escape characters.

class SlideStreamParser {
  private buffer = "";
  private scanPos = 0;
  private inSlides = false;
  private depth = 0;
  private inString = false;
  private escape = false;
  private objStart = -1;
  /** First non-empty match for the top-level `"title": "..."` field. */
  title: string | null = null;

  /** Feeds a chunk of text into the parser and returns any newly-completed
   *  slide objects. */
  feed(chunk: string): AISlideSpec[] {
    this.buffer += chunk;
    const found: AISlideSpec[] = [];

    if (this.title === null) {
      // Match the FIRST top-level "title": "..." pair. The `^|\{` ensures we
      // don't accidentally pick up "title" inside a nested slide object.
      const m = this.buffer.match(/(?:^|\{)\s*"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) {
        try { this.title = JSON.parse(`"${m[1]}"`); } catch { /* ignore */ }
      }
    }

    if (!this.inSlides) {
      const start = this.buffer.indexOf('"slides"');
      if (start === -1) return found;
      const openBracket = this.buffer.indexOf("[", start);
      if (openBracket === -1) return found;
      this.scanPos = openBracket + 1;
      this.inSlides = true;
    }

    while (this.scanPos < this.buffer.length) {
      const ch = this.buffer[this.scanPos];
      if (this.escape) {
        this.escape = false;
        this.scanPos++;
        continue;
      }
      if (this.inString) {
        if (ch === "\\") this.escape = true;
        else if (ch === '"') this.inString = false;
        this.scanPos++;
        continue;
      }
      if (ch === '"') { this.inString = true; this.scanPos++; continue; }
      if (ch === "{") {
        if (this.depth === 0) this.objStart = this.scanPos;
        this.depth++;
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.objStart !== -1) {
          const objStr = this.buffer.slice(this.objStart, this.scanPos + 1);
          try {
            const slide = JSON.parse(objStr) as AISlideSpec;
            found.push(slide);
          } catch {
            // Malformed — skip it. Strict schema should prevent this from
            // happening but be defensive.
          }
          this.objStart = -1;
        }
      }
      this.scanPos++;
    }
    return found;
  }
}

// ── Prompt builder ───────────────────────────────────────────────────────

/** How many activity *pairs* (question + answer = 2 slides each) to bake into
 *  a deck of N content slides. Matches the competitor: ~2 pairs on a 10-slide
 *  deck. Falls off gracefully for tiny decks so we don't over-pack them. */
function activityPairsForContentCount(n: number): number {
  if (n >= 4) return 2;
  if (n >= 2) return 1;
  return 0;
}

function buildPrompt(body: RequestBody): string {
  // SLIDE COUNT CONTRACT:
  // The user asks for N "content slides". We honor that as the requested
  // content count, then add:
  //   - 2 activity pairs (4 extra slides) when N >= 4
  //   - 1 activity pair (2 extra slides) when N is 2-3
  //   - 0 activity pairs for N=1
  // Audio + YouTube extras are appended separately (post-AI), so they don't
  // count toward the AI's emitted slide budget.
  const contentTarget = Math.max(1, Math.min(15, body.slideCount ?? 8));
  const activityPairs = activityPairsForContentCount(contentTarget);
  const totalAiSlides = contentTarget + activityPairs * 2;
  const theme = getTheme(body.themeId);
  const yearLine = body.year ? `Audience: UK ${body.year} pupils.` : "";
  const readingLine = body.readingLevel && body.readingLevel !== "Same as Year"
    ? `Reading level: ${body.readingLevel}.`
    : "";
  const extraLine = body.additionalInstructions?.trim()
    ? `Additional instructions from the teacher: ${body.additionalInstructions.trim()}`
    : "";
  // Curriculum alignment — only emitted when the user toggled it on in the
  // generate modal AND picked subject + strand. Tells the AI to ground the
  // deck in a specific syllabus area.
  const curriculumLine = body.curriculum && body.curriculum.subject && body.curriculum.strand
    ? `Curriculum alignment: ${body.curriculum.countryName} · ${body.curriculum.curriculumName}${body.curriculum.grade ? " · " + body.curriculum.grade : ""} · subject "${body.curriculum.subject}", strand "${body.curriculum.strand}". Anchor the deck's vocabulary, examples, and depth in this strand — DO NOT drift into other strands or subjects.`
    : "";
  // Teacher-supplied resource (URL / PDF / DOCX / TXT) extracted server-side.
  // Pasted verbatim into the prompt as base material so the AI uses the
  // teacher's actual content rather than improvising from the topic alone.
  const resourceBlock = body.resourceText?.trim()
    ? `\n\n--- LESSON MATERIAL (provided by the teacher${body.resourceSource ? " from " + body.resourceSource : ""}) ---\n${body.resourceText.trim()}\n--- END MATERIAL ---\n\nBase the deck's facts, examples, and structure on this material. Where the material is silent on something, you may add general context — but the material's content is the source of truth.`
    : "";
  const objectivesLine = body.includeObjectives
    ? `⚠️ MANDATORY — LEARNING OBJECTIVES SLIDE:
Slide 2 MUST be a "paper-image-right" or "paper-image-left" content slide dedicated entirely to the deck's learning objectives. This is NON-NEGOTIABLE — do not skip it, do not fold it into another slide.
   · title: a creative title like "What We'll Discover Today" or "Your Learning Journey"
   · subHook: "By the end of this lesson, you'll be able to:" (or similar forward-looking framing)
   · body: MUST be empty string "" — no prose introduction
   · bullets: REQUIRED 3-5 short bold-led objective statements. Each MUST start with a strong action verb wrapped in **bold**, then complete the sentence in plain text. Examples (DO NOT copy these verbatim, use your own topic):
       "**Describe** the stages of the cell cycle."
       "**Explain** why mitosis is essential for growth and repair."
       "**Identify** the key features of each phase of mitosis."
       "**Understand** how genetically identical daughter cells are produced."
   · imageQuery: an image that represents learning or discovery for the topic
   · calloutVariant: "key", calloutBody: a one-sentence motivating summary of the session

DO NOT leave bullets empty. DO NOT put the objectives in body. This slide's WHOLE PURPOSE is the bulleted list of objectives.`
    : "";
  const curatedVocab = (body.vocabulary ?? []).map((t) => t.trim()).filter(Boolean);
  // When includeVocab is on, the deck MUST emit a "paper-vocab-grid" slide.
  // The layout overloads existing fields to avoid schema bloat:
  //   activityItems[0..2] = 3 terms (one per column)
  //   bullets[0..2]       = 3 definitions (paired by index)
  //   imageQuery          = column 1 image (the first term)
  //   secondaryImageQuery = column 2 image (the second term)
  //   activityImageQuery  = column 3 image (the third term)
  const vocabLine = body.includeVocab
    ? curatedVocab.length > 0
      ? `⚠️ MANDATORY — KEY VOCABULARY SLIDE:
The deck MUST include EXACTLY ONE slide with layout "paper-vocab-grid", placed in the first half of the deck (typically slide 3). It is a 3-column visual vocabulary grid. The teacher has selected these terms: ${curatedVocab.join(", ")}. Pick the THREE most essential and use them — if more than 3 were given, pick the top 3 by centrality to the topic.
   · title: "Key Vocabulary" (or topic-flavoured like "Words to Know" / "Essential Vocabulary")
   · activityItems: EXACTLY 3 strings — the three terms, in the order they'll appear in the columns.
   · bullets: EXACTLY 3 strings — the three definitions, paired by index with activityItems. Each definition is ONE short sentence (≤ 14 words). Plain text, no **bold** markers.
   · imageQuery: 2-4 concrete nouns that depict activityItems[0] (column 1).
   · secondaryImageQuery: 2-4 concrete nouns that depict activityItems[1] (column 2).
   · activityImageQuery: 2-4 concrete nouns that depict activityItems[2] (column 3).
   · body, subHook, bulletsLeadIn, callout*, badge*, blockquote*, activityKind, activityCorrectOrder, secondaryBody, subtitle — all empty/empty-array.
This is NON-NEGOTIABLE. Do NOT introduce vocabulary inline on other slides — the grid is the deck's vocabulary moment.`
      : `⚠️ MANDATORY — KEY VOCABULARY SLIDE:
The deck MUST include EXACTLY ONE slide with layout "paper-vocab-grid", placed in the first half of the deck (typically slide 3). It is a 3-column visual vocabulary grid. Pick the THREE most essential terms students need to understand the topic.
   · title: "Key Vocabulary" (or topic-flavoured like "Words to Know" / "Essential Vocabulary")
   · activityItems: EXACTLY 3 strings — the three terms.
   · bullets: EXACTLY 3 strings — the three definitions, paired by index. Each definition is ONE short sentence (≤ 14 words). Plain text, no **bold** markers.
   · imageQuery / secondaryImageQuery / activityImageQuery: 2-4 concrete nouns depicting the 3 terms in order (column 1, 2, 3).
   · body, subHook, bulletsLeadIn, callout*, badge*, blockquote*, activityKind, activityCorrectOrder, secondaryBody, subtitle — all empty/empty-array.
This is NON-NEGOTIABLE. Do NOT introduce vocabulary inline on other slides — the grid is the deck's vocabulary moment.`
    : "";

  // Deck spine description varies with activityPairs to avoid telling the AI
  // to emit pairs when there's no room for them.
  const activityDirective = activityPairs === 2
    ? `Inject TWO activity pairs into the deck — one at roughly 1/3 of the way through, one at roughly 2/3:
  (1) An "activity-ordering" slide immediately followed by an "activity-ordering-answer" slide. Same title on both. The student is asked to put 4 items in order (closest-to-furthest, smallest-to-largest, oldest-to-newest, etc). imageQuery is EMPTY on both ordering slides.
  (2) An "activity-question" slide immediately followed by an "activity-question-answer" slide. Same title on both ("Critical Thinking: ..." works well). An open-ended question students should think about, paired with 3-5 plausible "you might have said" responses on the answer slide. activityImageQuery is REQUIRED on the activity-question slide (the photo inside the speech bubble). activityImageQuery is EMPTY on the answer slide.`
    : activityPairs === 1
    ? `Inject ONE activity pair into the deck — placed roughly halfway through:
  An "activity-question" slide immediately followed by an "activity-question-answer" slide. Same title on both. An open-ended critical-thinking question paired with 3-5 plausible "you might have said" responses on the answer slide. activityImageQuery REQUIRED on the question slide; empty on the answer slide.`
    : `Do not include any activity-ordering or activity-question slides — the deck is too short.`;

  return `You are a senior pedagogical lesson designer for UK classrooms. Produce a single slideshow JSON for the topic: "${body.topic}".

${yearLine}
${readingLine}
${curriculumLine}
${extraLine}
${resourceBlock}

═══════════════════════════════════════════════════
DECK SPINE — emit slides in this exact order. EVERY content layout requires an image.
═══════════════════════════════════════════════════
1.   "title-hero"   — the opener. Creative deck title + one-line subtitle. **imageQuery REQUIRED**: the hero photo of the topic's most iconic object.
${objectivesLine ? `2.   LEARNING OBJECTIVES SLIDE — see mandatory spec below.\n` : ""}2${objectivesLine ? `+` : ""}..N CONTENT SLIDES — pick layouts from this menu and vary them; do NOT repeat the same layout more than twice in a row. EVERY ONE OF THESE LAYOUTS REQUIRES an imageQuery:
     · "paper-image-right"          — heading + sub-hook + body (+ optional callout) on the LEFT; PHOTO on the RIGHT. imageQuery REQUIRED.
     · "paper-image-left"           — image LEFT, text RIGHT (heading + body + bullets + callout). imageQuery REQUIRED.
     · "paper-two-images"           — heading + intro text on top; TWO image+paragraph cells below. imageQuery AND secondaryImageQuery REQUIRED.
     · "paper-image-right-badge"    — heading + brown BADGE + body + bullets, with image RIGHT. imageQuery AND badgeText REQUIRED.
     · "paper-banner-image-top"     — wide banner PHOTO across the top + heading + numbered list below. imageQuery REQUIRED.
     · "paper-vocab-grid"           — 3-COLUMN key-vocabulary grid (image + bold term + definition per column). ONLY used when explicitly required by the KEY VOCABULARY SLIDE block below. imageQuery + secondaryImageQuery + activityImageQuery ALL REQUIRED (one per column).
LAST content slide — "paper-quote" — a perspective shift: zoom out from the topic and end with an italic attributed quote (Carl Sagan for cosmology, Darwin for biology, an inventor for technology). imageQuery REQUIRED for the right-side image. blockquoteText AND blockquoteAttribution REQUIRED.

${activityDirective}

═══════════════════════════════════════════════════
SLIDE BUDGET
═══════════════════════════════════════════════════
- ${contentTarget} content slides (slide 1 title-hero + N-1 paper-* layouts including the closing paper-quote)
- ${activityPairs * 2} activity slides (${activityPairs} pair${activityPairs === 1 ? "" : "s"})
- TOTAL: emit exactly ${totalAiSlides} slides.

═══════════════════════════════════════════════════
CONTENT QUALITY RULES — non-negotiable
═══════════════════════════════════════════════════

TITLES
- Creative + specific. "A Cosmic Balance" not "Introduction"; "Beyond the Planets" not "Other Objects".
- Banned words in titles: "Introduction", "Overview", "Conclusion", "Summary", "Lesson", "Topic".

SUB-HOOK (subHook field)
- Every content slide carries a subHook — a question or punchy declarative ABOVE the body. Examples:
  · "What keeps us from drifting away?"  · "Order matters in the inner solar system."  · "Two forces locked in battle."
- The sub-hook is in body weight; the slide title is in heading weight. Don't repeat the title.
- Empty subHook is ONLY allowed on activity slides and the title-hero.

BODY TEXT (body field)
- 2-3 short paragraphs MAX. Separate paragraphs with \\n\\n.
- Every body MUST contain at least TWO **bold** runs marking vocab students should learn. Examples:
  · "In our Solar System, **gravity** is that invisible string."
  · "The Sun is a **Main Sequence** star powered by **nuclear fusion**."
  · "Comets are 'dirty snowballs' of ice and dust that originate in the **Kuiper Belt**."
- Markers are paired \`**word**\` (two asterisks each side). The renderer parses them.

ANALOGIES (deck-wide, not per slide)
- The deck MUST include at least ONE concrete analogy grounded in an everyday object. Ball-on-a-string for gravity, peppercorn-vs-beach-ball for cosmic scale, dirty snowballs for comets, recipe for chemical reactions. Wherever possible — TWO or three.

FACTS & NUMBERS
- Weave specific numbers and named entities into prose. NEVER list them as bare facts.
- Examples: "99.8% of the total mass", "150 million km", "30 AU", "Mercury, Venus, Earth, Mars".

CALLOUTS (calloutVariant + calloutLabel + calloutBody)
- Add ONE callout to MOST content slides — vary the variant across the deck:
  · "key" (default label "Key point") — the so-what / one-line takeaway.
  · "remember" (default label "Remember") — the mental model students should hold.
  · "fun" (default label "Fun fact") — a surprising, sticky piece of trivia.
- Body may include **bold**. 1-2 sentences max.
- Leave calloutVariant as "" on slides without a callout. activity-* layouts and the title-hero do NOT take callouts.

BADGES (badgeText)
- Use 1-2 badges in the whole deck to frame a sub-genre. UPPERCASE, 2-3 words. Only on layout "paper-image-right-badge" — empty everywhere else.
- Examples: "STAR DYNAMICS", "DEEP HISTORY", "KEY CONCEPT".

LISTS (bullets + bulletsLeadIn)
- Use bullets when listing comparable factors or items. Each item LEADS WITH a **bold noun**:
  · "**Mass**: Larger masses exert stronger gravity."
  · "**Distance**: Gravity weakens with distance."
- "paper-banner-image-top" uses numbered list (the renderer numbers automatically). Lead each item with **bold noun** too.
- bulletsLeadIn (optional) is a single line above the bullets, e.g. "Two forces are in constant battle:" or "Factors affecting orbit:".

BLOCKQUOTE (blockquoteText + blockquoteAttribution)
- ONLY on the closing "paper-quote" slide. ALL OTHER slides leave both empty.
- The quote should be a humbling perspective-shift moment. Carl Sagan's "very small stage in a vast cosmic arena" for cosmology. Choose a real, attributable quote that lands the topic emotionally.

ACTIVITY-ORDERING / ACTIVITY-ORDERING-ANSWER
- activityKind: "order" on BOTH slides of the pair.
- title: same on both (e.g. "Planetary Distance").
- body: instruction text ("Order these planets by their distance from the Sun, starting with the closest.")
- activityItems: 4 strings in RANDOM presentation order. SAME 4 strings on both slides — do NOT re-order between question and answer slide.
- activityCorrectOrder: empty array [] on the question slide; on the answer slide, fill with the indices into activityItems that put them in correct order. Example: activityItems = ["Mars","Saturn","Venus","Neptune"] → activityCorrectOrder = [2, 0, 1, 3] (Venus, Mars, Saturn, Neptune).
- imageQuery: empty on both — these slides are pure activity.
- No callout, no badge, no blockquote, no body **bold** required.

ACTIVITY-QUESTION / ACTIVITY-QUESTION-ANSWER
- activityKind: "question" on BOTH slides of the pair.
- title: same on both (e.g. "Critical Thinking: The Search for Life").
- body: on the question slide, the open-ended question itself. On the answer slide, empty.
- activityItems: empty [] on the question slide; on the answer slide, 3-5 "you might have said" responses (one short sentence each).
- activityImageQuery: 2-4 concrete nouns for the image embedded in the speech bubble (question slide only). Empty on the answer slide.
- activityCorrectOrder: empty on both.
- No callout, no badge, no blockquote.

TITLE-HERO (slide 1 only)
- title: the deck title (3-6 words).
- subtitle: one tagline that frames the journey, e.g. "Exploring Our Cosmic Neighbourhood and Celestial Dynamics".
- imageQuery: 2-4 concrete nouns for the hero image of the topic's most iconic object.
- subHook, body, callout, badge, blockquote, activity*, secondary*, bullets, bulletsLeadIn — all empty.

═══════════════════════════════════════════════════
IMAGE QUERY RULES — READ CAREFULLY, THIS IS THE #1 RULE
═══════════════════════════════════════════════════
EVERY content slide MUST have a non-empty imageQuery. Empty imageQuery is a BUG. The image is what makes the slide visually rich — without it, the slide is half-empty.

Per-layout requirements (FAILURE TO COMPLY IS A BUG):
- title-hero                    → imageQuery REQUIRED (the hero image).
- paper-image-right             → imageQuery REQUIRED.
- paper-image-left              → imageQuery REQUIRED.
- paper-image-right-badge       → imageQuery REQUIRED.
- paper-banner-image-top        → imageQuery REQUIRED (wide banner photo).
- paper-quote                   → imageQuery REQUIRED (the right-side image).
- paper-two-images              → imageQuery REQUIRED (LEFT cell image) AND secondaryImageQuery REQUIRED (RIGHT cell image).
- paper-vocab-grid              → imageQuery REQUIRED (col 1) AND secondaryImageQuery REQUIRED (col 2) AND activityImageQuery REQUIRED (col 3). Each query depicts ITS column's term, not the slide title.
- activity-question             → activityImageQuery REQUIRED (the photo inside the speech bubble). imageQuery may be empty.
- activity-question-answer      → both image queries empty.
- activity-ordering             → both image queries empty.
- activity-ordering-answer      → both image queries empty.

Query format (applies to imageQuery, secondaryImageQuery, activityImageQuery):
- 2-4 CONCRETE NOUNS that directly depict the slide's central concept. MUST include the subject-matter word from the slide title.
- Never generic terms like "planets", "people", "science", "education", "student", "teacher", or "classroom".
- Bad: "planets" → too vague. "space science" → too abstract.
- Good: "mercury venus mars rocky planet surface" (for a slide titled "The Rocky Four").
- Good: "earth cross-section crust mantle core diagram" (for a slide about Earth's interior).
- For DIAGRAMS (orbits, anatomy, cycles), include "diagram" or "infographic", e.g. "elliptical orbit diagram labeled".
- For activity-question slides, choose an image that directly illustrates the question's scenario — not a general topic image.

═══════════════════════════════════════════════════
PAPER-TWO-IMAGES SPECIFIC
═══════════════════════════════════════════════════
- body: the paragraph under the LEFT image cell. Lead with **bold noun**.
- secondaryBody: the paragraph under the RIGHT image cell. Lead with **bold noun**.
- imageQuery: the LEFT image. secondaryImageQuery: the RIGHT image.
- title + an intro line (in body's first paragraph) can sit above both cells — use \\n\\n to separate the intro from the left-cell paragraph.

═══════════════════════════════════════════════════
FIELDS THAT MUST BE EMPTY
═══════════════════════════════════════════════════
- ALL fields are required in the schema. Use empty string "" or empty array [] for fields that don't apply.
- Never omit a field.

═══════════════════════════════════════════════════
TONE & LANGUAGE
═══════════════════════════════════════════════════
- British English. Spell "vaporises", "prioritise", "neighbourhood", "behaviour", "colour", "centre".
- Vivid, direct verbs. Avoid filler ("As we can see", "It is important to note that").
- Tone is science-textbook-meets-storyteller: rigorous facts, warm voice.

${objectivesLine}

${vocabLine}

═══════════════════════════════════════════════════
DECK TITLE
═══════════════════════════════════════════════════
- A short, evocative title (3-6 words). Same kind of title as the title-hero slide title — use the same string.

Now produce the JSON.`;
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

        // Pre-compute everything the AI->Spec mapping needs that doesn't
        // depend on a specific slide, so we can reuse it per-slide as the
        // stream feeds slides in.
        const imageRequiredLayouts = new Set<SlideLayout>([
          "title-hero",
          "paper-image-right",
          "paper-image-left",
          "paper-image-right-badge",
          "paper-banner-image-top",
          "paper-quote",
          "paper-two-images",
          "paper-vocab-grid",
        ]);
        const synthQuery = (slideTitle: string) => {
          const cleaned = (slideTitle || body.topic)
            .replace(/[:;,!?]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return `${body.topic.toLowerCase()} ${cleaned}`.slice(0, 80);
        };
        const buildSpec = (s: AISlideSpec): SlideSpec => {
          const isTwoImages = s.layout === "paper-two-images";
          const isActivityQuestion = s.layout === "activity-question";
          const isVocabGrid = s.layout === "paper-vocab-grid";
          const aiQuery = s.imageQuery?.trim();
          // Vocab-grid needs all 3 image queries; if any is missing, synth from
          // the matching term (more specific than the slide title for column 2/3).
          const vocabTerms = isVocabGrid ? (s.activityItems ?? []) : [];
          const vocabTermFor = (i: number) => (vocabTerms[i] || "").trim();
          const finalImageQuery = imageRequiredLayouts.has(s.layout) && !aiQuery
            ? (isVocabGrid && vocabTermFor(0)
                ? `${body.topic.toLowerCase()} ${vocabTermFor(0)}`.slice(0, 80)
                : synthQuery(s.title))
            : aiQuery || undefined;
          const aiActivityQuery = s.activityImageQuery?.trim();
          const finalActivityImageQuery = (isActivityQuestion || isVocabGrid) && !aiActivityQuery
            ? (isVocabGrid && vocabTermFor(2)
                ? `${body.topic.toLowerCase()} ${vocabTermFor(2)}`.slice(0, 80)
                : synthQuery(s.title))
            : aiActivityQuery || undefined;
          const aiSecondaryQuery = s.secondaryImageQuery?.trim();
          const finalSecondaryImageQuery = (isTwoImages || isVocabGrid) && !aiSecondaryQuery
            ? (isVocabGrid && vocabTermFor(1)
                ? `${body.topic.toLowerCase()} ${vocabTermFor(1)}`.slice(0, 80)
                : synthQuery(s.title))
            : aiSecondaryQuery || undefined;
          return {
            layout: s.layout,
            colorScheme: "light",
            accentColor: theme.palette.accent,
            title: s.title,
            subtitle: s.subtitle || undefined,
            body: s.body || undefined,
            bullets: s.bullets.length ? s.bullets : undefined,
            bulletsLeadIn: s.bulletsLeadIn || undefined,
            imageQuery: finalImageQuery,
            subHook: s.subHook || undefined,
            calloutVariant: s.calloutVariant || undefined,
            calloutLabel: s.calloutLabel || undefined,
            calloutBody: s.calloutBody || undefined,
            badgeText: s.badgeText || undefined,
            blockquoteText: s.blockquoteText || undefined,
            blockquoteAttribution: s.blockquoteAttribution || undefined,
            activityKind: s.activityKind || undefined,
            activityItems: s.activityItems.length ? s.activityItems : undefined,
            activityCorrectOrder: s.activityCorrectOrder.length ? s.activityCorrectOrder : undefined,
            activityImageQuery: finalActivityImageQuery,
            secondaryImageQuery: finalSecondaryImageQuery,
            twoColLeftBody: isTwoImages ? (s.body || undefined) : undefined,
            twoColRightBody: isTwoImages ? (s.secondaryBody || undefined) : undefined,
            imagePending: !!finalImageQuery,
          };
        };
        const toSkeleton = (s: SlideSpec) => {
          const { imageDataUrl: _idu, imageWidth: _iw, imageHeight: _ih, imagePending: _ip, accentColor: _ac, ...rest } = s;
          return rest;
        };

        // Compute expected total slide count from the prompt's budget so we
        // can send "meta" early (before the AI finishes generating).
        const expectedContentTarget = Math.max(1, Math.min(15, body.slideCount ?? 8));
        const expectedActivityPairs = activityPairsForContentCount(expectedContentTarget);
        const expectedTotalAi = expectedContentTarget + expectedActivityPairs * 2;

        // Reserved mid-deck slots for the audio activity (+ its answer slide)
        // and the YouTube video. We pin them to fixed final positions starting
        // at the 3rd slide, stream the AI content slides AROUND those positions,
        // and emit shimmer placeholders for them up front — so they appear in
        // place from the start and just fill in last, instead of popping in at
        // the end and shoving content down.
        const reserved: { kind: "audio" | "audio-answer" | "video"; index: number }[] = [];
        {
          let cursor = Math.min(2, expectedTotalAi); // 3rd slide (index 2), or end on tiny decks
          if (body.includeAudio) {
            reserved.push({ kind: "audio", index: cursor++ });
            reserved.push({ kind: "audio-answer", index: cursor++ });
          }
          if (body.includeYouTube) {
            reserved.push({ kind: "video", index: cursor++ });
          }
        }
        const reservedSet = new Set(reserved.map((r) => r.index));
        const audioIndex = reserved.find((r) => r.kind === "audio")?.index;
        const answerIndex = reserved.find((r) => r.kind === "audio-answer")?.index;
        const videoIndex = reserved.find((r) => r.kind === "video")?.index;
        // Walks final positions for content slides, skipping the reserved slots.
        let contentCursor = 0;
        const nextContentIndex = () => {
          while (reservedSet.has(contentCursor)) contentCursor++;
          return contentCursor++;
        };

        const expectedFinalTotal = expectedTotalAi + reserved.length;
        const extraTitles: string[] = [];
        if (body.includeAudio) extraTitles.push("Audio activity", "Audio activity — answers");
        if (body.includeYouTube) extraTitles.push("YouTube video");

        // Image-fetch helper — kicks off the (up to three) image fetches for
        // a slide and emits a "slide-image" event when each settles. Defined
        // here so it's in scope when the streaming loop below calls it as
        // soon as each slide arrives from the AI. Always sends a final
        // "slide-image" even on partial failure so the client clears the
        // shimmer placeholder.
        const slideJob = async (spec: SlideSpec, idx: number) => {
          if (closed) return;
          if (!spec.imageQuery && !spec.secondaryImageQuery && !spec.activityImageQuery) return;
          const filled: SlideSpec = { ...spec, imagePending: false };
          const galleryImages: { prompt: string; style?: string; dataUrl: string }[] = [];

          // Wrap each fetch in its own try so one failure doesn't kill the
          // others. The slide can still render with the partial set of images
          // that did succeed.
          const safeFetch = async (q: string, ori: AIImageOrientation, jobIdx: number) => {
            try {
              return await fetchImageForSlide(q, imageSource, imageStyle, ori, jobIdx, spec.title);
            } catch (err) {
              console.warn(`[slideJob ${idx}] image fetch failed for "${q}":`, err);
              return null;
            }
          };

          // Note: NO `if (closed) return;` between fetches anymore. Bailing
          // mid-job means the slide stays stuck in its initial `isPending:true`
          // state on the persisted side because the final "slide-image" event
          // never fires. We let each fetch complete (cheap async noop if the
          // network call has already started) and always fire the final event.
          // `send()` itself silently drops when the controller is closed.
          if (spec.imageQuery) {
            const img = await safeFetch(spec.imageQuery, orientationForLayout(spec.layout), idx);
            if (img) {
              filled.imageDataUrl = img.dataUrl;
              filled.imageWidth = img.width;
              filled.imageHeight = img.height;
              if (img.provider === "ai") galleryImages.push({ prompt: spec.imageQuery, style: imageStyle, dataUrl: img.dataUrl });
            }
          }

          if (spec.secondaryImageQuery) {
            const img2 = await safeFetch(spec.secondaryImageQuery, "square", idx + 100);
            if (img2) {
              filled.secondaryImageDataUrl = img2.dataUrl;
              filled.secondaryImageWidth = img2.width;
              filled.secondaryImageHeight = img2.height;
              if (img2.provider === "ai") galleryImages.push({ prompt: spec.secondaryImageQuery, style: imageStyle, dataUrl: img2.dataUrl });
            }
          }

          if (spec.activityImageQuery) {
            const img3 = await safeFetch(spec.activityImageQuery, "square", idx + 200);
            if (img3) {
              filled.activityImageDataUrl = img3.dataUrl;
              filled.activityImageWidth = img3.width;
              filled.activityImageHeight = img3.height;
              if (img3.provider === "ai") galleryImages.push({ prompt: spec.activityImageQuery, style: imageStyle, dataUrl: img3.dataUrl });
            }
          }

          // ALWAYS send the final "slide-image" so the client clears the
          // shimmer, even if every fetch failed (the slide just falls back to
          // a blank frame instead of staying in the pending state forever).
          const updated = renderSlide(filled, theme);
          const primary = galleryImages[0];
          send("slide-image", { index: idx, slide: updated, galleryImage: primary });
          for (let g = 1; g < galleryImages.length; g++) {
            send("slide-image", { index: idx, slide: updated, galleryImage: galleryImages[g] });
          }
        };

        const client = getOpenAI();
        const stream = await client.chat.completions.create({
          model: "gpt-4o-2024-08-06",
          messages: [
            { role: "system", content: "You are a senior pedagogical lesson designer creating UK classroom slideshows. Your output is structured JSON. Your style is vivid, specific, and memorable — every slide should feel like it was designed by a thoughtful teacher who understands their audience." },
            { role: "user", content: buildPrompt(body) },
          ],
          response_format: { type: "json_schema", json_schema: slideshowSchema },
          stream: true,
        });

        const parser = new SlideStreamParser();
        const allAi: AISlideSpec[] = [];
        const allSpecs: SlideSpec[] = [];
        const imageJobs: Promise<void>[] = [];
        // Cap parallel image fetches. AI image gen tier-1 limits are tight
        // (~5-10 images/min) — firing 9-12 in parallel triggered silent 429s
        // that left slides stuck in their shimmer state.
        const imageLimit = pLimit(5);
        let metaSent = false;
        // Shuffle map for ordering activities: keyed by slide title so the
        // answer slide gets the same shuffled items as the question slide.
        const orderingShuffleMap = new Map<string, { shuffled: string[]; correctSeq: string[] }>();

        const sendMetaIfReady = () => {
          if (metaSent) return;
          if (!parser.title) return;
          metaSent = true;
          send("meta", {
            title: parser.title,
            total: expectedFinalTotal,
            // We don't know the real titles yet — populate placeholders that
            // get filled in as each slide arrives. The client uses these
            // for the slide-tray labels during streaming.
            slideTitles: [
              ...Array.from({ length: expectedTotalAi }, (_, i) => `Slide ${i + 1}`),
              ...extraTitles,
            ],
          });
          // Reserve the audio/answer/video slots up front so they show shimmer
          // placeholders at their final positions while content streams in.
          const palette = theme.palette;
          for (const r of reserved) {
            if (r.kind === "audio") {
              send("audio-placeholder", {
                index: r.index,
                slideBg: palette.background,
                slideTextColor: palette.text,
                panelBg: palette.accent,
                panelInk: palette.overlayText,
                playBg: palette.background,
                playInk: palette.text,
                headingFont: theme.fonts.heading,
              });
            } else if (r.kind === "audio-answer") {
              send("audio-answer-placeholder", {
                index: r.index,
                slideBg: palette.background,
                slideTextColor: palette.text,
                headingFont: theme.fonts.heading,
              });
            } else if (r.kind === "video") {
              send("video-placeholder", {
                index: r.index,
                slideBg: palette.background,
                titleColor: palette.accent,
                mutedColor: palette.muted,
                accent: palette.accent,
                headingFont: theme.fonts.heading,
              });
            }
          }
        };

        for await (const chunk of stream) {
          if (closed) break;
          const delta = chunk.choices[0]?.delta?.content;
          if (!delta) continue;
          const newSlides = parser.feed(delta);
          sendMetaIfReady();
          for (const ai of newSlides) {
            // Shuffle ordering activity items so the question slide isn't
            // already in the correct order. The AI consistently generates
            // activityItems in the intended correct sequence even though the
            // prompt asks for a random order. We fix this post-parse:
            //   - question slide: shuffle items, store the permutation.
            //   - answer slide: apply the same shuffle, derive activityCorrectOrder.
            if (ai.layout === "activity-ordering" && ai.activityItems.length > 1) {
              const correctSeq = [...ai.activityItems];
              const shuffled = shuffleArray(correctSeq);
              ai.activityItems = shuffled;
              orderingShuffleMap.set(ai.title, { shuffled, correctSeq });
            } else if (ai.layout === "activity-ordering-answer" && ai.activityItems.length > 1) {
              const stored = orderingShuffleMap.get(ai.title);
              if (stored) {
                // The AI's activityItems on the answer slide are the intended
                // correct sequence — use them as the source of truth, then
                // apply the same shuffle the question slide used.
                const correctSeq = [...ai.activityItems];
                ai.activityItems = stored.shuffled;
                ai.activityCorrectOrder = correctSeq.map((item) => stored.shuffled.indexOf(item));
              }
            }

            const ordinal = allAi.length;
            allAi.push(ai);
            const spec = buildSpec(ai);
            allSpecs.push(spec);
            // Final array index for this content slide — skips the reserved
            // audio/answer/video slots so they stay pinned in place.
            const finalIdx = nextContentIndex();

            // Diagnostic logging on the fly
            const expectsMain = !ai.layout.startsWith("activity-");
            if (expectsMain) {
              console.log(`[generate-slideshow] slide ${ordinal}→${finalIdx} (${ai.layout}) imageQuery="${ai.imageQuery}" → "${spec.imageQuery ?? ""}"`);
            }

            const slide: SlideJSON = renderSlide(spec, theme);
            slide.skeleton = toSkeleton(spec);
            if (finalIdx === 0) slide.themeId = theme.id;
            send("slide", {
              index: finalIdx,
              total: expectedFinalTotal,
              contentTotal: expectedFinalTotal,
              slide,
              title: ai.title,
            });
            // Start fetching this slide's image(s) immediately, capped at
            // `imageLimit` concurrent jobs so we don't trip rate limits.
            imageJobs.push(imageLimit(() => slideJob(spec, finalIdx)));
          }
        }

        // The stream has fully finished. allAi now holds every slide in order.
        // If the AI emitted a different number of slides than we budgeted
        // (rare but possible — strict schema doesn't lock the array length),
        // emit a `count-correction` event with the real totals. We CAN'T
        // re-send `meta` because the client's meta handler wipes all slides
        // to a single placeholder — it's only safe at the very start. The
        // dedicated `count-correction` handler only updates the progress UI.
        const finalTotal = allAi.length + reserved.length;
        if (allAi.length !== expectedTotalAi) {
          send("count-correction", {
            total: finalTotal,
            slideTitles: [...allAi.map((s) => s.title), ...extraTitles],
          });
        }
        // Local aliases to keep the audio/video code below readable.
        const parsed = { title: parser.title ?? body.topic, slides: allAi };
        const specs = allSpecs;

        // All image jobs were kicked off during the streaming loop above —
        // wait for any still in flight before generating audio/video.
        await Promise.allSettled(imageJobs);

        // Optional audio activity. Placeholder was reserved up-front in
        // sendMetaIfReady at `audioIndex` (the audio activity) and
        // `answerIndex` (the audio-answer slide). We just generate the data
        // here and fill those slots.
        if (body.includeAudio && audioIndex !== undefined && !closed) {
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
                // Pass the content slide titles as context so the audio script
                // references specific concepts from the deck, not the broad topic.
                slideContext: allAi
                  .filter((s) => !s.layout.startsWith("activity-") && s.layout !== "title-hero")
                  .slice(0, 6)
                  .map((s) => `- ${s.title}`)
                  .join("\n"),
              }),
            });
            if (audioRes.ok) {
              const audioData = await audioRes.json();
              console.log("[generate-slideshow] audio generated:", { src: audioData.src, title: audioData.title });
              // Bake theme colours into the audio object so the panel matches
              // the deck's visual style instead of hardcoded maroon.
              const palette = theme.palette;
              send("audio", {
                index: audioIndex,
                audio: {
                  ...audioData,
                  panelBg: palette.accent,
                  panelInk: palette.overlayText,
                  playBg: palette.background,
                  playInk: palette.text,
                  headingFont: theme.fonts.heading,
                  bodyFont: theme.fonts.body,
                  // Match the rest of the deck's background. Slide-level
                  // headings/desc/questions use slideTextColor for contrast.
                  slideBg: palette.background,
                  slideTextColor: palette.text,
                  // Title colour — the themed heading colour so the audio
                  // slide title reads like every other paper-* slide instead
                  // of a giant black uppercase block.
                  headingColor: palette.headingColor ?? palette.accent,
                },
              });
              // Fill the answer slide right after the activity. Server emits
              // the data; client builds the slide layout.
              if (answerIndex !== undefined) {
                send("audio-answers", {
                  index: answerIndex,
                  title: `${audioData.title ?? "Audio activity"} — answers`,
                  questions: audioData.questions ?? [],
                  answers: audioData.answers ?? [],
                  slideBg: palette.background,
                  slideTextColor: palette.text,
                  accent: palette.accent,
                  headingColor: palette.headingColor ?? palette.accent,
                  checkBadgeBg: palette.checkBadgeBg ?? "#2e9d54",
                  checkBadgeInk: palette.checkBadgeInk ?? "#ffffff",
                  headingFont: theme.fonts.heading,
                  bodyFont: theme.fonts.body,
                });
              }
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

        // Optional YouTube video. Placeholder was reserved up-front in
        // sendMetaIfReady at `videoIndex`. We just fetch the video data here
        // and fill that slot.
        if (body.includeYouTube && videoIndex !== undefined && !closed) {
          try {
            send("status", { message: "Finding a YouTube video..." });
            const ytRes = await fetch(`${req.nextUrl.origin}/api/find-youtube`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic: body.topic,
                year: body.year,
                readingLevel: body.readingLevel,
                // Default to medium-length (4-20 min) rather than "any" so the
                // YouTube API itself filters out Shorts and lecture-length
                // videos. Users can still override via the modal.
                length: body.youtubeLength ?? "medium",
                // Pass the deck's title + slide titles so the search query
                // matches what the presentation actually covers.
                deckTitle: parsed.title,
                slideTitles: parsed.slides.map((s) => s.title).slice(0, 8),
              }),
            });
            if (ytRes.ok) {
              const yt: {
                videoId: string; title: string; channel: string; description: string;
                slideHeading?: string; slideSubtitle?: string;
              } = await ytRes.json();
              send("video", {
                index: videoIndex,
                // Title colour for the YouTube slide — matches paper-* slide
                // headings instead of cream-on-dark.
                headingColor: theme.palette.headingColor ?? theme.palette.accent,
                bodyFont: theme.fonts.body,
                video: {
                  videoId: yt.videoId,
                  title: yt.title,
                  channel: yt.channel,
                  description: yt.description,
                  slideHeading: yt.slideHeading ?? `WATCH: ${body.topic.toUpperCase()}`,
                  slideSubtitle: yt.slideSubtitle ?? "Let's watch this together to deepen our understanding.",
                },
                // Match the rest of the deck: single theme bg, heading in
                // accent, subtitle in muted.
                slideBg: theme.palette.background,
                titleColor: theme.palette.accent,
                mutedColor: theme.palette.muted,
                accent: theme.palette.accent,
                headingFont: theme.fonts.heading,
              });
            } else {
              const err = await ytRes.json().catch(() => ({}));
              console.warn("[generate-slideshow] /api/find-youtube failed:", ytRes.status, err);
            }
          } catch (err) {
            console.warn("[generate-slideshow] youtube fetch threw:", err);
          }
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
