// Ofsted's renewed education inspection framework, in one place.
//
// From 10 November 2025 state-funded schools are inspected against evaluation
// areas, each graded separately on a report card, instead of the old four
// judgements (quality of education; behaviour and attitudes; personal
// development; leadership and management) and one overall effectiveness grade.
// Several tool prompts named the old judgements; they now read this module, so
// the next change to the framework is one edit.
//
// Checked against the "State-funded school inspection toolkit", v2.0, updated
// June 2026, for use on inspections from 7 September 2026. Ofsted updates the
// toolkit roughly once a year: re-check this file when it does.

export const OFSTED_TOOLKIT_VERSION = "State-funded school inspection toolkit, for use from 7 September 2026";

export interface OfstedArea {
  name: string;
  /** Only inspected where the school has this provision. */
  whereRelevant?: boolean;
  /** What inspectors look at, in brief, for prompts. */
  focus: string;
}

/** Safeguarding is not graded on the scale: it is met or not met. */
export const OFSTED_SAFEGUARDING: OfstedArea = {
  name: "Safeguarding",
  focus:
    "judged as met or not met, not graded: an open and positive safeguarding culture that puts pupils' interests first, an effective whole-school approach led by leaders and those responsible for governance, safer recruitment and the single central record, the designated safeguarding lead's capacity, record keeping, and work with multi-agency safeguarding partners",
};

/** The graded evaluation areas, in the toolkit's order. */
export const OFSTED_GRADED_AREAS: OfstedArea[] = [
  {
    name: "Inclusion",
    focus:
      "how leaders and staff identify and support disadvantaged pupils (pupil premium), pupils with SEND, pupils known or previously known to children's social care, and others facing barriers to learning or wellbeing, and how well that support removes the barriers",
  },
  {
    name: "Curriculum and teaching",
    focus:
      "an ambitious, well-sequenced curriculum for all pupils (the intent) and how effectively it is taught across subjects, year groups and key stages (the implementation), including reading, adaptive teaching and how teachers check and secure understanding",
  },
  {
    name: "Achievement",
    focus:
      "whether the school provides a high-quality education for all pupils (the impact), shown in what pupils know, remember and can do, national and internal outcomes, and the progress of disadvantaged pupils and those with SEND",
  },
  {
    name: "Attendance and behaviour",
    focus:
      "a calm, orderly, respectful and supportive environment, high expectations of conduct, how leaders improve attendance and punctuality, the use and effect of suspensions and exclusions, and pupils' attitudes to learning",
  },
  {
    name: "Personal development and wellbeing",
    focus:
      "a suitable, coherent programme of personal development through the curriculum and wider opportunities: PSHE and RSHE, careers guidance where applicable, character, citizenship, physical and mental health, and readiness for life in modern Britain",
  },
  {
    name: "Early years",
    whereRelevant: true,
    focus:
      "the early years provision as a whole: the curriculum across the areas of learning, the quality of adult interactions, communication and language, early reading, and how well children are prepared for Year 1",
  },
  {
    name: "Post-16 provision",
    whereRelevant: true,
    focus:
      "the sixth form or other post-16 provision: the ambition and quality of study programmes, teaching, retention, outcomes, and guidance on next steps",
  },
  {
    name: "Leadership and governance",
    focus:
      "the ambition and integrity of leaders and those responsible for governance, accurate self-evaluation, staff development, workload and wellbeing, engagement with parents, and how leaders secure improvement and share practice beyond the school",
  },
];

/** The report card scale, lowest to highest. */
export const OFSTED_GRADES = ["Urgent improvement", "Needs attention", "Expected standard", "Strong standard", "Exceptional"] as const;

/** One paragraph a prompt can carry wherever it mentions Ofsted. */
export function ofstedFrameworkSummary(): string {
  const graded = OFSTED_GRADED_AREAS.map((a) => (a.whereRelevant ? `${a.name.toLowerCase()} (where the school has it)` : a.name.toLowerCase())).join("; ");
  return (
    `Ofsted inspects state-funded schools under its renewed education inspection framework (from November 2025), using the ${OFSTED_TOOLKIT_VERSION}. ` +
    `There is no single overall effectiveness grade. Instead a report card grades each evaluation area separately: ${graded}. ` +
    `Each graded area uses a five-point scale: ${OFSTED_GRADES.join(", ")}. Safeguarding is judged separately as met or not met. ` +
    `Never use the old judgement names "quality of education", "behaviour and attitudes", "leadership and management" or "overall effectiveness", nor the old grades "outstanding", "good", "requires improvement" or "inadequate", except when describing a school's past inspection.`
  );
}
