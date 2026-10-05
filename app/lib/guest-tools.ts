// The two tools a signed out visitor can use on /create, and how the hero's
// short ids map to the slugs the rest of the app uses. Pure, shared by the
// page, the guest routes and the tests.
import type { HeroToolId } from "./landing/hero-ideas";

export type GuestToolSlug = "slideshow" | "comprehension-generator";

export const GUEST_TOOL_BY_HERO: Partial<Record<HeroToolId, GuestToolSlug>> = {
  slides: "slideshow",
  comp: "comprehension-generator",
};

export function guestSlugFor(tool: string | null | undefined): GuestToolSlug | null {
  if (tool === "slides" || tool === "slideshow") return "slideshow";
  if (tool === "comp" || tool === "comprehension-generator") return "comprehension-generator";
  return null;
}

export function guestToolName(slug: GuestToolSlug): string {
  return slug === "slideshow" ? "Slides" : "Comprehension";
}

/** Where a signed in teacher who lands on /create belongs instead. */
export function appToolPath(slug: GuestToolSlug): string {
  return `/tools/${slug}`;
}

/**
 * A year group written in the topic itself: "Volcanoes, Year 3", "bees y4",
 * "Reception colours". Jo reads this too, but not always: it has opened a
 * comprehension for "Why do bees matter? Year 4" without the year. Read here
 * as a backstop so the year the visitor typed is never lost.
 */
export function yearFromTopic(topic: string): string | null {
  if (/\breception\b/i.test(topic)) return "Reception";
  const m = topic.match(/\b(?:year|yr|y)\s*([1-9]|1[0-3])\b/i);
  return m ? `Year ${Number(m[1])}` : null;
}

/**
 * What the form opens with: Jo's fields when they arrived, and in any case the
 * topic and any year written in it. So a slow or partial reply from Jo still
 * leaves the visitor where they started rather than on an empty form.
 */
export function guestPrefillFields(
  slug: GuestToolSlug,
  topic: string,
  jo: Record<string, unknown> | null,
): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...(jo ?? {}) };
  if (typeof fields.topic !== "string" || !fields.topic.trim()) fields.topic = topic;
  const yearKey = slug === "slideshow" ? "year" : "yearGroup";
  if (fields[yearKey] === undefined) {
    const y = yearFromTopic(topic);
    if (y) fields[yearKey] = y;
  }
  return fields;
}

// ── What Jo knows about the form ─────────────────────────────────────────────
//
// Ask Jo used to see only the chat. It did not know the form beside it said
// "Recycling and sustainability", so "change it to Year 6" came back as a
// question about the topic with chips for the water cycle and the solar system,
// and the form was left as it was. The page now sends what the form holds, and
// it travels with the visitor's latest message so both of Jo's passes see it.

/** The form fields Jo may be told about, and the words to call them by. */
const CONTEXT_FIELDS: Record<GuestToolSlug, Record<string, string>> = {
  slideshow: {
    topic: "Topic",
    year: "Year group",
    slideCount: "Number of slides",
    readingLevel: "Reading level",
    additionalInstructions: "Extra instructions",
  },
  "comprehension-generator": {
    topic: "Topic",
    yearGroup: "Year group",
    curriculum: "Curriculum",
    passageWordCount: "Passage length in words",
    complexity: "Complexity",
    numQuestions: "Questions per content domain",
  },
};

/** Keep only known fields with short, plain values. Anything else is dropped:
 *  this arrives from the browser and goes into a prompt. */
export function cleanFormContext(
  slug: GuestToolSlug,
  raw: unknown,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of Object.keys(CONTEXT_FIELDS[slug])) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "string" && v.trim()) out[key] = v.trim().replace(/\s+/g, " ").slice(0, 300);
  }
  return out;
}

/** "Topic: Recycling and sustainability; Year group: Year 5; ..." */
export function describeFormContext(slug: GuestToolSlug, ctx: Record<string, string | number>): string {
  return Object.entries(ctx)
    .map(([k, v]) => `${CONTEXT_FIELDS[slug][k] ?? k}: ${v}`)
    .join("; ");
}

/**
 * The chat with the form's current values attached to the latest message, so
 * the tool selection pass (which reads only the recent turns) and the reply
 * both know what is already filled in.
 */
export function withFormContext(
  messages: { role: "user" | "assistant"; content: string }[],
  slug: GuestToolSlug,
  ctx: Record<string, string | number>,
): { role: "user" | "assistant"; content: string }[] {
  const described = describeFormContext(slug, ctx);
  if (!described) return messages;
  const out = messages.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role !== "user") continue;
    out[i] = {
      ...out[i],
      content: `${out[i].content}\n\n(The ${guestToolName(slug)} form beside this chat currently has: ${described}. Keep every value I have not asked to change.)`,
    };
    break;
  }
  return out;
}

/**
 * Whether a message asks for the form to change ("make it Year 6", "10 slides",
 * "400 words", "use a different topic"), as opposed to a question about it.
 * An edit makes Jo fill the form rather than decide whether to; a question is
 * left to be answered.
 */
export function wantsFormEdit(message: string): boolean {
  const t = message.toLowerCase();
  if (/^\s*(what|which|why|how|should|is|are|do|does|can you explain|explain)\b/.test(t) && !/\b(change|set|make|switch|update)\b/.test(t)) {
    return false;
  }
  return (
    /\b(change|set|make|switch|update|use|add|remove|turn|put|instead|increase|decrease|fewer|more|less|longer|shorter|harder|easier|simpler)\b/.test(t) ||
    /\b(year\s*\d+|reception|\d+\s*(slides?|words?|questions?))\b/.test(t)
  );
}

/**
 * Counts stated outright in the visitor's message: "10 slides", "400 words",
 * "3 questions". Jo's reply to "change to year 6 and 10 slides" said it had
 * changed both while its fields carried only the year, so the form and the
 * chat disagreed. These fill a field only when Jo left it out.
 */
export function countsFromMessage(slug: GuestToolSlug, message: string): Record<string, number> {
  const t = message.toLowerCase();
  const n = (re: RegExp) => {
    const m = t.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const out: Record<string, number> = {};
  if (slug === "slideshow") {
    const slides = n(/\b(\d{1,2})\s*(?:content\s*)?slides?\b/);
    if (slides !== undefined) out.slideCount = slides;
  } else {
    const words = n(/\b(\d{2,4})\s*words?\b/);
    if (words !== undefined) out.passageWordCount = words;
    const qs = n(/\b(\d{1,2})\s*questions?\b/);
    if (qs !== undefined) out.numQuestions = qs;
  }
  return out;
}
