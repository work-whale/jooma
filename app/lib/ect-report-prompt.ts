// The ECT Report Writer's prompt: an induction progress review or formal
// assessment as structured JSON (app/lib/sheets/ect.ts), pure so it can be
// tested.
//
// The ECT's name never reaches this module: the browser sends "[ECT]" in its
// place (app/lib/staff-privacy.ts) and the request is refused if it carries a
// name key. Statutory induction has run under the Initial Teacher Training and
// Early Career Framework (ITTECF) since September 2025, and ECTs are assessed
// against the Teachers' Standards (2011), never against the ITTECF. The model
// writes from the evidence it is given and never makes the judgement: the
// induction tutor picks the outcome in the form, it is printed by code, and it
// is not sent here at all.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { carriesStaffName, ECT_PLACEHOLDER } from "@/app/lib/staff-privacy";
import { ECT_STANDARDS, ectPeriod, ectReportType } from "@/app/lib/sheets/ect";

export interface EctReportBody {
  curriculum?: string;
  subject?: string;
  reportType?: string;
  period?: string;
  strengths?: string;
  areasForDevelopment?: string;
}

const str = { type: "string" } as const;

export function ectResponseFormat() {
  const standard = strictObject({ standard: { type: "integer" }, strengths: str, nextSteps: str });
  const target = strictObject({ target: str, support: str, byWhen: str });
  const schema = strictObject({
    summary: str,
    standards: { type: "array", items: standard },
    conduct: str,
    targets: { type: "array", items: target },
  });
  return { type: "json_schema" as const, json_schema: { name: "ect_report", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced induction tutor and ECT mentor in an English school. You know the DfE statutory guidance on induction for early career teachers, the Initial Teacher Training and Early Career Framework (ITTECF) that induction training is based on, and the Teachers' Standards (DfE, 2011) that ECTs are assessed against. " +
  "You write formal, evidence-based induction records in the third person and professional UK English. You return the record as JSON that matches the given schema exactly. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function ectReportRequest(body: EctReportBody & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof ectResponseFormat> }
  | { error: string } {
  if (carriesStaffName(body)) return { error: "The ECT's name is never sent. Please reload the page and try again." };
  const curriculum = text(body.curriculum);
  const strengths = text(body.strengths);
  const areas = text(body.areasForDevelopment);
  if (!curriculum || !strengths || !areas) return { error: "Missing required fields" };
  const subject = text(body.subject);
  const type = ectReportType(body.reportType);
  const period = ectPeriod(type, body.period);
  const E = ECT_PLACEHOLDER;
  const kind = type === "assessment" ? "formal assessment report" : "progress review record";

  const user = `Write the evidence for an early career teacher's induction ${kind}.

- Point in induction: ${period.label}
- Curriculum: ${curriculum}${subject ? `\n- Subject or phase: ${subject}` : ""}
- Strengths seen: ${strengths}
- Areas for development: ${areas}

The ECT is called ${E} everywhere: write "${E}" exactly where you would use their name. Never invent a name, and never name any other person: refer to colleagues by role (mentor, induction tutor, subject lead, SENCO).

${type === "assessment" ? "A formal assessment shows the ECT's performance against the Teachers' Standards at the time of the assessment, drawn from evidence gathered during the progress reviews and the assessment period." : "A progress review summarises the evidence collected so far and sets the agreed development targets, so there is nothing unexpected for the ECT at their formal assessment."} Judgements relate to the Teachers' Standards (DfE, 2011), never to the ITTECF.

Use only the evidence above. Do not invent observations, lesson details, data, pupil work or incidents. Where a point would need more evidence, write "[add evidence]" for the tutor to complete.

The judgement is the induction tutor's, recorded separately. Never state or imply whether ${E} is on track, making satisfactory progress, or whether their performance is satisfactory or unsatisfactory, and never recommend an extension.

FIELDS
- summary: 2 or 3 sentences summarising the evidence, in the third person.
- standards: one entry for each Teachers' Standard the evidence above speaks to, and only those (usually 3 to 5). standard is its number, 1 to 8: ${ECT_STANDARDS.map((s, i) => `${i + 1} ${s}`).join("; ")}. strengths: 1 or 2 sentences on what the evidence shows for that standard. nextSteps: 1 sentence on the next step for that standard, or "" when none is needed.
- conduct: 1 or 2 sentences on Part Two of the Teachers' Standards (personal and professional conduct), only from the evidence given; if the evidence says nothing about it, write "[add evidence]".
- targets: 2 to 4 agreed development targets drawn from the areas for development. target: specific and measurable, one sentence. support: what support will be given, by role only. byWhen: a realistic point such as "by February half term" or "by the next progress review".`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: ectResponseFormat(),
  };
}
