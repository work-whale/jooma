/*
 * Which tools fit which school systems.
 *
 *   universal  works anywhere as it is (the curriculum override does the rest)
 *   adapts     works anywhere, with some UK-only options hidden or reworded
 *   uk-only    built on an England-only framework; hidden from teachers on any
 *              other system (approved 2026-11-14)
 *
 * Jersey, Guernsey, the Isle of Man and Gibraltar teach England's curriculum,
 * EYFS included, so they count as "UK-like" here and keep every tool.
 *
 * Shared by client and server: no server-only imports.
 */

import { keyStageFor, type KeyStage } from "@/app/lib/comprehension-domains";
import { DIFFERENTIATION_BANDS } from "@/app/lib/differentiation";
import { EXAM_STYLES, type ExamStyle } from "@/app/lib/sheets/exam-styles";

import { englandYearFor, yearForEnglandYear } from "./england-years";
import { getCurriculum } from "./index";

export type ToolScope = "universal" | "adapts" | "uk-only";

/** Keyed by tool slug (the /tools/<slug> path). tests/unit/curricula-tools
 *  fails if a tool is added without a scope. */
export const TOOL_SCOPE: Record<string, ToolScope> = {
  "assembly-planner": "universal",
  "behaviour-support-plan": "adapts",
  "comprehension-generator": "adapts",
  "cover-lesson": "universal",
  "cpd-slideshow": "universal",
  "ect-report-writer": "uk-only",
  "exam-question-generator": "adapts",
  "eyfs-action-plan": "uk-only",
  "eyfs-planner": "uk-only",
  "homework-generator": "universal",
  "inspection-prep": "uk-only",
  "learning-walk-report": "adapts",
  "lesson-observation-report": "adapts",
  "lesson-planner": "universal",
  "letter-writer": "adapts",
  "medium-term-planner": "universal",
  "meeting-planner": "adapts",
  "model-answer-generator": "adapts",
  "model-text-generator": "universal",
  "newsletter-writer": "adapts",
  "one-page-profile": "adapts",
  "performance-management": "adapts",
  "phonics-support": "adapts",
  "policy-generator": "adapts",
  "pupil-premium-planner": "uk-only",
  "quiz-generator": "universal",
  "report-writer": "adapts",
  "risk-assessment": "adapts",
  "school-improvement-plan": "adapts",
  "sensory-activities": "adapts",
  slideshow: "universal",
  "smart-targets": "adapts",
  "targeted-intervention": "adapts",
  "topic-overview": "universal",
  "worksheet-generator": "universal",
};

/** True when this curriculum teaches England's frameworks: the UK five and
 *  the islands and Gibraltar. Unknown or none counts as UK-like, so a failed
 *  lookup never hides anything. */
function ukLike(curriculumId: unknown): boolean {
  const c = getCurriculum(curriculumId);
  return !c || c.region === "uk" || c.region === "british-isles";
}

export function isToolHiddenFor(slug: string, curriculumId: unknown): boolean {
  return TOOL_SCOPE[slug] === "uk-only" && !ukLike(curriculumId);
}

/** The slugs to leave out of the tool grid, search and suggestions. */
export function hiddenToolSlugs(curriculumId: unknown): string[] {
  return ukLike(curriculumId) ? [] : Object.keys(TOOL_SCOPE).filter((s) => TOOL_SCOPE[s] === "uk-only");
}

/** Whether the Phonics tool offers England's DfE-validated schemes. */
export function showsUkPhonicsSchemes(curriculumId: unknown): boolean {
  return ukLike(curriculumId);
}

// ── Options that change with the school system ─────────────────────────────

/** The same four band values, named in plain words for a teacher who has
 *  never met England's KS1 and KS2 assessment codes. The values (and so the
 *  saved runs, tabs and prompts) are unchanged; the override tells the model
 *  what they mean in the teacher's system. */
const PLAIN_BANDS = [
  { value: "WBS", label: "Well below", detail: "Working well below expected" },
  { value: "WTS", label: "Below", detail: "Working towards expected" },
  { value: "EXS", label: "Expected", detail: "Working at the expected level" },
  { value: "GDS", label: "Above", detail: "Working above expected" },
] as const;

export function bandsFor(curriculumId: unknown): typeof DIFFERENTIATION_BANDS | typeof PLAIN_BANDS {
  return ukLike(curriculumId) ? DIFFERENTIATION_BANDS : PLAIN_BANDS;
}

/** Exam paper styles on offer. KS2 SATs and the GCSE boards are England's;
 *  anyone else gets the school test, which the override pitches to their
 *  system's own assessments. */
export function examStylesFor(curriculumId: unknown): ExamStyle[] {
  return ukLike(curriculumId) ? EXAM_STYLES : EXAM_STYLES.filter((s) => s.phase === "school");
}

/** Which set of reading skills (the KS1 or KS2 content domains) fits a year.
 *  The UK rule is England's labels, read at the same age for Northern Ireland
 *  (its Year 2 and Year 3 get KS1's skills); any other system goes by age:
 *  KS1's skills for pupils starting the year aged 5 or 6. */
export function readingStageFor(yearGroup: string, mixed: boolean, curriculumId: unknown): KeyStage {
  const c = getCurriculum(curriculumId);
  if (!c) return keyStageFor(yearGroup, mixed);
  if (ukLike(c.id)) return keyStageFor(englandYearFor(c.id, yearGroup), mixed);
  const age = c.years.find((y) => y.label === yearGroup)?.age;
  return !mixed && (age === 5 || age === 6) ? "ks1" : "ks2";
}

/** The year an exam style sets when picked (the KS2 styles: Year 6), in the
 *  teacher's own year names; null when the style is for several years. */
export function examStyleYearFor(style: Pick<ExamStyle, "years">, curriculumId: unknown): string | null {
  return style.years.length === 1 ? yearForEnglandYear(curriculumId, style.years[0]) : null;
}
