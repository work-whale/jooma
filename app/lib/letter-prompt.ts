// The Letters prompt. The model writes the "Re:" line and the paragraphs,
// nothing else: the date, salutation, sign-off, a trip's details table and
// the reply slip are built in code (app/lib/sheets/letter.ts), so they can
// never be wrong or invented.
//
// The request carries no names. A letter about one child sends its facts with
// "[PUPIL]" for the child; the recipient's and sender's names stay in the
// browser and only ever appear in code-built parts of the page.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { carriesName } from "@/app/lib/reports/prompt";
import { PLACEHOLDER } from "@/app/lib/reports/privacy";
import { aboutOneChild, isLetterType, letterTone, type LetterTone, type LetterType } from "@/app/lib/sheets/letter";

export interface LetterRequestBody {
  type?: string;
  /** Who it is to, as a group: "Parents and carers", "Year 6 parents". A
   *  letter about one child sends none: it is to that child's parent. */
  recipient?: string;
  tone?: string;
  /** "2026-11-10": when the letter is sent, so "next Friday" can be checked. */
  date?: string;
  /** The facts, labelled, dates already in UK style, the child as [PUPIL]. */
  facts?: { label?: unknown; value?: unknown }[];
}

const str = { type: "string" } as const;

export function letterResponseFormat() {
  const schema = strictObject({
    subject: str,
    paragraphs: { type: "array", minItems: 2, maxItems: 6, items: str },
  });
  return { type: "json_schema" as const, json_schema: { name: "letter", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced UK school business manager and head teacher who writes clear, warm and professional letters home. " +
  "Your letters are short, plain and easy for every parent to follow, including parents who read English as an additional language. " +
  "You return JSON that matches the given schema exactly. Write in UK English with UK spelling and £ for money. Do not use long dashes or emojis.";

const TONES: Record<LetterTone, string> = {
  Formal: "formal: no contractions, measured and professional",
  "Semi-formal": "semi-formal: professional but approachable; contractions are fine",
  Informal: "warm and friendly, while still clearly from the school",
};

const TYPE_RULES: Record<LetterType, string> = {
  trip:
    "THIS LETTER: a trip or visit. Paragraph 1 says what the trip is, who is going, where, when and why. A table of the trip details is printed straight after paragraph 1, and a consent slip at the end. Paragraph 1 must not mention the table or any details \"above\" or \"below\": it comes before the table. A later paragraph may point to the table as \"the details above\". Do not list every detail again: mention the key ones once, in a sentence. Never say what the cost covers, how pupils will travel or what they will do there unless the facts say so. Then say what parents need to do (give consent, pay, send a packed lunch or kit) and by when. End with who to contact with questions, in general terms (for example \"the school office\").",
  attendance:
    `THIS LETTER: about one child's attendance, to their parent or carer. Be factual and supportive, never threatening. Give the attendance figure and period exactly as stated, explain briefly why regular attendance matters, set out the support offered, and the meeting if one is given. Never mention fines, penalty notices, legal action, the local authority or a referral unless the facts say so.`,
  behaviour:
    `THIS LETTER: about one incident involving one child, to their parent or carer. Be factual, calm and fair. Say what happened, when, and the action taken, using only the account given, then the support and next steps, and the meeting if one is given. Never add detail beyond the account, never name or describe other children, and never mention a sanction or exclusion that is not in the facts.`,
  general: "THIS LETTER: cover everything in the notes, in a sensible order, grouping related points into short paragraphs.",
};

export function letterRequest(body: LetterRequestBody):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof letterResponseFormat> }
  | { error: string } {
  if (carriesName(body)) return { error: "Names are never sent. Leave them on the page." };
  if (!isLetterType(body.type)) return { error: "Choose the type of letter" };
  const type = body.type;
  const facts = (Array.isArray(body.facts) ? body.facts : [])
    .map((f) => ({ label: typeof f?.label === "string" ? f.label.trim() : "", value: typeof f?.value === "string" ? f.value.trim().slice(0, 2000) : "" }))
    .filter((f) => f.label && f.value)
    .slice(0, 20);
  if (facts.length === 0) return { error: "Missing required fields" };
  const recipient = aboutOneChild(type) ? `the parent or carer of ${PLACEHOLDER}` : body.recipient?.trim();
  if (!recipient) return { error: "Missing required fields" };
  const tone = letterTone(body.tone);

  const user = `Write a letter from a UK school.

To: ${recipient}
Tone: ${TONES[tone]}${body.date ? `\nSent on: ${body.date}` : ""}

THE FACTS
${facts.map((f) => `- ${f.label}: ${f.value}`).join("\n")}

${TYPE_RULES[type]}

RULES
- subject: the "Re:" line, a few words saying what the letter is about, for example "Year 5 trip to the Natural History Museum". No "Re:" and no full stop.
- paragraphs: 2 to 5 short paragraphs, the body of the letter only. Do not write a date, an address, a salutation ("Dear..."), a sign-off ("Yours sincerely"), a name or a signature: the page adds those.
- Use only the facts above. Never invent a date, a time, a cost, a name, a place, a phone number, an email address or a consequence. If a detail parents would need is missing, leave it out; never write a placeholder in square brackets.${aboutOneChild(type) ? `\n- Refer to the child only as ${PLACEHOLDER}, exactly like that (for example "${PLACEHOLDER} has been absent" or "${PLACEHOLDER}'s attendance"). Never invent or use a name.` : ""}`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: letterResponseFormat(),
  };
}
