// ── Plan gates — single source of truth ──────────────────────────────────────
// Every feature limit and entitlement is defined here. The pricing page, the
// usage counters, and the runtime gates all read from this config so a plan
// change in one place propagates everywhere.

export type PlanId = "free" | "pro" | "school";

export type ExportFormat = "pdf" | "docx" | "pptx";

export interface PlanLimits {
  /** Max AI generations per calendar month. `null` = unlimited. */
  monthlyGenerations: number | null;
  /** Exported files carry a "Made with Jooma" watermark. */
  watermark: boolean;
  /** Export formats this plan may use. */
  exportFormats: ExportFormat[];
  /** Curriculum alignment depth. */
  curriculumAlignment: "limited" | "full";
  /** Outputs can be edited in the editor before export. */
  editableOutputs: boolean;
  /** Save & organise a personal resource library. */
  saveLibrary: boolean;
  /** Priority support queue. */
  prioritySupport: boolean;
  // ── School-only capabilities ──
  multiUser: boolean;
  sharedLibrary: boolean;
  adminDashboard: boolean;
  usageAnalytics: boolean;
  schoolBranding: boolean;
  centralBilling: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD. `null` = custom/contact sales. */
  priceMonthly: number | null;
  /** Yearly price per month in USD (the discounted rate). */
  priceYearlyPerMonth: number | null;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free Plan",
    priceMonthly: 0,
    priceYearlyPerMonth: 0,
    limits: {
      monthlyGenerations: 5,
      watermark: true,
      exportFormats: ["pdf"],
      curriculumAlignment: "limited",
      editableOutputs: false,
      saveLibrary: false,
      prioritySupport: false,
      multiUser: false,
      sharedLibrary: false,
      adminDashboard: false,
      usageAnalytics: false,
      schoolBranding: false,
      centralBilling: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro Teacher",
    priceMonthly: 149,
    priceYearlyPerMonth: 119,
    limits: {
      monthlyGenerations: null,
      watermark: false,
      exportFormats: ["pdf", "docx", "pptx"],
      curriculumAlignment: "full",
      editableOutputs: true,
      saveLibrary: true,
      prioritySupport: true,
      multiUser: false,
      sharedLibrary: false,
      adminDashboard: false,
      usageAnalytics: false,
      schoolBranding: false,
      centralBilling: false,
    },
  },
  school: {
    id: "school",
    name: "School Plan",
    priceMonthly: null,
    priceYearlyPerMonth: null,
    limits: {
      monthlyGenerations: null,
      watermark: false,
      exportFormats: ["pdf", "docx", "pptx"],
      curriculumAlignment: "full",
      editableOutputs: true,
      saveLibrary: true,
      prioritySupport: true,
      multiUser: true,
      sharedLibrary: true,
      adminDashboard: true,
      usageAnalytics: true,
      schoolBranding: true,
      centralBilling: true,
    },
  },
};

export const DEFAULT_PLAN: PlanId = "free";

/** Coerce an arbitrary string (e.g. a DB value) into a valid PlanId. */
export function asPlanId(value: string | null | undefined): PlanId {
  return value === "pro" || value === "school" ? value : DEFAULT_PLAN;
}

/** Read the limits object for a plan. */
export function limitsFor(plan: PlanId): PlanLimits {
  return PLANS[plan].limits;
}

// ── Gate helpers ──────────────────────────────────────────────────────────────
// Boolean entitlements (everything in PlanLimits except the numeric/array ones).
type BooleanGate = {
  [K in keyof PlanLimits]: PlanLimits[K] extends boolean ? K : never;
}[keyof PlanLimits];

/** True if the plan has the given boolean entitlement. */
export function can(plan: PlanId, gate: BooleanGate): boolean {
  return PLANS[plan].limits[gate];
}

/** True if the plan may export to the given format. */
export function canExport(plan: PlanId, format: ExportFormat): boolean {
  return PLANS[plan].limits.exportFormats.includes(format);
}

export interface GenerationGate {
  /** Whether the user may run another generation right now. */
  allowed: boolean;
  /** Generations used this month. */
  used: number;
  /** The plan's monthly cap, or null for unlimited. */
  limit: number | null;
  /** Generations remaining this month, or null for unlimited. */
  remaining: number | null;
}

/** Evaluate the monthly-generation gate for a plan given the current usage. */
export function generationGate(plan: PlanId, usedThisMonth: number): GenerationGate {
  const limit = PLANS[plan].limits.monthlyGenerations;
  if (limit === null) {
    return { allowed: true, used: usedThisMonth, limit: null, remaining: null };
  }
  return {
    allowed: usedThisMonth < limit,
    used: usedThisMonth,
    limit,
    remaining: Math.max(0, limit - usedThisMonth),
  };
}
