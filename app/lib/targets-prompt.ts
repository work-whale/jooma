// The SMART Targets prompt: the targets as structured JSON
// (app/lib/sheets/targets.ts) rather than a markdown table.
//
// The child's name never arrives here. The form sends whether a name was
// given and the pronouns, with the name in its text already replaced by
// "[PUPIL]" (app/lib/sheets/pupil.ts), and this refuses any request carrying
// a name field. The dates stay in the browser: the page puts them in the
// details table.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { isPupilPronouns, pronounLine } from "@/app/lib/sheets/pupil";
import { carriesPupilName } from "@/app/lib/behaviour-prompt";
import type { PupilPronouns } from "@/app/lib/sheets/types";

export interface SmartTargetsRequest {
  curriculum: string;
  yearGroup: string;
  targets: string;
  /** Whether the teacher gave a first name (kept in the browser). */
  named?: boolean;
  pronouns?: PupilPronouns;
}

const str = { type: "string" } as const;

export function targetsResponseFormat() {
  const row = strictObject({ target: str, specific: str, measurable: str, achievable: str, relevant: str, timeBound: str });
  return { type: "json_schema" as const, json_schema: { name: "smart_targets", strict: true, schema: strictObject({ targets: { type: "array", items: row } }) } };
}

/** How the prompt tells the model to refer to the child. */
export function pupilReference(named: boolean | undefined, pronouns: unknown): string {
  const p = isPupilPronouns(pronouns) ? pronouns : "they";
  return named
    ? `The pupil is called [PUPIL] everywhere: write "[PUPIL]" exactly where you would use their name, and use ${pronounLine(p)} pronouns. Never invent a name, and never name other children or staff.`
    : `Refer to the child as "the pupil", with ${pronounLine(p)} pronouns. Never invent a name, and never name other children or staff.`;
}

const SYSTEM =
  "You are an expert UK SENCO and inclusion specialist who writes SMART targets within the SEND Code of Practice (2015). Your targets are outcomes-focused, specific enough to act on, measurable in a real classroom and written so the pupil can read their own target: useful to teachers, never bureaucratic. " +
  "You return the targets as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

export function targetsRequest(body: SmartTargetsRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof targetsResponseFormat> }
  | { error: string } {
  if (carriesPupilName(body)) return { error: "A pupil's name is never sent. Please reload the page and try again." };
  const curriculum = body?.curriculum?.trim();
  const yearGroup = body?.yearGroup?.trim();
  const targets = body?.targets?.trim();
  if (!curriculum || !yearGroup || !targets) return { error: "Missing required fields" };

  const user = `Write SMART targets for one pupil in ${yearGroup} (${curriculum}).

${pupilReference(body.named, body.pronouns)}

The targets as the teacher or SENCO wrote them:
"""
${targets}
"""

They will be shared with the pupil, their parents or carers and support staff.

FIELDS: one row in targets for each target given, in the same order. Each cell is one or two short sentences.
- target: a short, plain-English summary the pupil can read. If the teacher's target is vague, sharpen it.
- specific: an "I will..." statement saying exactly what the pupil will do, and where (in lessons, at playtime, at home).
- measurable: "I will know I have done it when..." with something an adult can see or count (how often, how many, how accurately). Never "improve".
- achievable: the support, resources or adjustments that will help: the kind of adult support, the tool, the strategy.
- relevant: why this matters for the pupil's learning, independence or wellbeing.
- timeBound: a realistic timeframe, such as "By the end of this half term" or "Within six weeks, checked at the next review". Never a made-up date.

Write the I statements in language a ${yearGroup} pupil can read. Make every target genuinely SMART, never a vague aspiration.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: targetsResponseFormat(),
  };
}
