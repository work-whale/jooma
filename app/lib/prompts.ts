/*
 * The in-app prompts (Jooma 4.5 spec Step 5). Phase 1: P1, P2, P3, P5, P12.
 * Phase 2 (P3b, P4, P6, P7 sheet, P8 to P11) adds to the same tables.
 *
 * Rules for every prompt:
 *   1. Never while slides are presented to a class (Editor present mode,
 *      QuizPresenter): `presenting` blocks everything, sheets included.
 *   2. At most one pop-up (P2, P3b) per visit. Sheets that answer something
 *      the teacher just did (P3, P5, P7) always show.
 *   3. "Not now" or closing hides it for 7 days, except P3 and P5, which show
 *      every time. P1's banner hides for the rest of the UK day.
 *   4. Every Go Pro / Keep Pro opens the plan picker on Pro.
 *   5. prompt_shown / prompt_clicked / prompt_dismissed are logged with the id.
 *
 * Copy: "resources", never "credits"; no dashes; never "AI"; UK spelling; no
 * red, no warning icons, no ticking countdowns. Red notes applied: the trial
 * has the Jooma mark too, so P1 sells "no Jooma mark" rather than "clean
 * exports" being something the trial already has.
 *
 * Pure.
 */

import type { AccountPlan } from "@/app/lib/plan-config";
import { PLAN_CONFIG, TRIAL } from "@/app/lib/plan-config";
import { nextLondonMidnight } from "@/app/lib/resource-periods";

export type PromptId = "P1" | "P2" | "P3" | "P5" | "P12";
export type PromptKind = "chip" | "banner" | "popup" | "sheet";

interface PromptRule {
  kind: PromptKind;
  audience: AccountPlan[];
  /** Days hidden after "Not now". `null` = shows every time. "day" = rest of UK day. */
  snooze: number | "day" | null;
  /** Shows once per account, ever. */
  once?: boolean;
}

const RULES: Record<PromptId, PromptRule> = {
  P1: { kind: "banner", audience: ["pro_trial"], snooze: "day" },
  P2: { kind: "popup", audience: ["free"], snooze: 7, once: true },
  P3: { kind: "sheet", audience: ["free", "pro_trial"], snooze: null },
  P5: { kind: "sheet", audience: ["free", "standard"], snooze: null },
  P12: { kind: "banner", audience: ["standard", "pro", "max"], snooze: 7 },
};

export function promptAudience(id: PromptId): AccountPlan[] {
  return RULES[id].audience;
}

export function promptKind(id: PromptId): PromptKind {
  return RULES[id].kind;
}

export interface PromptContext {
  plan: AccountPlan;
  /** Slides or a quiz are being presented to a class. */
  presenting: boolean;
  /** A pop-up (P2, P3b) has already shown on this visit. */
  popupShownThisVisit: boolean;
  /** When the last "Not now" for this prompt runs out. */
  dismissedUntil: Date | null;
  /** This prompt has been shown to this account before. */
  shownBefore: boolean;
  now: Date;
}

export function canShowPrompt(id: PromptId, c: PromptContext): boolean {
  const r = RULES[id];
  if (c.presenting) return false;
  if (!r.audience.includes(c.plan)) return false;
  if (r.once && c.shownBefore) return false;
  if (r.kind === "popup" && c.popupShownThisVisit) return false;
  if (r.snooze !== null && c.dismissedUntil && c.now.getTime() < c.dismissedUntil.getTime()) return false;
  return true;
}

const DAY_MS = 86_400_000;

/** When a "Not now" runs out, or null when the prompt shows every time. */
export function dismissUntil(id: PromptId, now: Date): Date | null {
  const s = RULES[id].snooze;
  if (s === null) return null;
  if (s === "day") return nextLondonMidnight(now);
  return new Date(now.getTime() + s * DAY_MS);
}

const n = (v: number) => v.toLocaleString("en-GB");
const PRO = PLAN_CONFIG.pro;
const FREE = PLAN_CONFIG.free;

export const PROMPT_COPY = {
  P1: {
    chip: (v: { ends: string }) => `Pro trial until ${v.ends}`,
    banner: (v: { ends: string }) =>
      `Your Pro trial ends on ${v.ends}. Keep generated pictures, no Jooma mark and ${n(PRO.resources)} resources a month.`,
    buttons: ["Keep Pro", "Compare plans"],
  },
  P2: {
    title: `Your ${TRIAL.days} days of Pro have ended.`,
    body: (v: { made: number; hours: number }) =>
      `You made ${n(v.made)} ${v.made === 1 ? "resource" : "resources"} and saved about ${n(v.hours)} ${v.hours === 1 ? "hour" : "hours"}. ` +
      `You're on Free now: everything you made is safe, you have ${FREE.resources} resources to use today, and ${FREE.resources} more arrive every Sunday.`,
    buttons: [`Keep Pro, £${PRO.monthly} a month`, `Standard, £${PLAN_CONFIG.standard.monthly}`, "Carry on with Free"],
  },
  P3: {
    free: {
      title: "That's this week's free resources used.",
      body: `${FREE.resources} more arrive on Sunday. Or keep going now with Pro: ${n(PRO.resources)} resources a month, generated pictures and no Jooma mark.`,
      buttons: ["Go Pro", "Wait for Sunday"],
    },
    trial: {
      title: `You've used all ${TRIAL.resources} trial resources.`,
      body: `Keep going with Pro now, or switch to Free and get ${FREE.resources} resources today and every Sunday.`,
      buttons: ["Keep Pro", "Switch to Free now"],
    },
  },
  P5: {
    title: "Generated pictures come with Pro.",
    body: "This deck will use library photos for now.",
    buttons: ["Go Pro", "Use library photos"],
  },
  P12: {
    body: (v: { plan: string }) => `Your last payment didn't go through. Update your card to keep ${v.plan}.`,
    buttons: ["Update card"],
  },
} as const;
