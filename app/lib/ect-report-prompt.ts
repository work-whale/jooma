// The ECT Report Writer's prompt, pure so it can be tested.
//
// The ECT's name never reaches this module: the browser sends "[ECT]" in its
// place (app/lib/staff-privacy.ts) and the request is refused if it carries a
// name key. Statutory induction has run under the Initial Teacher Training and
// Early Career Framework (ITTECF) since September 2025, and ECTs are still
// assessed against the Teachers' Standards (2011). The model writes from the
// evidence it is given and never makes the formal judgement itself: that is
// the induction tutor's, confirmed by the appropriate body.

import { carriesStaffName, ECT_PLACEHOLDER } from "@/app/lib/staff-privacy";

export interface EctReportBody {
  curriculum?: string;
  subject?: string;
  strengths?: string;
  areasForDevelopment?: string;
  includeProfessionalDevelopmentPlan?: boolean;
}

const SYSTEM =
  "You are an experienced UK induction tutor and ECT mentor. You know statutory induction for early career teachers in England, the Initial Teacher Training and Early Career Framework (ITTECF, from September 2025) and the Teachers' Standards (DfE, 2011). " +
  "You write formal, evidence-based progress reports for mentors, induction tutors, headteachers and appropriate bodies, in third person and professional UK English, referencing the Teachers' Standards by number and full title.";

const PDP = `

## Professional Development Plan

After the summary, include a structured Professional Development Plan with:

### Short-term Actions (Next 4 to 6 weeks)

2 numbered action points, each with:
- **Teacher Standard:** [TS reference and full title]
- **Implementation strategy:** [Specific, concrete steps the ECT should take]
- **Resources required:** [What is needed to complete this action]
- **Success indicators:** [How progress will be measured]

### Medium-term Actions (Next term)

2 numbered action points, each with:
- **Teacher Standard:** [TS reference]
- **Implementation strategy:** [Specific steps]
- **Support:** [Who can support, by role: mentor, induction tutor, subject lead, SENCO]
- **Expected classroom impact:** [What improvement in outcomes should be seen]

### Long-term Professional Goals (Next 6 to 12 months)

1 or 2 overarching goals, each with bullet points for:
- **Teacher Standards:** [Relevant TS references]
- **Professional development opportunities:** [The ITTECF programme, CPD, networks]
- **School improvement alignment:** [How this links to school priorities]

### Recommended Resources

A short categorised list of well-known, real resources only (for example the ITTECF itself, EEF guidance reports, subject association materials). If unsure a resource exists, leave it out.`;

export function buildEctReportPrompt(
  body: EctReportBody & Record<string, unknown>,
): { system: string; user: string } | { error: string } {
  if (carriesStaffName(body)) return { error: "The ECT's name is never sent. Please reload the page and try again." };
  const curriculum = typeof body.curriculum === "string" ? body.curriculum.trim() : "";
  const strengths = typeof body.strengths === "string" ? body.strengths.trim() : "";
  const areas = typeof body.areasForDevelopment === "string" ? body.areasForDevelopment.trim() : "";
  if (!curriculum || !strengths || !areas) return { error: "Missing required fields" };
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const E = ECT_PLACEHOLDER;

  const user = `Write a formal, evidence-based progress report on an early career teacher (ECT) in statutory induction.

- Curriculum: ${curriculum}${subject ? `\n- Subject: ${subject}` : ""}
- Strengths seen: ${strengths}
- Areas for development: ${areas}

The ECT is called ${E} everywhere: write "${E}" exactly where you would use their name, every time, including the title. Never invent a name, and never name any other person: refer to colleagues by role (mentor, induction tutor, subject lead, SENCO).

Induction in England runs under the Initial Teacher Training and Early Career Framework (ITTECF), and ECTs are assessed against the Teachers' Standards (DfE, 2011). Reference the Teachers' Standards accurately, by number and full title.

Use only the evidence above. Do not invent observations, lesson details, data, pupil work or incidents. Where a point would need more evidence, write "[add evidence]" for the mentor to complete.

Structure the report as follows:

# ECT Progress Report: ${E}

## Strengths

3 paragraphs, each:
- opening with the strength and the relevant Teacher Standard(s) by number and full title
- grounded in the strengths given above, without adding evidence that was not given
- describing the likely impact on pupils' learning, progress or wellbeing
- formal and third person, around 100 words

## Areas for Development

3 paragraphs, each:
- naming the relevant Teacher Standard(s) by number and full title
- describing the gap clearly and constructively, from the areas given above
- giving 2 or 3 precise, actionable development steps, with support named by role only
- stating the expected impact on pupils, framed as normal professional growth

## Professional Summary

3 paragraphs:
1. A synthesis of ${E}'s key strengths and their impact to date.
2. The principal areas for development and the support that will be provided.
3. Progress against the Teachers' Standards as the evidence above shows it, written for the induction tutor to confirm. Do not make the formal induction judgement yourself.${body.includeProfessionalDevelopmentPlan ? PDP : ""}

Throughout: third person, formal language, Teachers' Standards by number and full title at every mention, no emojis, and no vague descriptors.`;

  return { system: SYSTEM, user };
}
