// The Performance Management (appraisal) prompt: objectives as structured
// JSON (app/lib/sheets/appraisal.ts), pure so it can be tested.
//
// What DfE guidance calls appraisal. Evidence never includes lesson
// observation grades: Ofsted stopped grading individual lessons years ago and
// schools have followed. Leaders' objectives draw on the Headteachers'
// Standards (2020), teachers' on the Teachers' Standards (2011). The role is
// all the model is told about the person, never their name: a request with a
// name key is refused. The review columns are the school's and are not asked
// for.

import { strictObject } from "@/app/lib/sheets/schema";
import { buildSystem } from "@/app/lib/systemPrompt";
import { carriesStaffName } from "@/app/lib/staff-privacy";
import { objectiveCount } from "@/app/lib/sheets/appraisal";

export interface PerformanceManagementBody {
  curriculum?: string;
  schoolType?: string;
  staffMember?: string;
  payScale?: string;
  responsibilities?: string;
  priorities?: string;
  objectiveCount?: number;
}

const str = { type: "string" } as const;

export function performanceManagementResponseFormat() {
  const objective = strictObject({ objective: str, successCriteria: str, support: str, evidence: str });
  const schema = strictObject({ rationale: str, objectives: { type: "array", items: objective } });
  return { type: "json_schema" as const, json_schema: { name: "appraisal_objectives", strict: true, schema } };
}

const SYSTEM =
  "You are an experienced UK school leader who writes appraisal (performance management) objectives. You draft fair, rigorous and motivating SMART objectives that align with the Teachers' Standards (2011), the Headteachers' Standards (2020) for leaders, school improvement priorities and the person's professional development. You know the expectations of each pay range, from early career teachers to the upper pay range and leadership. " +
  "You return the objectives as JSON that matches the given schema exactly. Write in UK English. Never use emoji. Do not use long dashes: use commas, colons or full stops.";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function performanceManagementRequest(body: PerformanceManagementBody & Record<string, unknown>):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof performanceManagementResponseFormat> }
  | { error: string } {
  if (carriesStaffName(body)) return { error: "Names are never sent. Please reload the page and try again." };
  const curriculum = text(body.curriculum);
  const role = text(body.staffMember);
  const responsibilities = text(body.responsibilities);
  if (!curriculum || !role || !responsibilities) return { error: "Missing required fields" };
  const payScale = text(body.payScale);
  const schoolType = text(body.schoolType);
  const priorities = text(body.priorities);
  const count = objectiveCount(body.objectiveCount);

  const user = `Draft appraisal objectives for a member of staff in a UK school.

- Curriculum: ${curriculum}${schoolType ? `\n- School type: ${schoolType}` : ""}
- Role: ${role}${payScale ? `\n- Pay range: ${payScale}` : ""}
- Responsibilities and target areas: ${responsibilities}${priorities ? `\n- School priorities: ${priorities}` : ""}

Write exactly ${count} ${count === 1 ? "objective" : "objectives"} for this role, pay range and set of responsibilities${priorities ? ", tied to the school priorities" : ""}. Each must be SMART: specific, measurable, achievable, relevant and time-bound. Where the pay range is the upper pay range or leadership, set higher-level expectations. Refer to people by role only, never by name.

FIELDS
- rationale: 1 or 2 sentences on how the objectives link to the Teachers' Standards (2011) by number, or for leaders the Headteachers' Standards (2020), and to the school's priorities.
- objectives: exactly ${count}. Each field is at most 30 words, so the table stays readable on a page. For each:
  - objective: what the member of staff will achieve, specific and ambitious but realistic, 1 or 2 sentences, with a time frame (by a term or month).
  - successCriteria: measurable indicators of success, with percentages, frequencies or observable outcomes where possible, 1 or 2 sentences.
  - support: what the school, line manager or wider team will provide, including any CPD, 1 sentence.
  - evidence: the kinds of evidence that would show the objective is met, for example pupil progress and assessment information, work scrutiny, pupil voice, developmental lesson visits with feedback, or staff feedback. Never lesson observation grades: lessons are not graded. 1 sentence.

Do not write the reviews: the school fills those in at the mid-year check-in and the end of the cycle.`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    response_format: performanceManagementResponseFormat(),
  };
}
