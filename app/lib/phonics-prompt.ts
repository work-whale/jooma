// The Phonics prompt: a resource for one grapheme as structured JSON
// (app/lib/sheets/phonics.ts) rather than markdown.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { activitySchema } from "@/app/lib/activity-schema";
import { ACTIVITY_FIELDS_RULE } from "@/app/lib/sheets/activity";
import { phonicsScheme, schemePromptLine } from "@/app/lib/phonics-schemes";

export interface PhonicsSupportRequest {
  curriculum: string;
  age: number;
  grapheme: string;
  /** A scheme id from app/lib/phonics-schemes.ts, "other", or missing. */
  scheme?: string;
  /** The scheme's name, typed, when scheme is "other". */
  schemeOther?: string;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function phonicsResponseFormat() {
  const schema = strictObject({
    title: str,
    about: str,
    wordBanks: strictObject({ cvc: strList, ccvc: strList, cvcc: strList, twoSyllable: strList, longer: strList }),
    commonWords: strList,
    trickyWords: strList,
    decodableText: strictObject({ title: str, paragraphs: strList }),
    pseudoWords: strList,
    activities: { type: "array", items: activitySchema() },
    misconceptions: strList,
    assessment: strList,
  });
  return { type: "json_schema" as const, json_schema: { name: "phonics_support", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK early reading teacher and phonics lead. You teach systematic synthetic phonics (SSP) as the DfE's guidance expects, and your grapheme-phoneme correspondences are always accurate. " +
  "You return the resource as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

/** The grapheme as typed, trimmed to letters and apostrophes, at most 8. */
export function cleanGrapheme(v: unknown): string {
  return typeof v === "string" ? v.replace(/[^\p{L}'-]/gu, "").slice(0, 8) : "";
}

export function phonicsRequest(body: PhonicsSupportRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof phonicsResponseFormat> }
  | { error: string } {
  const curriculum = body?.curriculum?.trim();
  const grapheme = cleanGrapheme(body?.grapheme);
  const age = typeof body?.age === "number" && Number.isFinite(body.age) ? Math.min(18, Math.max(3, Math.round(body.age))) : null;
  if (!curriculum || !grapheme || age === null) return { error: "Missing required fields" };

  const scheme = schemePromptLine(body.scheme, body.schemeOther);
  const s = phonicsScheme(body.scheme);
  const pseudoName = s?.pseudo ?? "nonsense words";

  const user = `Write a phonics support resource.

- Curriculum: ${curriculum}
- Age of the children: ${age}
- Grapheme: '${grapheme}'${scheme ? `\n\nSCHEME: ${scheme}` : ""}

It is for an English primary school, for the adult teaching the sound. Every word must be a real, correctly spelled English word in which '${grapheme}' makes the sound you describe, except the made-up words.

FIELDS
- title: such as "Phonics: '${grapheme}'".
- about: 2 or 3 sentences: the sound '${grapheme}' makes, any other sounds it can make (as 'ow' in cow and snow), and roughly when children usually meet it.
- wordBanks: 6 to 8 words in each list that suits '${grapheme}': cvc, ccvc, cvcc, twoSyllable, longer. Leave a list empty when '${grapheme}' cannot make words of that shape. Order each list from easiest to hardest.
- commonWords: 4 to 6 high-frequency words with '${grapheme}' that children can decode.
- trickyWords: 2 to 4 common words with '${grapheme}' that have an unusual spelling, or an empty list.
- decodableText: a short story of 60 to 120 words for age ${age}, with a title, as paragraphs, packed with '${grapheme}' words and otherwise using only simple, decodable words and the common words above.
- pseudoWords: 8 to 12 ${pseudoName} with '${grapheme}', easy to say and plausible, none of them a real word.
- activities: exactly 5, varied (a game, something active, something with a whiteboard, a reading activity, a writing activity). ${ACTIVITY_FIELDS_RULE}
- misconceptions: 3 or 4 common mistakes with this sound and how to correct each one.
- assessment: 3 or 4 quick ways an adult can check who has secured it.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: phonicsResponseFormat(),
  };
}
