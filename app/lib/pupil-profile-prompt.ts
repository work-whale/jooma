// The One Page Profile prompt: the child's voice as structured JSON
// (app/lib/sheets/pupil-profile.ts) rather than markdown.
//
// As with the Behaviour Support Plan, the child's name never arrives here:
// the form sends "[PUPIL]" in its notes, and a request carrying a name field
// is refused. Intervention groups, outside agencies and dates stay in the
// browser; the page builds those lines itself.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { PROFILE_LIST_FIELDS } from "@/app/lib/sheets/pupil-profile";
import { isPupilPronouns, pronounLine } from "@/app/lib/sheets/pupil";
import { carriesPupilName } from "@/app/lib/behaviour-prompt";
import type { PupilPronouns } from "@/app/lib/sheets/types";

export interface PupilProfileRequest {
  yearGroup: string;
  pronouns: PupilPronouns;
  likes: string;
  happy?: string;
  supportNeeds: string;
  supportStyle?: string;
  hopes?: string;
  /** Add professional strategies and lesson changes to the pupil's own. */
  includeAdditionalSupport?: boolean;
}

const strList = { type: "array", items: { type: "string" } } as const;

/** Every box the profile has, each required. */
export function pupilProfileResponseFormat() {
  const props: Record<string, unknown> = {};
  for (const f of PROFILE_LIST_FIELDS) props[f] = strList;
  return { type: "json_schema" as const, json_schema: { name: "one_page_profile", strict: true, schema: strictObject(props) } };
}

const SYSTEM =
  "You are an experienced UK SENCO who writes person-centred one page profiles, as the SEND Code of Practice (2015) describes. " +
  "You write in the child's own voice, warmly and simply, so any adult who meets the child knows at a glance what matters to them and how to help. " +
  "You return the profile as JSON that matches the given schema exactly. Write in UK English. Do not use long dashes: use commas, colons or full stops.";

/**
 * Validate a request and build its messages and response format. Returns
 * `{ error }` for a request the model should never see.
 */
export function pupilProfileRequest(body: PupilProfileRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof pupilProfileResponseFormat> }
  | { error: string } {
  if (carriesPupilName(body)) return { error: "A pupil's name is never sent. Please reload the page and try again." };
  const yearGroup = body.yearGroup?.trim();
  const likes = body.likes?.trim();
  const needs = body.supportNeeds?.trim();
  if (!yearGroup || !likes || !needs) return { error: "Missing required fields" };
  const pronouns = isPupilPronouns(body.pronouns) ? body.pronouns : "they";
  const line = (label: string, v: string | undefined) => `- ${label}: ${v?.trim() || "Not given"}`;
  const extra = body.includeAdditionalSupport !== false;

  const user = `Write a one page profile for a pupil in ${yearGroup}, in the pupil's own voice.

The teacher's notes below are written about the pupil. Rewrite them as the pupil speaking ("I like...", "It helps me when..."). If you need the pupil's name, write "[PUPIL]" exactly; where an adult is described, use ${pronounLine(pronouns)} pronouns. Never invent a name, and never name other children or staff.

The teacher's notes:
${line("What people like and admire about the pupil", likes)}
${line("What makes the pupil happy", body.happy)}
${line("What the pupil needs support with", needs)}
${line("How the pupil likes to be supported", body.supportStyle)}
${line("The pupil's hopes and wishes", body.hopes)}

BOXES (each a list of 3 to 5 short points in the first person, specific to the notes, never generic)
- likes: what people like and admire about me.
- happy: what makes me happy.
- difficult: what I find difficult, said in a way the pupil would accept, never as a deficit.
- support: how to support me, from the notes on how the pupil likes to be supported.
- hopes: my hopes for the future, near and further away.
${extra
    ? `- strategies: 3 or 4 further evidence-based strategies a SENCO might add, still in the first person ("It may help me if...").
- accommodations: 2 to 4 changes to lessons that help me, suited to ${yearGroup} ("Instructions written on the board as well as said").`
    : "- strategies and accommodations: leave both as empty lists."}

QUALITY: write so it genuinely sounds like a ${yearGroup} pupil: warm, plain and age-appropriate, never clinical.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: pupilProfileResponseFormat(),
  };
}
