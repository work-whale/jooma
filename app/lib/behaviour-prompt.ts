// The Behaviour Support Plan prompt: the plan as structured JSON
// (app/lib/sheets/behaviour.ts) rather than markdown tables.
//
// The child's name never arrives here. The form sends pronouns and its notes
// with the name already replaced by "[PUPIL]" (app/lib/sheets/pupil.ts), and
// this refuses any request that carries a name field at all. Class, staff
// names and dates stay in the browser too: the page builds the details table
// from them.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { BEHAVIOUR_LIST_FIELDS } from "@/app/lib/sheets/behaviour";
import { isPupilPronouns, pronounLine } from "@/app/lib/sheets/pupil";
import type { PupilPronouns } from "@/app/lib/sheets/types";

export interface BehaviourPlanRequest {
  yearGroup: string;
  pronouns: PupilPronouns;
  supportNeeds?: string;
  behaviourDescription: string;
  behaviouralTriggers: string;
  behaviouralPatterns?: string;
  strengths?: string;
  dislikes?: string;
  previousInterventions?: string;
}

/** Keys that would carry a child's or adult's name, or what the page keeps
 *  for itself. A request with any of them is refused, not trimmed: it means
 *  an old or tampered form, and nothing from it should reach the model. */
const NAME_KEYS = /^(name|studentName|pupilName|firstName|first_name|surname|keyStaff|studentClass|pupil)$/i;

export function carriesPupilName(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  if (Array.isArray(body)) return body.some(carriesPupilName);
  return Object.entries(body as Record<string, unknown>).some(([k, v]) => NAME_KEYS.test(k) || carriesPupilName(v));
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

/** Every field the plan has, each required. Lists in page order. */
export function behaviourResponseFormat() {
  const props: Record<string, unknown> = {};
  for (const f of BEHAVIOUR_LIST_FIELDS) props[f] = strList;
  props.escalation = str;
  return { type: "json_schema" as const, json_schema: { name: "behaviour_support_plan", strict: true, schema: strictObject(props) } };
}

const SYSTEM =
  "You are an experienced UK SENCO and positive behaviour support specialist. You know the SEND Code of Practice (2015), the DfE's guidance on behaviour in schools and evidence-based de-escalation. " +
  "You write Behaviour Support Plans that every adult in a school can use at once: specific, practical and kind, never generic. " +
  "You return the plan as JSON that matches the given schema exactly. Write in UK English. Do not use long dashes: use commas, colons or full stops.";

/**
 * Validate a request and build its messages and response format. Returns
 * `{ error }` for a request the model should never see.
 */
export function behaviourRequest(body: BehaviourPlanRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof behaviourResponseFormat> }
  | { error: string } {
  if (carriesPupilName(body)) return { error: "A pupil's name is never sent. Please reload the page and try again." };
  const yearGroup = body.yearGroup?.trim();
  const behaviour = body.behaviourDescription?.trim();
  const triggers = body.behaviouralTriggers?.trim();
  if (!yearGroup || !behaviour || !triggers) return { error: "Missing required fields" };
  const pronouns = isPupilPronouns(body.pronouns) ? body.pronouns : "they";
  const line = (label: string, v: string | undefined) => `- ${label}: ${v?.trim() || "Not given"}`;

  const user = `Write a Behaviour Support Plan for a pupil in ${yearGroup}.

The pupil is called [PUPIL] everywhere: write "[PUPIL]" exactly where you would use their name, and use ${pronounLine(pronouns)} pronouns. Never invent a name, and never name other children or staff.

What the school has told you:
${line("Additional needs", body.supportNeeds)}
${line("The behaviour and what it looks like", behaviour)}
${line("Triggers", triggers)}
${line("Patterns and context", body.behaviouralPatterns)}
${line("Strengths and interests", body.strengths)}
${line("Dislikes", body.dislikes)}
${line("What has been tried before", body.previousInterventions)}

FIELDS (each a list of short, single points, 3 to 5 points unless said otherwise)
- behaviours: the challenging behaviours, each one observable ("Leaves the classroom without asking").
- targets: measurable targets, one for each behaviour, in the same order ("Asks for a break card before leaving, 4 days out of 5").
- triggers: specific triggers drawn from what you were told.
- strategies: how staff help [PUPIL] reach the targets.
- proactive: what staff do every day to keep behaviour positive.
- prevention: what staff do when a trigger is coming, to prevent an incident.
- phrases: 3 or 4 exact things any adult can say to support [PUPIL], in quotation marks.
- warningSigns: the early signs that [PUPIL] is becoming distressed.
- rewards: rewards and motivators built from [PUPIL]'s strengths and interests.
- responses: how to respond to the early signs (reminders, a calm space, a choice).
- movementBreaks: 2 to 4 movement break ideas suited to ${yearGroup}.
- distraction: 2 to 4 distractions that are likely to work for [PUPIL].
- highRiskTimes: the situations and times most likely to trigger a reaction.
- deEscalation: steps to calm a situation, in order, with a calm, low-demand approach.
- afterIncident: how staff help [PUPIL] reflect, repair and learn afterwards.
- doThis: 3 or 4 things every adult should do during an incident.
- avoidThis: 3 or 4 things every adult should avoid during an incident.
- calmPhrases: 2 or 3 exact things to say during an incident, in quotation marks, short and calm.
- calming: 2 to 4 calming techniques.
- escalation: one or two sentences: at what point another member of staff is told, and who (by role, never by name).
- strengths: what [PUPIL] is good at and enjoys.
- dislikes: what [PUPIL] finds hard or dislikes, said respectfully.
- successCriteria: measurable signs that the plan is working.
- reviewSuggestions: what to look at when the plan is reviewed, including anything staff have learned about working with [PUPIL].

QUALITY: every point is concrete and specific to what you were told, never generic advice such as "praise good behaviour". Keep the language non-judgemental: describe behaviour, not the child. Pitch the strategies for ${yearGroup}.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: behaviourResponseFormat(),
  };
}
