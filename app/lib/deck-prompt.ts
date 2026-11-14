// The deck prompt and its strict JSON schema, pure so they can be tested.
//
// Moved verbatim out of app/lib/slideshow-pipeline.ts (which imports server
// code a unit test cannot load). The pupil deck's prompt and schema are
// unchanged by the move; tests/unit/deck-prompt.spec.ts pins them.

import { getTheme } from "@/app/lib/slideshowThemes";
import { curriculumPromptBlock, curriculumStatementTexts, deckCurriculumRules } from "@/app/lib/national-curriculum/prompt";
import type { RequestBody } from "@/app/lib/slideshow-pipeline";
import { buildStaffDeckPrompt, isStaffDeck, STAFF_DECK_LAYOUTS } from "@/app/lib/staff-deck-prompt";

export { STAFF_DECK_LAYOUTS };

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
                "activity-multichoice",
                "activity-multichoice-answer",
                "activity-vocab-match",
                "activity-vocab-match-answer",
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

// When the teacher pastes their own video, the deck call also writes that
// slide's heading and subtitle, and says where the video belongs in the
// running order. Folded into THIS schema rather than a second model call: one
// request, and the heading gets written with the whole deck in view.
//
// Strict mode requires every property to be listed in `required`, so these are
// only added when there actually is a video — otherwise the model would be
// forced to invent a heading for a slide that does not exist.
/** A staff or assembly deck's schema: the pupil one with fewer layouts and
 *  speaker notes on every slide. */
function staffDeckSchema() {
  const base = slideshowSchema.schema;
  const item = base.properties.slides.items;
  return {
    ...slideshowSchema,
    schema: {
      ...base,
      properties: {
        ...base.properties,
        slides: {
          ...base.properties.slides,
          items: {
            ...item,
            required: [...item.required, "speakerNotes"],
            properties: {
              ...item.properties,
              layout: { type: "string", enum: [...STAFF_DECK_LAYOUTS] },
              speakerNotes: { type: "string" },
            },
          },
        },
      },
    },
  };
}

export function schemaFor(body: RequestBody) {
  if (isStaffDeck(body)) return staffDeckSchema();
  if (!body.youtubeVideoId) return slideshowSchema;
  const base = slideshowSchema.schema;
  return {
    ...slideshowSchema,
    schema: {
      ...base,
      required: [...base.required, "videoSlideHeading", "videoSlideSubtitle", "videoSlideAfter"],
      properties: {
        ...base.properties,
        videoSlideHeading: { type: "string" },
        videoSlideSubtitle: { type: "string" },
        // 1-based index of the content slide the video should follow. 0 means
        // "no preference", and we fall back to the default slot.
        videoSlideAfter: { type: "integer" },
      },
    },
  };
}

// ── Prompt builder ───────────────────────────────────────────────────────

/** How many activity *pairs* (question + answer = 2 slides each) to bake into
 *  a deck of N content slides. Matches the competitor: ~2 pairs on a 10-slide
 *  deck. Falls off gracefully for tiny decks so we don't over-pack them. */
export function activityPairsForContentCount(n: number): number {
  if (n >= 4) return 2;
  if (n >= 2) return 1;
  return 0;
}

