// The Meeting Planner prompt: the plan as structured JSON
// (app/lib/sheets/meeting.ts), pure so it can be tested.
//
// People are named by role only. A pupil's name never arrives: the form
// sends "[PUPIL]" in its place and this refuses any name key. Colleagues
// typed with a title ("Mrs Lee") become "a colleague" here too, whatever the
// form did. The model never assigns actions or invents names, dates or
// owners: the action log is blank, for the meeting to fill in.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { scrubStaffTitles } from "@/app/lib/staff-privacy";
import { carriesPupilName } from "@/app/lib/behaviour-prompt";
import { MEETING_PURPOSES, meetingMinutes } from "@/app/lib/sheets/meeting";

export interface MeetingBody {
  purpose?: string;
  duration?: number | string;
  participants?: string;
  topics?: string;
  includeIcebreaker?: boolean;
  includeActionItems?: boolean;
}

const str = { type: "string" } as const;
const strings = { type: "array", items: str } as const;

export function meetingResponseFormat() {
  const item = strictObject({
    title: str,
    minutes: { type: "integer" },
    leadRole: str,
    purpose: { type: "string", enum: [...MEETING_PURPOSES] },
    notes: strings,
  });
  const schema = strictObject({
    title: str,
    overview: str,
    preparation: strings,
    icebreaker: str,
    items: { type: "array", items: item },
    followUp: strings,
  });
  return { type: "json_schema" as const, json_schema: { name: "meeting_plan", strict: true, schema } };
}

const SYSTEM =
  "You are an expert facilitator and school leader with extensive experience designing and running productive professional meetings in UK schools. You create structured, time-efficient meeting plans that respect participants' time and drive clear outcomes. " +
  "You return the plan as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

const clean = (v: unknown) => (typeof v === "string" ? scrubStaffTitles(v.trim(), "colleague") : "");

export function meetingRequest(body: MeetingBody & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof meetingResponseFormat> }
  | { error: string } {
  if (carriesPupilName(body)) return { error: "A pupil's name is never sent. Please reload the page and try again." };
  const purpose = clean(body.purpose);
  const participants = clean(body.participants);
  const topics = clean(body.topics);
  const length = meetingMinutes(body.duration);
  if (!purpose || !participants || length === null) return { error: "Missing required fields" };
  const aboutPupil = [purpose, participants, topics].some((t) => t.includes("[PUPIL]"));

  const user = `Plan a ${length} minute meeting in a UK school.

PURPOSE: ${purpose}
PARTICIPANTS: ${participants}${topics ? `\nTOPICS TO COVER: ${topics}` : ""}

${aboutPupil ? "[PUPIL] is the pupil the meeting is about: keep [PUPIL] exactly wherever you refer to them, and never give them a name. " : ""}Refer to people by role only (headteacher, SENCo, class teacher, parents), never by name, and never invent names. Never assign actions to people, and never invent dates: the meeting does that.

FIELDS
- title: a short title for the meeting, a few words.
- overview: 2 sentences on what the meeting is for and what it should decide or produce.
- preparation: 3 or 4 specific things the chair should do beforehand (papers, data, room).
- icebreaker: ${body.includeIcebreaker === true ? "one short, suitable opening activity for this group, and how to run it, in 2 sentences. Include a 5 minute item for it at the start of the agenda." : "an empty string."}
- items: the agenda, in order, from a welcome to a close that confirms actions. For each: title (a few words), minutes (a whole number; the items must come to ${length} minutes in total), leadRole (a role from the participants), purpose (inform, discuss or decide), and notes (2 or 3 short facilitation notes for the chair: what to cover and how to run it).
- followUp: 2 or 3 things to do after the meeting (sharing minutes, checking actions).`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: meetingResponseFormat(),
  };
}
