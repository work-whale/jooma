// The prompt for a staff training deck (Staff Slides) and for an assembly's
// slides, both made by the main Slides engine with speaker notes on every
// slide. Pure, so it can be tested. The pupil deck's prompt is in
// app/lib/deck-prompt.ts and is not touched by anything here.
//
// The model is never asked for statistics, quotes or research findings it
// might invent: staff decks open on a question, not a figure, and the quote
// layout is left out.

import type { RequestBody } from "@/app/lib/slideshow-pipeline";

/** The layouts a staff or assembly deck may use: no vocabulary grid, quiz,
 *  ordering or matching activity, and no quote slide (a made up quote is
 *  worse than none). */
export const STAFF_DECK_LAYOUTS = [
  "title-hero",
  "paper-image-right",
  "paper-image-left",
  "paper-two-images",
  "paper-image-right-badge",
  "paper-banner-image-top",
  "activity-question",
] as const;

export const isStaffDeck = (body: { deckKind?: unknown }) => body.deckKind === "staff" || body.deckKind === "assembly";

/** Content slides (the title included) and discussion or question slides. */
export function staffBudget(kind: "staff" | "assembly", slideCount: number | undefined): { content: number; activities: number; total: number } {
  const max = kind === "assembly" ? 10 : 15;
  const content = Math.max(3, Math.min(max, slideCount ?? 6));
  const activities = kind === "assembly" ? 1 : content >= 8 ? 2 : 1;
  return { content, activities, total: content + activities };
}

const RULES = `CONTENT RULES
- Never invent statistics, quotes or research findings. Name research or guidance only where you are sure it exists (for example the EEF's guidance reports, or Rosenshine's Principles of Instruction), and give no figures unless they are well established.
- Titles: short and specific, 2 to 6 words.
- subHook: optional, one short line.
- body: one or two short sentences at most. Slides are read from the back of the room.
- bullets: at most 4, each leading with a **bold** key term.
- Callouts: calloutVariant "key" or "remember" with calloutLabel and calloutBody, on at most half the slides. Leave calloutVariant "" elsewhere.
- badgeText: only on "paper-image-right-badge", 2 or 3 words in capitals. Empty elsewhere.
- blockquoteText and blockquoteAttribution: empty on every slide.
- Every slide except the activity needs an imageQuery: 2 to 4 concrete nouns for a real photograph. "paper-two-images" also needs secondaryImageQuery and secondaryBody.
- activityKind is "question" on the activity slide and "" elsewhere. activityItems, activityCorrectOrder: empty arrays on every slide.
- Every field is required: use "" or [] where it does not apply.
- British English. No LaTeX. Do not use long dash punctuation: use commas, colons or full stops.`;

function staffPrompt(body: RequestBody): string {
  const { content, activities, total } = staffBudget("staff", body.slideCount);
  const focus =
    body.staffFocus === "research"
      ? "FOCUS: research and theory. Explain what the evidence says and why it matters, for busy teachers, and always land on what it means in the classroom."
      : "FOCUS: practical application. What staff will do differently in their lessons next week, with concrete classroom examples across phases and subjects.";
  const extra = body.additionalInstructions?.trim() ? `\nTHE PRESENTER'S OWN INSTRUCTIONS (they win where they conflict): "${body.additionalInstructions.trim()}"` : "";
  const resource = body.resourceText?.trim()
    ? `\n\n--- MATERIAL FROM THE PRESENTER${body.resourceSource ? ` (${body.resourceSource})` : ""} ---\n${body.resourceText.trim()}\n--- END MATERIAL ---\nBase the deck on this material.`
    : "";

  return `You are an experienced UK teacher educator. Produce a staff training (CPD) slide deck, as JSON, for teachers and teaching assistants in a UK school, on: "${body.topic}".
${focus}${extra}${resource}

DECK SPINE: emit slides in this order.
1. "title-hero": the session title and a one line subtitle.
2. A hook: a thought-provoking question or classroom scenario for staff, never a statistic.
3 to ${content}. Content slides, varying these layouts: "paper-image-right", "paper-image-left", "paper-two-images", "paper-image-right-badge", "paper-banner-image-top". The last content slide is the next steps: "paper-image-right", titled for example "What we will try", with 3 or 4 bullets of things staff will do, and a callout with calloutVariant "key" and calloutLabel "Try this week".
Discussion tasks: ${activities} slide${activities === 1 ? "" : "s"} with layout "activity-question", each placed straight after the content it discusses. body is the task for pairs or small groups, with a time, for example "In pairs, 3 minutes: when did a pupil last surprise you with what they remembered?". activityImageQuery: 2 to 4 concrete nouns. There is no answer slide.

SLIDE BUDGET: ${content} content slides (the title included) and ${activities} discussion slide${activities === 1 ? "" : "s"}. TOTAL: emit exactly ${total} slides.

SPEAKER NOTES (speakerNotes): on every slide, what the presenter says, 60 to 120 words in the first person, as a natural script with any timing. On a discussion slide, how to run the task and what to listen for. The slide shows the key words; the notes carry the explanation.

Write for adults: plain, professional and warm, no exclamation marks, never talking down.

${RULES}

DECK TITLE: 3 to 6 words, the same string as the title-hero title.

Now produce the JSON.`;
}

function assemblyPrompt(body: RequestBody): string {
  const { content, activities, total } = staffBudget("assembly", body.slideCount);
  const audience = body.year?.trim() ? `, for ${body.year.trim()}` : "";
  const script = body.resourceText?.trim()
    ? `\n\nTHE ASSEMBLY SCRIPT (follow its order, message and closing exactly; the slides support it):\n---\n${body.resourceText.trim()}\n---`
    : "";
  const extra = body.additionalInstructions?.trim() ? `\nTHE PRESENTER'S OWN INSTRUCTIONS: "${body.additionalInstructions.trim()}"` : "";

  return `You are an experienced UK school leader. Produce the slides, as JSON, for a school assembly on "${body.topic}"${audience}. They go on the screen in the hall while the presenter speaks: few words, big pictures.${extra}${script}

DECK SPINE: emit slides in this order.
1. "title-hero": the assembly title, with the key message as the subtitle.
2 to ${content}. One slide for each part of the script, in its order, varying these layouts: "paper-image-right", "paper-image-left", "paper-banner-image-top", "paper-two-images". On each, a title and at most one short sentence or 3 short bullets. The last content slide is the closing reflection: a calm picture and one line to think about, following the script's closing (a prayer only if the script has one).
The questions slide: 1 slide with layout "activity-question", where the script asks the audience to think: body is the one question for everyone to think about, activityImageQuery 2 to 4 concrete nouns. There is no answer slide.

SLIDE BUDGET: ${content} content slides (the title included) and ${activities} questions slide. TOTAL: emit exactly ${total} slides.

SPEAKER NOTES (speakerNotes): on every slide, the presenter's words for that slide, taken from the script, 40 to 120 words. Keep the script's meaning; tidy it to read aloud.

Never name a pupil or member of staff: use roles ("our head of year") or "someone". Words on the slides suit the youngest children in the room.

${RULES}

DECK TITLE: 3 to 6 words, the same string as the title-hero title.

Now produce the JSON.`;
}

export function buildStaffDeckPrompt(body: RequestBody): string {
  return body.deckKind === "assembly" ? assemblyPrompt(body) : staffPrompt(body);
}
