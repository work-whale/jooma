/*
 * What a tool typically costs, in resources, for the "about N resources" chip.
 *
 * Charging stays MEASURED: a generation costs what it really cost (see
 * PENCE_PER_CREDIT in plans.ts; 1 resource is 0.15p of model spend). These
 * figures are only what a teacher can expect, shown before they press Make.
 *
 * SOURCE: production, 90 days to 17 Nov 2026, read-only. Total measured spend
 * per tool (token_usage plus asset_cost) divided by the resources actually
 * saved (tool_runs). Spend on abandoned runs is therefore spread over the saved
 * ones, which is the honest figure for "what does a finished one cost".
 * Re-pull with the query in scripts/tool-cost-estimates.sql.
 *
 * Slides is its TEXT only (deck, outline, audio, video search). Generated
 * pictures are added per picture from PICTURE_ESTIMATE, because Free and
 * Standard decks use library photos and cost no picture spend at all.
 *
 * Tools with no saved production run in the window are `measured: false` and
 * carry UNMEASURED_ESTIMATE until there is data.
 */

export interface ToolEstimate {
  /** Typical resources per saved resource. */
  resources: number;
  /** False when production had no runs to measure. */
  measured: boolean;
}

/** One generated picture in a deck: production average, 286 images. */
export const PICTURE_ESTIMATE = 5.3;

/** For a tool production has not measured yet. Cautious, not zero. */
export const UNMEASURED_ESTIMATE = 5;

const m = (resources: number): ToolEstimate => ({ resources, measured: true });
const UNMEASURED: ToolEstimate = { resources: UNMEASURED_ESTIMATE, measured: false };

export const TOOL_ESTIMATES: Record<string, ToolEstimate> = {
  // Slides
  slideshow: m(17),
  "cpd-slideshow": m(0.9),
  // Planning
  "lesson-planner": m(29.5),
  "topic-overview": m(15.8),
  "medium-term-planner": m(1.5),
  "eyfs-planner": m(58),
  "homework-generator": m(3.9),
  "cover-lesson": m(1.9),
  // Classroom resources
  "comprehension-generator": m(3.3),
  "worksheet-generator": m(2.5),
  "model-text-generator": m(1.1),
  "sensory-activities": m(19.2),
  "phonics-support": m(23),
  // Assessment
  "exam-question-generator": m(1.7),
  "model-answer-generator": m(12.5),
  "quiz-generator": m(0.6),
  "report-writer": m(0.1),
  "smart-targets": UNMEASURED,
  "ect-report-writer": UNMEASURED,
  // Behaviour and SEND
  "one-page-profile": m(1.3),
  "risk-assessment": UNMEASURED,
  "behaviour-support-plan": m(18.8),
  "targeted-intervention": m(1.3),
  "pupil-premium-planner": UNMEASURED,
  // Communication
  "meeting-planner": m(0.8),
  "letter-writer": m(0.4),
  "assembly-planner": UNMEASURED,
  "newsletter-writer": UNMEASURED,
  // Leadership
  "policy-generator": UNMEASURED,
  "eyfs-action-plan": UNMEASURED,
  "inspection-prep": UNMEASURED,
  "learning-walk-report": UNMEASURED,
  "lesson-observation-report": m(1.2),
  "performance-management": UNMEASURED,
  "school-improvement-plan": UNMEASURED,
};

/** Typical resources for a tool, plus any generated pictures. */
export function estimateFor(slug: string, opts: { pictures?: number } = {}): number {
  const base = TOOL_ESTIMATES[slug]?.resources ?? UNMEASURED_ESTIMATE;
  const pictures = Math.max(0, Math.floor(opts.pictures ?? 0));
  return base + pictures * PICTURE_ESTIMATE;
}

/** Never zero; whole numbers up to 10; the nearest 5 from there. */
export function roundEstimate(value: number): number {
  if (value < 10) return Math.max(1, Math.ceil(value));
  return Math.round(value / 5) * 5;
}

/** "about 30 resources", "about 1 resource". */
export function estimateLabel(value: number): string {
  const n = roundEstimate(value);
  return `about ${n} ${n === 1 ? "resource" : "resources"}`;
}
