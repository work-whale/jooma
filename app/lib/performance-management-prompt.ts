// The Performance Management Targets prompt, pure so it can be tested.
//
// What DfE guidance now calls appraisal. Evidence never includes lesson
// observation grades: Ofsted stopped grading individual lessons years ago and
// schools have followed. Leaders' targets draw on the Headteachers' Standards
// (2020), teachers' on the Teachers' Standards (2011). The role is all the
// model is told about the person, never their name.

export interface PerformanceManagementBody {
  curriculum?: string;
  schoolType?: string;
  staffMember?: string;
  payScale?: string;
  responsibilities?: string;
}

const SYSTEM =
  "You are an experienced UK school leader who writes appraisal (performance management) targets. You draft fair, rigorous and motivating SMART objectives that align with the Teachers' Standards (2011), the Headteachers' Standards (2020) for leaders, school improvement priorities and the person's professional development. You know the expectations of each pay range, from early career teachers to the upper pay range and leadership.";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function buildPerformanceManagementPrompt(body: PerformanceManagementBody): { system: string; user: string } | { error: string } {
  const curriculum = text(body.curriculum);
  const role = text(body.staffMember);
  const responsibilities = text(body.responsibilities);
  if (!curriculum || !role || !responsibilities) return { error: "Missing required fields" };
  const payScale = text(body.payScale);
  const schoolType = text(body.schoolType);

  const user = `Draft appraisal targets for a member of staff in a UK school.

STAFF DETAILS:
- Curriculum: ${curriculum}${schoolType ? `\n- School type: ${schoolType}` : ""}
- Role: ${role}${payScale ? `\n- Pay scale: ${payScale}` : ""}
- Responsibilities and target areas: ${responsibilities}

Write 4 to 6 appraisal objectives for this role, pay scale and set of responsibilities. Each must be SMART: specific, measurable, achievable, relevant and time-bound.

Link teachers' objectives to the Teachers' Standards (2011) and leaders' objectives to the Headteachers' Standards (2020) where relevant, alongside likely school priorities. Where the pay scale is the upper pay range or leadership, set higher-level expectations. Refer to people by role only, never by name.

Output ONLY a markdown table with no preamble, title or explanation. The table must have exactly these columns:

| Objective | Success Criteria | Evidence | Actions / Strategies | Time Scale | Support / Resources | Progress / Review |
|---|---|---|---|---|---|---|

Rules for each cell:
- **Objective**: a clear, specific statement of what the member of staff will achieve. Ambitious but realistic. 2 to 4 sentences.
- **Success Criteria**: measurable indicators of success, with percentages, frequencies or observable outcomes where possible. 2 or 3 sentences.
- **Evidence**: the kinds of evidence that would show the objective is met, for example pupil progress and assessment information, work scrutiny, pupil voice, developmental lesson visits with feedback, or staff feedback. Never lesson observation grades: lessons are not graded. 1 or 2 sentences.
- **Actions / Strategies**: concrete steps the member of staff will take. 2 to 4 sentences.
- **Time Scale**: specific timeframes by academic term, half term or month. 1 or 2 sentences.
- **Support / Resources**: what the school, line manager or wider team will provide. 1 or 2 sentences.
- **Progress / Review**: how and when progress will be reviewed, with an interim check-in and the end-of-cycle review. 1 or 2 sentences.

Each cell must be a single paragraph: no line breaks, bullet points or sub-lists inside cells.`;

  return { system: SYSTEM, user };
}
