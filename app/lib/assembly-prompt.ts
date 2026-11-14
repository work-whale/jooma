// The Assembly Planner prompt: the script as structured JSON
// (app/lib/sheets/assembly.ts), pure so it can be tested.
//
// Schools in England must hold a daily act of collective worship, "wholly or
// mainly of a broadly Christian character" unless they have an exemption;
// many state schools meet it with a quiet reflection in assembly, and faith
// schools use a prayer in their own tradition. The form's picker chooses
// which the closing part is. Code makes the running order add up to the
// length, so the model's minutes are only a suggestion.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { scrubStaffTitles } from "@/app/lib/staff-privacy";
import { ASSEMBLY_PARTS, assemblyMinutes, assemblyReflection } from "@/app/lib/sheets/assembly";

export interface AssemblyBody {
  theme?: string;
  stageOfSchool?: string;
  lengthMinutes?: number | string;
  additionalNotes?: string;
  reflection?: string;
  faith?: string;
}

const str = { type: "string" } as const;
const strings = { type: "array", items: str } as const;

export function assemblyResponseFormat() {
  const part = strictObject({
    part: { type: "string", enum: [...ASSEMBLY_PARTS] },
    title: str,
    minutes: { type: "integer" },
    say: strings,
    delivery: strings,
  });
  const schema = strictObject({
    title: str,
    message: str,
    parts: { type: "array", items: part },
    questions: strings,
    resources: strings,
    preparation: strings,
  });
  return { type: "json_schema" as const, json_schema: { name: "assembly_script", strict: true, schema } };
}

const SYSTEM =
  "You are an expert UK school leader who plans and leads memorable, well-paced school assemblies for every age. You write scripts a colleague can pick up and deliver: warm, clear and pitched exactly to the audience. " +
  "You return the script as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

function closing(reflection: ReturnType<typeof assemblyReflection>, faith: string): string {
  if (reflection === "worship") {
    return "The reflection part is collective worship of a broadly Christian character, as schools in England provide: a short, calm reflection and a simple prayer that pupils of any faith or none can listen to respectfully, introduced with an invitation such as \"If you would like to, you can join in with the prayer, or simply sit quietly.\"";
  }
  if (reflection === "faith") {
    return `This is a ${faith} school. The reflection part is a prayer and reflection in the ${faith} tradition, suited to the age of the audience.`;
  }
  return "The reflection part is a quiet reflection: a moment of silence and one thought to take away. No prayer, and no religious language unless the theme itself is about faith.";
}

export function assemblyRequest(body: AssemblyBody & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof assemblyResponseFormat> }
  | { error: string } {
  const theme = typeof body.theme === "string" ? scrubStaffTitles(body.theme.trim(), "colleague") : "";
  if (!theme) return { error: "Missing required fields" };
  const reflection = assemblyReflection(body.reflection);
  const faith = typeof body.faith === "string" ? body.faith.trim() : "";
  if (reflection === "faith" && !faith) return { error: "Please say which faith your school follows." };
  const stage = typeof body.stageOfSchool === "string" && body.stageOfSchool.trim() ? body.stageOfSchool.trim() : "Primary";
  const length = assemblyMinutes(body.lengthMinutes);
  const notes = typeof body.additionalNotes === "string" ? scrubStaffTitles(body.additionalNotes.trim(), "colleague") : "";

  const user = `Plan and script a ${length} minutes assembly on the theme "${theme}" for ${stage} in a UK school.${notes ? `\n\nTHE PRESENTER'S NOTES: ${notes}` : ""}

${closing(reflection, faith)}

Never name a pupil or a member of staff: use roles ("our head of year") or "someone". Pitch every word to the youngest children in the room.

FIELDS
- title: a short, memorable title for the assembly.
- message: the one key message, in one sentence.
- parts: the assembly in order, using each of these once: intro (a welcome that hooks the audience), main (the main message, explained), story (a story or real example that brings it to life), interactive (an activity that involves the audience, with how to adapt it for ${stage}), questions (the audience thinks together), reflection (the closing, as above). For each: part, title (a few words), minutes (a whole number; the parts must come to ${length} minutes), say (what the presenter says, as 2 to 5 short script lines in the first person; for the story, tell the story), delivery (2 or 3 practical delivery tips).
- questions: 4 or 5 questions for the audience to think about, for the questions part.
- resources: what the presenter needs (slides, objects, music, volunteers).
- preparation: 2 or 3 things to do beforehand.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: assemblyResponseFormat(),
  };
}
