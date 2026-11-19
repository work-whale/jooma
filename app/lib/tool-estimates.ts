/*
 * What a tool typically costs, in resources, for the "about N resources" chip
 * and the "Usually about N" cost line.
 *
 * Charging stays MEASURED: a generation costs what it really cost (see
 * PENCE_PER_CREDIT in plans.ts; 1 resource is 0.15p of model spend). These
 * figures are only what a teacher can expect, shown before they press Make.
 *
 * Two sources, chosen per tool:
 *
 *   production  Tools with 15 or more saved runs in the 90 days to 19 Nov 2026:
 *               total measured spend (token_usage plus asset_cost) divided by
 *               the resources saved, so abandoned runs and sheet pictures are
 *               in it. Real teachers' inputs. Query:
 *               scripts/tool-cost-estimates.sql (read-only, production).
 *
 *   staging     Every other tool: the median of 5 real runs on staging on
 *               19 Nov 2026, on the uplifted prompts, with production's model
 *               settings (tool_settings matched). Inputs are the forms' own
 *               request bodies (tests/tools/measure-tool-costs.spec.ts, run
 *               with MEASURE_COSTS=1). Reports is a class of 30.
 *               Production had 0 to 10 runs for these, too few to trust.
 *
 * Slides is its TEXT only (deck, outline, audio, video search). Generated
 * pictures are added per picture from PICTURE_ESTIMATE and deckPictureCount,
 * because a deck on library photos (the default, and all Free and Standard
 * decks) costs no picture spend at all.
 *
 * Re-measure after a prompt or model change, and move a tool to production
 * once it has 15 or more saved runs there.
 */

export interface ToolEstimate {
  /** Typical resources per saved resource. */
  resources: number;
  source: "production" | "staging";
}

/** One generated picture in a deck: production average, 286 images. */
export const PICTURE_ESTIMATE = 5.3;

/** For a slug with no entry (should not happen: the unit test checks). */
export const UNMEASURED_ESTIMATE = 5;

const prod = (resources: number): ToolEstimate => ({ resources, source: "production" });
const stg = (resources: number): ToolEstimate => ({ resources, source: "staging" });

export const TOOL_ESTIMATES: Record<string, ToolEstimate> = {
  // Slides (production: 162 decks)
  slideshow: prod(17),
  // A CPD deck is a deck, gated as /api/slideshow: the same figure.
  "cpd-slideshow": prod(17),
  // Planning
  "lesson-planner": prod(29.5),
  "topic-overview": stg(21.4),
  "medium-term-planner": stg(2.7),
  "eyfs-planner": stg(21),
  "homework-generator": stg(7),
  "cover-lesson": stg(1.6),
  // Classroom resources
  "comprehension-generator": prod(3.3),
  "worksheet-generator": prod(2.5),
  "model-text-generator": stg(0.5),
  "sensory-activities": stg(14),
  "phonics-support": stg(24.8),
  // Assessment
  "exam-question-generator": prod(1.7),
  "model-answer-generator": stg(12.9),
  "quiz-generator": prod(0.6),
  "report-writer": stg(4.4),
  "smart-targets": stg(0.1),
  "ect-report-writer": stg(3.3),
  // Behaviour and SEND
  "one-page-profile": stg(0.3),
  "risk-assessment": stg(11.1),
  "behaviour-support-plan": stg(13.6),
  "targeted-intervention": stg(1.2),
  "pupil-premium-planner": stg(1),
  // Communication
  "meeting-planner": stg(0.5),
  "letter-writer": stg(0.2),
  "assembly-planner": stg(0.8),
  "newsletter-writer": stg(0.1),
  // Leadership
  "policy-generator": stg(2.3),
  "eyfs-action-plan": stg(11.1),
  "inspection-prep": stg(13.3),
  "learning-walk-report": stg(0.5),
  "lesson-observation-report": stg(0.6),
  "performance-management": stg(0.4),
  "school-improvement-plan": stg(6.1),
};

/** Typical resources for a tool, plus any generated pictures. */
export function estimateFor(slug: string, opts: { pictures?: number } = {}): number {
  const base = TOOL_ESTIMATES[slug]?.resources ?? UNMEASURED_ESTIMATE;
  const pictures = Math.max(0, Math.floor(opts.pictures ?? 0));
  return base + pictures * PICTURE_ESTIMATE;
}

/**
 * Generated pictures a deck will make, for its estimate. Library photos make
 * none. A deck has about one picture a slide plus the title (production:
 * Generated decks averaged 11.1 pictures for 10.4 slides), and Auto splits
 * them with the pipeline's own counter: the first `imageMixWeb` of every 10
 * are library photos (app/lib/slideshow-pipeline.ts). No source means Auto at
 * 8 web : 2 generated, as the pipeline treats it.
 */
export function deckPictureCount(deck: {
  imageSource?: "auto" | "ai" | "web";
  imageMixWeb?: number;
  slideCount?: number;
}): number {
  const source = deck.imageSource ?? "auto";
  if (source === "web") return 0;
  const slides = Math.max(0, Math.min(30, Math.round(deck.slideCount ?? 8)));
  if (slides === 0) return 0;
  const pictures = slides + 1;
  if (source === "ai") return pictures;
  const webParts = Math.max(0, Math.min(10, Math.round(deck.imageMixWeb ?? 8)));
  let generated = 0;
  for (let i = 0; i < pictures; i++) if (i % 10 >= webParts) generated += 1;
  return generated;
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
