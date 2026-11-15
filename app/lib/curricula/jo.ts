/*
 * Jo and the curriculum.
 *
 * Jo is told to default the curriculum to "2014 National Curriculum" (a
 * default in prose that toolPrefill.applyDefaults makes a guarantee) and its
 * year names are England's. For a teacher on another school system the prefill
 * is fitted afterwards, in code, never left to the model:
 *
 *   - the England default becomes the teacher's own curriculum, unless what
 *     they said names England's (a KS2 SATs paper, a GCSE, the EYFS)
 *   - the year becomes the one at the same age in that curriculum ("Year 4",
 *     age 8, is 3rd Class in Ireland), or is dropped if there is none
 *
 * Shared by client and server: no server-only imports.
 */

import { CURRICULA_REGISTRY, getCurriculum, yearsFor } from "./index";

/** Every curriculum label, the UK five first (today's enum, unchanged). */
export const JO_CURRICULUM_VALUES: string[] = CURRICULA_REGISTRY.map((c) => c.promptLabel);

/** Every year label, England's first (today's enum, unchanged). */
export const JO_YEAR_VALUES: string[] = [...new Set(CURRICULA_REGISTRY.flatMap((c) => c.years.map((y) => y.label)))];

const ENGLAND_DEFAULT = "england";

/** What the teacher said names England's curriculum or assessments. */
const NAMES_ENGLAND = /\b(england|english national curriculum|national curriculum|key stage|ks ?[1-5]|eyfs|early years foundation stage|gcses?|sats|ofsted)\b/i;

/** The age a year label means: the UK reading first, as Jo is told. */
function ageOf(label: string): number | undefined {
  for (const c of CURRICULA_REGISTRY) {
    const y = c.years.find((v) => v.label === label);
    if (y) return y.age;
  }
  return undefined;
}

/**
 * Fit a prefill's curriculum and year to the teacher's school system. Mutates
 * `fields`; does nothing for a tool with no curriculum field, or for a teacher
 * whose curriculum is England's or unknown.
 */
export function fitPrefillToCurriculum(fields: Record<string, unknown>, teacherCurriculum: unknown, said: string): void {
  if (typeof fields.curriculum !== "string") {
    fitWizardYear(fields, teacherCurriculum);
    return;
  }
  const teacher = getCurriculum(teacherCurriculum);
  if (!teacher || teacher.id === ENGLAND_DEFAULT) return;

  const chosen = getCurriculum(fields.curriculum);
  if (chosen?.id === ENGLAND_DEFAULT && !NAMES_ENGLAND.test(said)) fields.curriculum = teacher.promptLabel;

  if (typeof fields.yearGroup !== "string") return;
  const years = yearsFor(fields.curriculum);
  if (years.some((y) => y.label === fields.yearGroup)) return;
  const age = ageOf(fields.yearGroup);
  const match = age === undefined ? undefined : years.find((y) => y.age === age);
  if (match) fields.yearGroup = match.label;
  else delete fields.yearGroup;
}

/**
 * The slides wizard has no curriculum field, only `year`, from its own list:
 * England's years for a UK-like teacher, the teacher's own years (plus adult
 * learners) for anyone else (GenerateModal). Jo fills it with England's names,
 * so outside the UK the year becomes the one at the same age, or is dropped.
 */
function fitWizardYear(fields: Record<string, unknown>, teacherCurriculum: unknown): void {
  const teacher = getCurriculum(teacherCurriculum);
  if (!teacher || teacher.region === "uk" || teacher.region === "british-isles") return;
  if (typeof fields.year !== "string" || fields.year === "Adult learners") return;
  if (teacher.years.some((y) => y.label === fields.year)) return;
  const age = ageOf(fields.year);
  const match = age === undefined ? undefined : teacher.years.find((y) => y.age === age);
  if (match) fields.year = match.label;
  else delete fields.year;
}
