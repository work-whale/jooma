/*
 * What the Phase 1 prompts put on screen (Jooma 4.5 spec Step 5, and Step 2
 * "Running out"). The rules for WHEN they show are in prompts.ts; this turns
 * the account and the server's 402 payload into words and buttons.
 *
 * Pure: shared by the sidebar, the tool chrome, UpgradeGate and the tests.
 */

import { PLAN_CONFIG, type AccountPlan } from "@/app/lib/plan-config";
import { PROMPT_COPY } from "@/app/lib/prompts";
import { estimateCheck, type OutOfResources } from "@/app/lib/resources";
import { estimateFor, roundEstimate } from "@/app/lib/tool-estimates";
import { trialDateShort } from "@/app/lib/account-plan";

const n = (v: number) => v.toLocaleString("en-GB");

/* ── The cost line, as soon as a tool opens ─────────────────────────────── */

export interface CostLine {
  enough: boolean;
  text: string;
}

/** Same rounding and check as the server's gate, so the line never says
 *  "enough" and then the Make button is refused. */
export function costLine(slug: string, left: number): CostLine {
  const estimate = estimateFor(slug);
  const check = estimateCheck(estimate, left);
  if (!check.ok) return { enough: false, text: check.message };
  const need = roundEstimate(estimate);
  return {
    enough: true,
    text: `Usually about ${need} ${need === 1 ? "resource" : "resources"}. You have ${n(Math.max(0, Math.floor(left)))}.`,
  };
}

/* ── P3, out of resources ───────────────────────────────────────────────── */

export type PromptAction = "picker" | "close" | "switch_to_free" | "card";

export interface PromptButton {
  label: string;
  action: PromptAction;
}

export interface P3View {
  variant: "free" | "trial";
  title: string;
  body: string;
  /** "This usually needs about 30. You have 12." */
  need: string;
  primary: PromptButton;
  secondary: PromptButton;
}

/** Null for a paid plan's payload: that is a top up, not P3. */
export function p3View(p: OutOfResources): P3View | null {
  if (p.prompt !== "P3" || (p.variant !== "free" && p.variant !== "trial")) return null;
  const copy = PROMPT_COPY.P3[p.variant];
  const need = `This usually needs about ${p.needed}. You have ${n(Math.max(0, p.left))}.`;
  return {
    variant: p.variant,
    title: copy.title,
    body: copy.body,
    need,
    primary: { label: copy.buttons[0], action: "picker" },
    secondary: { label: copy.buttons[1], action: p.variant === "trial" ? "switch_to_free" : "close" },
  };
}

/* ── P2, the trial has ended ────────────────────────────────────────────── */

/** "About" hours: rounded, and never 0 once anything was saved. */
export function hoursSaved(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.max(1, Math.round(minutes / 60));
}

export function p2View(v: { made: number; minutes: number }): { title: string; body: string; buttons: string[] } {
  const free = PLAN_CONFIG.free.resources;
  const rest =
    `You're on Free now: everything you made is safe, you have ${free} resources to use today, ` +
    `and ${free} more arrive every Sunday.`;
  const hours = hoursSaved(v.minutes);
  const made =
    v.made > 0
      ? `You made ${n(v.made)} ${v.made === 1 ? "resource" : "resources"}` +
        (hours > 0 ? ` and saved about ${n(hours)} ${hours === 1 ? "hour" : "hours"}. ` : ". ")
      : "";
  return { title: PROMPT_COPY.P2.title, body: made + rest, buttons: [...PROMPT_COPY.P2.buttons] };
}

/* ── P12, payment failed ────────────────────────────────────────────────── */

const NAMES: Record<string, string> = { standard: "Standard", pro: "Pro", max: "Max" };

export function p12Line(plan: AccountPlan | string): string {
  return PROMPT_COPY.P12.body({ plan: NAMES[plan] ?? "your plan" });
}

/* ── The sidebar plan block ─────────────────────────────────────────────── */

export interface PlanBlock {
  note: string | null;
  cta: { label: string; href: string };
}

/** Jooma 4.5. P1's chip on the trial: the actual end date, never a count of
 *  days, and no ticking countdown. */
export function planBlockV45(plan: AccountPlan, trialEndsAt: Date | null): PlanBlock {
  if (plan === "pro_trial") {
    return {
      note: trialEndsAt ? PROMPT_COPY.P1.chip({ ends: trialDateShort(trialEndsAt) }) : null,
      cta: { label: "Keep Pro", href: "/pricing?plan=pro" },
    };
  }
  if (plan === "free") {
    return {
      note: `${PLAN_CONFIG.free.resources} resources every Sunday`,
      cta: { label: "Go Pro", href: "/pricing?plan=pro" },
    };
  }
  if (plan === "standard") return { note: null, cta: { label: "Upgrade", href: "/pricing?plan=pro" } };
  return { note: null, cta: { label: "See plans", href: "/pricing" } };
}
