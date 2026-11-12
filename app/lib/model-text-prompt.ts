// The Model Texts prompt: the text and its features as structured JSON
// (app/lib/sheets/model-text.ts) rather than markdown.

import { buildSystem } from "@/app/lib/systemPrompt";
import { bandPitch, differentiationPrompt, isBand, type Differentiate } from "@/app/lib/differentiation";
import { strictObject } from "@/app/lib/sheets/schema";

export interface ModelTextRequest {
  curriculum: string;
  yearGroup: string;
  write: string;
  features?: string;
  keywords?: string | null;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
  /** One band's version of a differentiated set (app/lib/bands.ts). */
  band?: string;
  bandIndex?: number;
  lengthWords?: number | string;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function modelTextResponseFormat() {
  const schema = strictObject({
    title: str,
    paragraphs: strList,
    features: { type: "array", items: strictObject({ feature: str, quote: str, why: str }) },
    teacherNote: str,
  });
  return { type: "json_schema" as const, json_schema: { name: "model_text", strict: true, schema } };
}

/** The word count asked for, kept between 50 and 5000 (the form's limits). */
export function modelTextWords(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.min(5000, Math.max(50, Math.round(n))) : 500;
}

const SYSTEM =
  "You are an expert UK literacy teacher and accomplished writer who creates model texts for classroom use across every key stage. You know the National Curriculum for English and the writing features expected at each year group. " +
  "Your model texts are carefully composed pieces that show excellence in the text type, never generic demonstrations, and you name their features with precise, accurate terms. " +
  "You return the text as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

export function modelTextRequest(body: ModelTextRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof modelTextResponseFormat> }
  | { error: string } {
  const curriculum = body?.curriculum?.trim();
  const yearGroup = body?.yearGroup?.trim();
  const write = body?.write?.trim();
  if (!curriculum || !yearGroup || !write) return { error: "Missing required fields" };
  const words = modelTextWords(body.lengthWords);

  const band = isBand(body.band) ? body.band : null;
  const adaptation = band ? "" : differentiationPrompt(body.differentiate ?? "no", body.differentiationLevels ?? []);
  const pitch = band
    ? `\n\nPITCH: ${bandPitch(band)} For a model text, that means the vocabulary, sentence craft and features a pupil at this level can realistically aim for, and notes written so they can follow them.`
    : adaptation
      ? `\n\nDIFFERENTIATION: ${adaptation} Say how in teacherNote.`
      : "";

  const user = `Write a model text for a UK classroom.

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- What to write: ${write}
- Length: about ${words} words${body.features?.trim() ? `\n- Features to include: ${body.features.trim()}` : ""}${body.keywords?.trim() ? `\n- Words to use: ${body.keywords.trim()}` : ""}${pitch}

FIELDS
- title: the text's own title, as it would appear on the piece.
- paragraphs: the model text, one string per paragraph. Pitched to stretch ${yearGroup} without being out of reach. Authentic to the genre: persuasive writing genuinely persuades, a narrative shows craft. Use the features asked for naturally, never as a checklist. No clichés. Subheadings, if the genre uses them, are their own short paragraph.
- features: 5 to 7 features the text uses. feature: the precise term ("fronted adverbial", "rhetorical question", "tricolon"). quote: the exact words from the text that show it, copied character for character, a phrase or one sentence, never more. why: one or two sentences on its effect, in words a ${yearGroup} pupil can follow.
- teacherNote: one or two sentences for the teacher on how to use the text${adaptation ? " and how it is differentiated" : ""}.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: modelTextResponseFormat(),
  };
}