export function buildPrompt(body: RequestBody): string {
  // Staff training and assembly decks have their own prompt.
  if (isStaffDeck(body)) return buildStaffDeckPrompt(body);
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
    ? `★ PRIORITY — TEACHER'S ADDITIONAL INSTRUCTIONS: "${body.additionalInstructions.trim()}"
Apply these throughout the ENTIRE deck — they shape the tone, content, examples, vocabulary, image choices, and which slides to include. Where they conflict with the default style, the teacher's instructions WIN. Every slide should visibly reflect them, not just the title slide.`
    : "";
  // Curriculum alignment — only emitted when the user toggled it on in the
  // generate modal. With statements ticked, the deck is built to teach those
  // exact statements at that year's level; an older saved deck carries only a
  // subject and strand, and keeps the one-line version.
  const cur = body.curriculum;
  const curYear = cur?.year || cur?.grade || body.year || "";
  const curriculumLine = cur && curriculumStatementTexts(cur).length > 0
    ? curriculumPromptBlock(cur, curYear, "deck", deckCurriculumRules(curYear))
    : cur && cur.subject && cur.strand
    ? `Curriculum alignment: ${cur.countryName} · ${cur.curriculumName}${cur.grade ? " · " + cur.grade : ""} · subject "${cur.subject}", strand "${cur.strand}". Anchor the deck's vocabulary, examples, and depth in this strand — DO NOT drift into other strands or subjects.`
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
  // The teacher pasted their own video. The deck itself is still about the
  // topic — this only tells the model to write that one slide's copy and say
  // where the video belongs, so the deck is built around the video rather than
  // having it bolted on at a fixed position.
  const videoBlock = body.youtubeVideoId
    ? `
═══════════════════════════════════════════════════
THE TEACHER'S VIDEO
═══════════════════════════════════════════════════
The teacher has chosen a YouTube video to show in this lesson${body.youtubeVideoTitle ? `, titled "${body.youtubeVideoTitle}"` : ""}.${
        body.youtubeNote?.trim()
          ? `\n★ THE TEACHER SAYS WHERE IT FITS: "${body.youtubeNote.trim()}" — follow this literally.`
          : ""
      }
It gets its own slide, which is added for you AFTER your slides. Do NOT emit a slide for the video yourself. Instead return these three top-level fields, placed BEFORE "slides" in your JSON object (this matters — they are read while the deck is still streaming):
- "videoSlideHeading" — a short ALL-CAPS heading starting with "WATCH:", under 40 characters, that previews what pupils are about to see. Write it to match the teacher's note where they gave one.
- "videoSlideSubtitle" — one warm sentence, under 90 characters, setting up why they are watching it at this point in the lesson.
- "videoSlideAfter" — the 1-based number of the content slide the video should come after, so it lands where the teacher asked. Use 0 if they gave no preference. A recap or plenary video belongs near the end; a hook or introduction belongs early.
Where the video's subject overlaps a slide you were going to write, still write that slide: the video supports the lesson, it does not replace teaching.
`
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
  // ── Activity type menu (used in both 1-pair and 2-pair directives) ──
  const activityTypeMenu = `
ACTIVITY TYPES — pick the best fit for the topic each time:
  · "activity-multichoice" + "activity-multichoice-answer"
      A "Check Your Understanding" quiz. body = the question. activityItems = 4 answer options (one correct, three plausible distractors). activityCorrectOrder = [index of correct option] on the answer slide; [] on the question slide. Title same on both. imageQuery EMPTY on both.
  · "activity-ordering" + "activity-ordering-answer"
      Students put 4 items in correct sequence (chronological, size, distance, etc.). activityItems = 4 strings already SHUFFLED (server shuffles them; you provide correct order). activityCorrectOrder = [] on question, [indices] on answer. Title same on both. imageQuery EMPTY on both.
  · "activity-question" + "activity-question-answer"
      Open-ended critical-thinking discussion. body = the question. activityItems = 3-5 "you might have said" plausible responses (ANSWER slide only). activityImageQuery = 2-4 nouns for the photo inside the speech bubble (QUESTION slide only). Title same on both (e.g. "Critical Thinking: The Search for Life").
  · "activity-vocab-match" + "activity-vocab-match-answer"
      Vocabulary matching: 4 terms numbered 1-4 on the left, 4 short definitions lettered a-d on the right. activityItems = 4 terms. bullets = 4 definitions in SHUFFLED order (NOT matching order — the server uses activityCorrectOrder to reveal answers). activityCorrectOrder = [] on question slide; on answer slide, [defIndex for term0, defIndex for term1, defIndex for term2, defIndex for term3] where defIndex is the index into bullets[] that correctly defines that term. Title same on both (e.g. "Key Vocabulary Match"). imageQuery EMPTY on both.`;

  const activityDirective = activityPairs === 2
    ? `Inject TWO activity pairs into the deck — one at roughly 1/3 of the way through, one at roughly 2/3. For each pair, choose the activity type that best suits the content covered so far (vary them — don't use the same type twice):
${activityTypeMenu}`
    : activityPairs === 1
    ? `Inject ONE activity pair into the deck — placed roughly halfway through. Choose the activity type that best suits the topic:
${activityTypeMenu}`
    : `Do not include any activity slides — the deck is too short.`;

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
LAST content slide — a SUMMARY RECAP using layout "paper-image-right": a creative recap heading (do NOT use the word "Summary"), a one-line subHook, then a body that recaps the lesson in 1-2 short sentences and leads into the bullets (e.g. "Today we explored the chemical engine of life. Remember:"). Add bullets listing the 2-4 KEY TAKEAWAYS from across the WHOLE deck, each leading with a **bold** term. Add a callout with calloutVariant "key", calloutLabel "Question for next time", and calloutBody = ONE forward-looking question that sets up the next lesson. imageQuery REQUIRED (the right-side image). Leave blockquoteText AND blockquoteAttribution EMPTY.

${activityDirective}

═══════════════════════════════════════════════════
SLIDE BUDGET
═══════════════════════════════════════════════════
- ${contentTarget} content slides (slide 1 title-hero + N-1 paper-* layouts, ending with the closing SUMMARY RECAP slide)
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

MATHS NOTATION
- Write every calculation in plain text with the symbols × ÷ + − = ² ³ √ and fractions as 3/4.
- NEVER use LaTeX or TeX: no backslashes, no \\( \\) or \\[ \\] delimiters, no $...$, no \\frac, \\times or ^ notation. Nothing on the slide typesets it, so it would show as raw symbols.

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
- Leave EMPTY on every slide. The deck now closes with a SUMMARY RECAP slide (see the DECK SPINE), not an attributed quote.

ACTIVITY-ORDERING / ACTIVITY-ORDERING-ANSWER
- activityKind: "order" on BOTH slides.
- title: same on both (e.g. "Planetary Distance").
- body: instruction text ("Order these planets by their distance from the Sun, starting with the closest.")
- activityItems: 4 strings in RANDOM presentation order. SAME 4 strings on both slides.
- activityCorrectOrder: [] on question; on answer, indices into activityItems giving correct order. Example: activityItems = ["Mars","Saturn","Venus","Neptune"] → activityCorrectOrder = [2, 0, 1, 3].
- imageQuery: empty on both. No callout, badge, or blockquote.

ACTIVITY-MULTICHOICE / ACTIVITY-MULTICHOICE-ANSWER
- activityKind: "choice" on BOTH slides.
- title: same on both (e.g. "Check Your Understanding").
- body: the quiz question (e.g. "Which group made up 98% of the French population?").
- activityItems: exactly 4 answer options. ONE is correct, three are plausible distractors.
- activityCorrectOrder: [] on question; [correctIndex] (single integer) on answer slide.
- imageQuery: empty on both. No callout, badge, or blockquote.

ACTIVITY-QUESTION / ACTIVITY-QUESTION-ANSWER
- activityKind: "question" on BOTH slides.
- title: same on both (e.g. "Critical Thinking: The Search for Life").
- body: the open-ended question (question slide only); empty on answer slide.
- activityItems: [] on question; 3-5 "you might have said" responses on answer slide.
- activityImageQuery: 2-4 concrete nouns for the speech-bubble image (question slide only); empty on answer.
- activityCorrectOrder: empty on both. No callout, badge, or blockquote.

ACTIVITY-VOCAB-MATCH / ACTIVITY-VOCAB-MATCH-ANSWER
- activityKind: "match" on BOTH slides.
- title: same on both (e.g. "Key Vocabulary Match" or "Revolutionary Vocabulary").
- body: empty on both.
- activityItems: exactly 4 key terms.
- bullets: exactly 4 short definitions in SHUFFLED order (not matching the term order). Each ≤ 14 words.
- activityCorrectOrder: [] on question; on answer, [defIndex for term0, defIndex for term1, defIndex for term2, defIndex for term3] — where each value is the index into bullets[] that correctly defines that term. Example: terms = [Republic, Monarchy, Constitution, Citizen], bullets = [a definition of Monarchy, a definition of Republic, a definition of Citizen, a definition of Constitution] → activityCorrectOrder = [1, 0, 3, 2].
- imageQuery: empty on both. No callout, badge, or blockquote.

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
${videoBlock}
═══════════════════════════════════════════════════
DECK TITLE
═══════════════════════════════════════════════════
- A short, evocative title (3-6 words). Same kind of title as the title-hero slide title — use the same string.

Now produce the JSON.`;
}
