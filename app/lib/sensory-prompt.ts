// The Sensory Activities prompt: five multisensory activities as structured
// JSON (app/lib/sheets/sensory.ts) rather than markdown.
//
// The old prompt told the model the SEND Code of Practice "endorses"
// multisensory approaches. It does not name them, so the claim is gone.

import { buildSystem } from "@/app/lib/systemPrompt";
import { strictObject } from "@/app/lib/sheets/schema";
import { SENSES, SENSORY_ACTIVITIES } from "@/app/lib/sheets/sensory";

export interface SensoryRequest {
  curriculum?: string;
  yearGroup?: string;
  subject?: string;
  topic?: string;
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function sensoryResponseFormat() {
  const activity = strictObject({
    title: str,
    objective: str,
    senses: { type: "array", items: { type: "string", enum: [...SENSES] } },
    focus: str,
    resources: strList,
    steps: strList,
    vocabulary: strList,
    sensitive: strList,
    seeking: strList,
    sendNote: str,
    crossCurricular: strList,
  });
  return { type: "json_schema" as const, json_schema: { name: "sensory_activities", strict: true, schema: strictObject({ title: str, intro: str, activities: { type: "array", items: activity } }) } };
}

const SYSTEM =
  "You are an experienced SENCO and classroom teacher in England who designs multisensory activities that advance real curriculum learning for every pupil, including pupils with autism, sensory processing differences, dyslexia, DCD and physical disabilities. Your activities are practical with ordinary school resources and safe. " +
  "You return the activities as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function sensoryRequest(body: SensoryRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof sensoryResponseFormat> }
  | { error: string } {
  const curriculum = text(body?.curriculum);
  const yearGroup = text(body?.yearGroup);
  const subject = text(body?.subject);
  const topic = text(body?.topic);
  if (!curriculum || !yearGroup || !subject || !topic) return { error: "Missing required fields" };

  const user = `Plan multisensory activities for a class in England.

- Curriculum: ${curriculum}
- Year group: ${yearGroup}
- Subject: ${subject}
- Topic: ${topic}

FIELDS
- title: such as "${topic}: sensory activities".
- intro: one or two sentences on how the activities help pupils learn this topic through their senses.
- activities: exactly ${SENSORY_ACTIVITIES}, each genuinely teaching "${topic}" in ${subject}, not just themed on it. Across the five, vary the senses, the kind of activity (making, moving, creating, investigating, talking) and the grouping (individual, pairs, groups). For each:
  - title: a short, specific name.
  - objective: one sentence starting "Pupils will be able to".
  - senses: the 2 or 3 senses it purposefully uses, from ${SENSES.join(", ")}. Use Taste or Smell only where it is safe and genuinely helps.
  - focus: one sentence on what it teaches and why the senses help.
  - resources: what you need, specific and easy to find in a school.
  - steps: 3 to 5 short steps for the adult.
  - vocabulary: 2 to 5 subject words to use.
  - sensitive: 1 or 2 adaptations for pupils who are sensitive to sensory input (quieter space, less contact, choice of materials), keeping the same learning.
  - seeking: 1 or 2 ways to channel sensory seeking into the learning.
  - sendNote: one sentence on how it supports particular needs (such as autism, dyslexia, DCD or EAL) and how to adapt it for a pupil with a physical disability.
  - crossCurricular: 1 or 2 links to other subjects, each "Subject: the link".

Everything must suit ${yearGroup} pupils and be safe and practical in a real classroom.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: sensoryResponseFormat(),
  };
}
