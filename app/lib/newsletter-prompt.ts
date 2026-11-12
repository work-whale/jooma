// The Newsletter Writer prompt: a school newsletter as structured JSON
// (app/lib/sheets/newsletter.ts) rather than markdown.
//
// What reaches the model: the title, the school's name, the tone, the section
// notes with every celebrated pupil's name as "[PUPIL n]", and how many
// pupils and dates there are. Never the celebrations or the dates themselves:
// those are tables built in code. A request carrying a name key is refused.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { carriesPupilName } from "@/app/lib/behaviour-prompt";

export const NEWSLETTER_TONES = ["Professional and formal", "Warm and friendly", "Inspiring and motivational"] as const;

export interface NewsletterRequest {
  newsletterTitle?: string;
  schoolName?: string;
  tone?: string;
  sections?: unknown;
  celebrated?: number;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function newsletterResponseFormat() {
  const schema = strictObject({
    title: str,
    intro: strList,
    sections: { type: "array", items: strictObject({ heading: str, paragraphs: strList }) },
    celebrationsIntro: str,
    signOff: str,
  });
  return { type: "json_schema" as const, json_schema: { name: "newsletter", strict: true, schema } };
}

/** The section notes, as strings with something in them. Null when `sections`
 *  is not a list of strings at all (the old route took it on trust and
 *  answered a bad body with a 500). */
export function newsletterNotes(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) return null;
  return (v as string[]).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

const SYSTEM =
  "You write school newsletters for primary and secondary schools in England: clear, specific and readable for busy parents and carers, in the school's own voice (\"we\", \"our children\"). " +
  "You return the newsletter as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function newsletterRequest(body: NewsletterRequest & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof newsletterResponseFormat> }
  | { error: string } {
  if (carriesPupilName(body) || "celebrations" in body) return { error: "Pupils' names are never sent. Please reload the page and try again." };
  const notes = newsletterNotes(body.sections);
  const tone = (NEWSLETTER_TONES as readonly string[]).includes(text(body.tone)) ? text(body.tone) : "";
  if (!notes || notes.length === 0 || !tone) return { error: "Missing required fields" };
  const title = text(body.newsletterTitle);
  const school = text(body.schoolName);
  const celebrated = typeof body.celebrated === "number" && body.celebrated > 0 ? Math.min(50, Math.floor(body.celebrated)) : 0;

  const user = `Write a school newsletter.

- Title: ${title || "(none given: write one)"}
- School: ${school || "(not given)"}
- Tone: ${tone}

The sections, from the school's notes, in this order:
${notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Pupils are written as [PUPIL 1], [PUPIL 2] and so on. Copy each placeholder exactly where you would use that pupil's name, and never invent, guess or add a name. Never name any other child or adult; use roles (the headteacher, Year 3's teacher).

FIELDS
- title: ${title ? `"${title}"` : "a short title for the newsletter"}.
- intro: 1 or 2 short paragraphs welcoming families and saying what is in this issue.
- sections: exactly ${notes.length}, one for each note above, in order. heading: a short heading. paragraphs: 1 to 3 short paragraphs from that note. Keep every fact, figure, date and time the note gives, and never invent a fact, date, time or event.
- celebrationsIntro: ${celebrated ? `one sentence introducing this issue's celebrations table, which lists ${celebrated} pupil${celebrated === 1 ? "" : "s"} (it is added to the page for you; do not name them)` : "an empty string"}.
- signOff: a short closing line from the school, with no name.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: newsletterResponseFormat(),
  };
}
