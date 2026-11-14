// A meeting plan as a sheet.
//
// In a UK school the agenda goes out to staff beforehand and someone takes
// minutes with an action log. So the document is: details for the school to
// fill in, a timed agenda (code makes the minutes add up to the length and
// works out clock times from the start time), facilitator notes that can be
// switched off in Design so the agenda can be sent alone, a minutes box per
// item and a blank action log. The model never assigns actions to people:
// that happens in the meeting.
//
// A meeting about one pupil (a looked-after child or SEND review) keeps the
// child's name in `doc.pupil`; the text holds "[PUPIL]" (app/lib/sheets/pupil.ts).
//
// Pure, free of React, normalize.ts and schema.ts.

import { undash } from "./undash";
import { detailsTable } from "./action-plan";
import { responseBox } from "./signoff";
import { parseClock, timedItems } from "./timing";

export const MEETING_PARTS: { id: string; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "overview", label: "Purpose" },
  { id: "notes", label: "Facilitator notes" },
  { id: "minutes", label: "Minutes boxes" },
  { id: "actions", label: "Action log" },
];

export const MEETING_PURPOSES = ["inform", "discuss", "decide"] as const;

export interface MeetingInfo {
  duration?: number | string;
  /** "15:30", optional. */
  startTime?: string;
  participants?: string;
  /** A pupil was named in the form: the details show "[PUPIL]". */
  pupilNamed?: boolean;
  includeActionItems?: boolean;
}

/** 5 to 480 minutes, as the form allows; null for anything else. */
export function meetingMinutes(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 5 && n <= 480 ? Math.round(n) : null;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean);
const section = (role: string, title: string, blocks: Raw[], instructions = ""): Raw => ({ role, title, emoji: "", instructions, blocks });
const list = (title: string, items: string[]): Raw[] => (items.length ? [{ type: "list", title, style: "bullet", items }] : []);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The model's plan (complete or mid-stream) as a generic sheet draft. */
export function arrangeMeeting(raw: unknown, info: MeetingInfo = {}): Raw {
  const r = obj(undash(raw));
  const length = meetingMinutes(info.duration) ?? 0;
  const start = parseClock(info.startTime) !== null ? info.startTime!.trim() : undefined;

  const items = arr(r.items)
    .map(obj)
    .map((i) => ({
      title: str(i.title),
      minutes: typeof i.minutes === "number" ? i.minutes : Number.NaN,
      lead: str(i.leadRole),
      purpose: (MEETING_PURPOSES as readonly string[]).includes(str(i.purpose)) ? cap(str(i.purpose)) : "",
      notes: strs(i.notes),
    }))
    .filter((i) => i.title);
  const timed = timedItems(items.map((i) => ({ label: i.title, minutes: i.minutes })), length, start);
  const end = timed.length ? timed[timed.length - 1].to : undefined;

  const details = section("details", "", [
    detailsTable([
      ["Date", ""],
      ["Time", start && end ? `${timed[0].from} to ${end}` : ""],
      ["Venue", ""],
      ["Chair", ""],
      ["Minutes taken by", ""],
      ["Participants", info.participants?.trim() ?? ""],
      ...(info.pupilNamed ? [["Pupil", "[PUPIL]"] as [string, string]] : []),
    ]),
  ]);

  const overview = str(r.overview);
  const sections: Raw[] = [details];
  if (overview) sections.push(section("overview", "Purpose", [{ type: "text", text: overview }]));

  if (items.length) {
    sections.push(
      section("agenda", "Agenda", [
        {
          type: "table",
          headers: [start ? "Time" : "Minutes", "Item", "Lead", "Purpose"],
          rows: items.map((item, i) => [start ? `${timed[i].from} to ${timed[i].to}` : String(timed[i].minutes), item.title, item.lead, item.purpose]),
        },
      ]),
    );
  }

  const icebreaker = str(r.icebreaker);
  const notes = [
    ...list("Before the meeting", strs(r.preparation)),
    ...list("Icebreaker", icebreaker ? [icebreaker] : []),
    ...items.flatMap((i) => list(i.title, i.notes)),
    ...list("After the meeting", strs(r.followUp)),
  ];
  if (notes.length) sections.push(section("notes", "Facilitator notes", notes, "For the chair: switch these off in Design to send the agenda on its own."));

  if (items.length) {
    sections.push(section("minutes", "Minutes", items.map((i) => responseBox(i.title, 3))));
    if (info.includeActionItems) {
      sections.push(section("actions", "Action log", [{ type: "table", headers: ["Action", "Who", "By when"], rows: Array.from({ length: 6 }, () => ["", "", ""]) }]));
    }
  }

  return {
    title: str(r.title) || "Meeting plan",
    objective: "",
    intro: null,
    sections,
    teacherNotes: [],
  };
}
