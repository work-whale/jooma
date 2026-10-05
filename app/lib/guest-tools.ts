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
