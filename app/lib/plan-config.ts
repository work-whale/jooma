/*
 * Jooma 4.5 plans: every number in one place.
 *
 * Ash's build spec (docs/Jooma version 4.5, Step 1) asks for one config file
 * so that a later change, such as Free dropping to 30 a week, is a one-line
 * edit. This is that file. Screens, gates and emails read from here and never
 * restate a number.
 *
 * Where the spec table and the owner's red notes disagree, the red notes win:
 *   - The Jooma mark is on Free AND the Pro trial exports; Standard is clean.
 *   - Custom deck themes are left alone (off everywhere).
 *   - Max is Pro with 2,500 resources; "priority building" is dropped.
 *
 * The unit is "resources": 1 resource is 0.15p of measured model spend (see
 * PENCE_PER_CREDIT in plans.ts), so these allowances must equal planCredits().
 * A unit test holds the two together.
 *
 * `null` means unlimited.
 *
 * Pure: no imports from the server or the database, so it is safe in client
 * components and in unit tests.
 */

export const PLAN_TIMEZONE = "Europe/London";

export type RefillRule = "weekly_sunday_0000" | "monthly_on_start_day" | "once";

export interface PlanSpec {
  /** Monthly price in GBP, VAT included. */
  monthly: number;
  /** Yearly price in GBP, VAT included. `null` = not sold yearly. */
  yearly: number | null;
  /** The allowance, in resources, set at each refill. */
  resources: number;
  refill: RefillRule;
  /** Generated pictures in decks and sheets. Otherwise library photos. */
  pictures: boolean;
  /** "Made with Jooma" on exported files. */
  exportMark: boolean;
  /** Refines with Jo per week. `null` = unlimited. */
  refinesPerWeek: number | null;
  /** May buy top-up packs. */
  topUps: boolean;
  /** Left alone by the owner: off everywhere until built. */
  customThemes: boolean;
  /** Pricing page label above the column. */
  badge?: string;
  /** Pricing page line under the name. */
  tagline?: string;
}

export const PLAN_CONFIG = {
  free: {
    monthly: 0,
    yearly: null,
    resources: 50,
    refill: "weekly_sunday_0000",
    pictures: false,
    exportMark: true,
    refinesPerWeek: 10,
    topUps: false,
    customThemes: false,
  },
  standard: {
    monthly: 4.99,
    yearly: 47.99,
    resources: 500,
    refill: "monthly_on_start_day",
    pictures: false,
    // Red note: Standard exports are clean (spec table said marked).
    exportMark: false,
    refinesPerWeek: null,
    topUps: true,
    customThemes: false,
  },
  pro: {
    monthly: 7.99,
    yearly: 71.99,
    resources: 1000,
    refill: "monthly_on_start_day",
    pictures: true,
    exportMark: false,
    refinesPerWeek: null,
    topUps: true,
    customThemes: false,
    badge: "Recommended",
  },
  max: {
    // New monthly payers only. Anyone already paying £14.99 keeps it.
    monthly: 13.99,
    yearly: 143.99,
    resources: 2500,
    refill: "monthly_on_start_day",
    pictures: true,
    exportMark: false,
    refinesPerWeek: null,
    topUps: true,
    customThemes: false,
    tagline: "For heads of department and heavy planners",
  },
} as const satisfies Record<"free" | "standard" | "pro" | "max", PlanSpec>;

export type SelfServePlan = keyof typeof PLAN_CONFIG;

/**
 * The trial: Pro features, a single 300 window, ending 23:59 UK time on the
 * signup date plus ten days (see trialEndsAt in resource-periods.ts).
 * Red note: trial exports carry the Jooma mark.
 */
export const TRIAL = {
  plan: "pro",
  days: 10,
  resources: 300,
  refill: "once",
  pictures: true,
  exportMark: true,
  refinesPerWeek: null,
  topUps: false,
  oncePerEmail: true,
} as const;

/**
 * Every state an account's plan can be in, as `profiles.plan` will hold it.
 * `pro_trial` arrives with the Stage 2 migration; `school` is contact sales
 * and not metered by this config.
 */
export type AccountPlan = SelfServePlan | "pro_trial" | "school";

