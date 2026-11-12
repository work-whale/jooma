// The Early Years Plan prompt: a topic plan as structured JSON
// (app/lib/sheets/eyfs.ts) rather than markdown.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { activitySchema } from "@/app/lib/activity-schema";
import { ACTIVITY_FIELDS_RULE } from "@/app/lib/sheets/activity";
import { EYFS_AREAS } from "@/app/lib/sheets/eyfs";

export interface EYFSPlannerRequest {
  curriculum: string;
  topic: string;
  numberOfWeeks: number | string;
  includeBookList?: boolean;
  includeHomeLearning?: boolean;
  includeWeeklyOverview?: boolean;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function eyfsResponseFormat() {
  const week: Record<string, unknown> = { theme: str };
  for (const [field] of EYFS_AREAS) week[field] = str;
  const schema = strictObject({
    title: str,
    overview: str,
    weeks: { type: "array", items: strictObject(week) },
    areas: {
      type: "array",
      items: strictObject({
        area: { type: "string", enum: EYFS_AREAS.map(([f]) => f) },
        goals: str,
        indoor: strList,
        outdoor: strList,
        adultLed: { type: "array", items: activitySchema() },
      }),
    },
    bookList: strList,
    homeLearning: strList,
  });
  return { type: "json_schema" as const, json_schema: { name: "eyfs_plan", strict: true, schema } };
}

/** The weeks asked for, 1 to 12 (the form's limits). Null when not a number. */
export function eyfsWeeks(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.min(12, Math.max(1, Math.round(n))) : null;
}

const SYSTEM =
  "You are an experienced Early Years teacher and EYFS lead in England. You plan for Nursery and Reception through play, with a balance of child-initiated and adult-led learning and a rich environment indoors and out, and you know the EYFS statutory framework and its Early Learning Goals well. " +
  "You return the plan as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

export function eyfsRequest(body: EYFSPlannerRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof eyfsResponseFormat> }
  | { error: string } {
  const curriculum = body?.curriculum?.trim();
  const topic = body?.topic?.trim();
  const weeks = eyfsWeeks(body?.numberOfWeeks);
  if (!curriculum || !topic || weeks === null) return { error: "Missing required fields" };

  const areaList = EYFS_AREAS.map(([field, name]) => `${field} (${name})`).join(", ");

  const user = `Plan an Early Years topic.

- Curriculum: ${curriculum}
- Topic: ${topic}
- Weeks: ${weeks}

It is for a Nursery or Reception class in England.

FIELDS
- title: such as "${topic}: an Early Years plan".
- overview: 2 or 3 sentences on the topic, why it engages young children and how it builds over the weeks.
- weeks: exactly ${weeks}, in order. theme: a two to four word focus for the week. Then one cell for each area (${EYFS_AREAS.map(([f]) => f).join(", ")}): a short phrase of at most 12 words saying that week's focus in that area. The cells sit in a grid on one page, so keep them short.
- areas: exactly 7, one for each area in this order: ${areaList}. For each:
  - goals: the one or two Early Learning Goals it works towards, named as the EYFS statutory framework names them (such as "ELG: Speaking"). Never invent a goal.
  - indoor: 2 or 3 continuous provision ideas indoors, each one short line ("Bug hotel building in the construction area with sticks and pine cones").
  - outdoor: 2 or 3 continuous provision ideas outdoors, the same way.
  - adultLed: 2 adult-led activities. ${ACTIVITY_FIELDS_RULE}
- bookList: 5 to 8 real, well-known picture books that suit the topic, as "Title by Author". Only books you are sure exist.
- homeLearning: 3 to 5 simple ideas parents can do at home with everyday things.

Everything must suit children aged three to five: play-based, hands-on, safe and practical for a real setting.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: eyfsResponseFormat(),
  };
}
