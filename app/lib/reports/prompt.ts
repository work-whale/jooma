// The Reports prompt and its strict schema. One request writes up to ten
// pupils' reports (the form sends five at a time). Pupils arrive as
// references with their judgements and notes, never with a name
// (./privacy.ts); the model writes "[PUPIL]" wherever the name goes.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { LENGTH_WORDS, SCALES, type ReportLength, type ReportTone, type ScaleId } from "./reports";
import { PLACEHOLDER, type ModelPupil } from "./privacy";

export const MAX_PER_REQUEST = 10;

export interface ReportsRequestBody {
  yearGroup?: string;
  subjects?: string[];
  scale?: string;
  length?: string;
  tone?: string;
  nextSteps?: boolean;
  pupils?: ModelPupil[];
  chunkIndex?: number;
  redo?: boolean;
}

const str = { type: "string" } as const;

export function reportsResponseFormat(refs: string[]) {
  const item = strictObject({ ref: { type: "string", enum: refs }, comment: str, nextStep: str });
  const schema = strictObject({ reports: { type: "array", minItems: refs.length, maxItems: refs.length, items: item } });
  return { type: "json_schema" as const, json_schema: { name: "reports", strict: true, schema } };
}

const TONES: Record<ReportTone, string> = {
  warm: "warm and personal, while staying professional",
  formal: "formal and measured",
  encouraging: "positive and encouraging, framing areas to develop as next steps",
  concise: "brief and to the point",
};

const SYSTEM =
  "You are an experienced UK teacher writing end of term reports to parents and carers. " +
  "Your reports are specific to each child, honest about what they need to work on, kind in tone, free of jargon, and never generic or copied between pupils. " +
  "You return JSON that matches the given schema exactly. Write in UK English with UK spelling. Do not use long dashes.";

/** True when anything in the request looks like a name field. The form never
 *  sends one; this stops a different caller from doing so. */
export function carriesName(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  if (Array.isArray(body)) return body.some(carriesName);
  return Object.entries(body as Record<string, unknown>).some(([k, v]) => /^(name|firstName|first_name|pupilName|surname)$/i.test(k) || carriesName(v));
}

export function reportsRequest(body: ReportsRequestBody):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof reportsResponseFormat> }
  | { error: string } {
  if (carriesName(body)) return { error: "Pupils' names are never sent. Send references instead." };
  const pupils = Array.isArray(body.pupils) ? body.pupils : [];
  if (!body.yearGroup?.trim()) return { error: "Missing required fields" };
  if (pupils.length === 0) return { error: "Add at least one pupil" };
  if (pupils.length > MAX_PER_REQUEST) return { error: `At most ${MAX_PER_REQUEST} pupils a request` };
  const subjects = (body.subjects ?? []).map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (subjects.length === 0) return { error: "Choose at least one subject" };
  const refs = pupils.map((p) => String(p?.ref ?? "")).filter(Boolean);
  if (refs.length !== pupils.length || new Set(refs).size !== refs.length) return { error: "Every pupil needs its own reference" };

  const scale = (Object.keys(SCALES) as ScaleId[]).includes(body.scale as ScaleId) ? (body.scale as ScaleId) : "target";
  const length = (Object.keys(LENGTH_WORDS) as ReportLength[]).includes(body.length as ReportLength) ? (body.length as ReportLength) : "standard";
  const tone = (Object.keys(TONES) as ReportTone[]).includes(body.tone as ReportTone) ? (body.tone as ReportTone) : "warm";
  const words = LENGTH_WORDS[length] * (subjects.length > 1 ? Math.min(3, 1 + (subjects.length - 1) * 0.35) : 1);

  const lines = pupils.map((p) => {
    const att = Object.entries(p.attainment ?? {}).filter(([s, v]) => subjects.includes(s) && v);
    return [
      `- ${p.ref} (pronouns: ${p.pronouns === "he" ? "he/him" : p.pronouns === "she" ? "she/her" : "they/them"})`,
      att.length ? `  attainment: ${att.map(([s, v]) => `${s}: ${v}`).join("; ")}` : "  attainment: not given",
      `  effort: ${p.effort || "not given"}`,
      p.note?.trim() ? `  teacher's note: ${p.note.trim().slice(0, 600)}` : "  teacher's note: none",
      p.nextStep?.trim() ? `  teacher's next step: ${p.nextStep.trim().slice(0, 300)}` : "",
    ].filter(Boolean).join("\n");
  });

  const user = `Write end of term reports for ${body.yearGroup.trim()} pupils, for their parents and carers.

Subject${subjects.length > 1 ? "s" : ""}: ${subjects.join(", ")}
Attainment scale: ${SCALES[scale].label}
Tone: ${TONES[tone]}
Length: between ${Math.round(words * 0.9)} and ${Math.round(words * 1.15)} words for each pupil's comment. Count them: a comment shorter than this is not finished.

THE PUPILS
${lines.join("\n")}

RULES
- Refer to each pupil only as ${PLACEHOLDER}, exactly like that (for example "${PLACEHOLDER} has worked hard" or "${PLACEHOLDER}'s reading"), with their pronouns. Never invent or use a name.
- Never state an attainment, a grade or an effort level that is not given above. Where one is given, put it in plain words for parents (for example "is working at the expected standard"), never as a code.
- Build each report from that pupil's own note: specific, so no two reports read alike. Do not invent achievements, events or difficulties the note does not mention.
- A pupil whose note is "none": write only what their attainment and effort support, in general terms. Make no claim about particular work, habits, behaviour, interests or difficulties: the teacher has not given any. This comment may be shorter than the length above; never pad it with invented detail.${subjects.length > 1 ? "\n- Cover each subject listed, briefly, in one flowing comment rather than a list." : ""}
- comment: the report, in the third person, in full sentences.
- nextStep: ${body.nextSteps === false ? '"" (no next steps this time).' : "one clear, achievable next step for the coming term, using the teacher's next step if one is given, written for parents."}
- ref: the pupil's reference, exactly as given. One report for every pupil, in the order given.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: reportsResponseFormat(refs),
  };
}