function spec(plan: AccountPlan) {
  if (plan === "pro_trial") return TRIAL;
  if (plan === "school") return null;
  return PLAN_CONFIG[plan];
}

/** The resources set at each refill. `null` for School (not metered here). */
export function allowanceFor(plan: AccountPlan): number | null {
  return spec(plan)?.resources ?? null;
}

/** Whether an export made NOW, on this plan, carries the Jooma mark. Decided
 *  at export time, so re-exporting a trial deck on Free adds the mark. */
export function exportMarkFor(plan: AccountPlan): boolean {
  return spec(plan)?.exportMark ?? false;
}

/** Generated pictures. Free and Standard get library photos instead. */
export function picturesAllowed(plan: AccountPlan): boolean {
  return spec(plan)?.pictures ?? true;
}

/** Refines per week. `null` = unlimited. Refining never spends resources. */
export function refinesPerWeek(plan: AccountPlan): number | null {
  return spec(plan)?.refinesPerWeek ?? null;
}

/** May buy a top-up pack. Not Free, not the trial. */
export function topUpsAllowed(plan: AccountPlan): boolean {
  return spec(plan)?.topUps ?? false;
}

/**
 * Top-up packs. They never expire and are spent only after the allowance.
 * `id` rides the Stripe Checkout metadata, so never rename one that has sold.
 */
export const TOP_UP_PACKS = [
  { id: "pack-500", resources: 500, price: 2.49 },
  { id: "pack-1500", resources: 1500, price: 5.99 },
  { id: "pack-4000", resources: 4000, price: 12.99 },
] as const;

export type TopUpPackId = (typeof TOP_UP_PACKS)[number]["id"];

/** The only discount: half the first month of Pro monthly, once per account,
 *  offered on the second run-out and valid for seven days. */
export const OFFER = {
  code: "PRO-HALF-FIRST-MONTH",
  plan: "pro",
  interval: "month",
  firstMonthPrice: 3.99,
  validDays: 7,
  oncePerAccount: true,
} as const;

/* ── Time saved ──────────────────────────────────────────────────────────── */

export type ToolBand = "quick" | "standard" | "longForm" | "decks";

/** Ash's minutes per band, used by P2, P8 and the emails. To be confirmed by
 *  Ash; until then these are the spec's numbers. */
export const MINUTES_SAVED_PER_BAND: Record<ToolBand, number> = {
  quick: 10,
  standard: 20,
  longForm: 40,
  decks: 45,
};

/**
 * Each tool's band, keyed by slug (the href after /tools/). A unit test holds
 * this to exactly the tools on the Make page, so a new tool cannot ship
 * without one.
 */
export const TOOL_BANDS: Record<string, ToolBand> = {
  // Decks
  slideshow: "decks",
  "cpd-slideshow": "decks",
  // Long form: a whole plan or document
  "lesson-planner": "longForm",
  "topic-overview": "longForm",
  "medium-term-planner": "longForm",
  "eyfs-planner": "longForm",
  "exam-question-generator": "longForm",
  "report-writer": "longForm",
  "behaviour-support-plan": "longForm",
  "pupil-premium-planner": "longForm",
  "ect-report-writer": "longForm",
  "policy-generator": "longForm",
  "eyfs-action-plan": "longForm",
  "inspection-prep": "longForm",
  "performance-management": "longForm",
  "school-improvement-plan": "longForm",
  // Standard: one resource for one lesson or one pupil
  "comprehension-generator": "standard",
  "worksheet-generator": "standard",
  "model-text-generator": "standard",
  "sensory-activities": "standard",
  "phonics-support": "standard",
  "model-answer-generator": "standard",
  "homework-generator": "standard",
  "cover-lesson": "standard",
  "one-page-profile": "standard",
  "risk-assessment": "standard",
  "targeted-intervention": "standard",
  "assembly-planner": "standard",
  "newsletter-writer": "standard",
  "learning-walk-report": "standard",
  "lesson-observation-report": "standard",
  "meeting-planner": "standard",
  // Quick
  "quiz-generator": "quick",
  "letter-writer": "quick",
  "smart-targets": "quick",
};

/** Minutes a teacher saved with one resource from this tool. */
export function minutesSavedFor(slug: string): number {
  return MINUTES_SAVED_PER_BAND[TOOL_BANDS[slug] ?? "standard"];
}
