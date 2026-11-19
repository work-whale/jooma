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
import { OFFER, PLAN_CONFIG, TRIAL } from "@/app/lib/plan-config";
import { nextLondonMidnight } from "@/app/lib/resource-periods";

export type PromptId = "P1" | "P2" | "P3" | "P3b" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9" | "P10" | "P12";
export type PromptKind = "chip" | "banner" | "popup" | "sheet" | "line" | "note" | "card";

interface PromptRule {
  kind: PromptKind;
  audience: AccountPlan[];
  /** Days hidden after "Not now". `null` = shows every time. "day" = rest of UK day. */
  snooze: number | "day" | null;
  /** Shows once per account, ever. */
  once?: boolean;
  /** At most once a UK day (P6) or once per allowance period (P9, P10). */
  limit?: "day" | "period";
}

const RULES: Record<PromptId, PromptRule> = {
  P1: { kind: "banner", audience: ["pro_trial"], snooze: "day" },
  P2: { kind: "popup", audience: ["free"], snooze: 7, once: true },
  P3: { kind: "sheet", audience: ["free", "pro_trial"], snooze: null },
  // Phase 2. The server decides when (the second run-out in a different UK
  // week, see run-out-offer.ts); here it is a pop-up, once per account.
  P3b: { kind: "popup", audience: ["free"], snooze: null, once: true },
  P4: { kind: "line", audience: ["free"], snooze: null },
  P5: { kind: "sheet", audience: ["free", "standard"], snooze: null },
  // Phase 2. P6: Standard exports are clean (red note), and the trial carries
  // the mark, so Free and the trial. Once a UK day; closing it snoozes 7 days.
  P6: { kind: "note", audience: ["free", "pro_trial"], snooze: 7, limit: "day" },
  // P7's line and sheet answer what the teacher just did: every time.
  P7: { kind: "sheet", audience: ["free"], snooze: null },
  // P8 is always on, for everyone.
  P8: { kind: "card", audience: ["pro_trial", "free", "standard", "pro", "max"], snooze: null },
  // P9 and P10: once per allowance period ("once per month").
  P9: { kind: "banner", audience: ["standard"], snooze: 7, limit: "period" },
  P10: { kind: "line", audience: ["standard"], snooze: null, limit: "period" },
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
  /** For a prompt with a limit: the current day or period (limitKey), and
   *  the one it last showed in. Equal means it already showed this time. */
  limitKey?: string | null;
  lastShownKey?: string | null;
}

export function canShowPrompt(id: PromptId, c: PromptContext): boolean {
  const r = RULES[id];
  if (c.presenting) return false;
  if (!r.audience.includes(c.plan)) return false;
  if (r.once && c.shownBefore) return false;
  if (r.kind === "popup" && c.popupShownThisVisit) return false;
  if (r.snooze !== null && c.dismissedUntil && c.now.getTime() < c.dismissedUntil.getTime()) return false;
  if (r.limit && c.limitKey && c.lastShownKey === c.limitKey) return false;
  return true;
}

const UK_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** The UK calendar date, "2026-11-19". */
export function ukDateKey(at: Date): string {
  return UK_DAY.format(at);
}

/**
 * Which "day" or "month" a limited prompt is in. P6: the UK date. P9 and P10:
 * the allowance period, keyed by its start, so a refill opens a new month;
 * with no period known, the UK calendar month. Null for unlimited prompts.
 */
export function limitKey(id: PromptId, now: Date, periodStart?: Date | null): string | null {
  const l = RULES[id].limit;
  if (!l) return null;
  if (l === "day") return ukDateKey(now);
  if (periodStart) return periodStart.toISOString();
  return ukDateKey(now).slice(0, 7);
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
/** "£3": what Pro costs over Standard each month (P9, P10, E11). */
const extra = Math.round((PRO.monthly - PLAN_CONFIG.standard.monthly) * 100) / 100;
export const PRO_EXTRA = `£${Number.isInteger(extra) ? extra : extra.toFixed(2)}`;

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
  P3b: {
    title: `Your first month of Pro for £${OFFER.firstMonthPrice}.`,
    body: (v: { ends: string }) =>
      "You've run out twice now, so Free isn't keeping up with your planning. " +
      `Your first month of Pro is half price. This offer ends on ${v.ends}.`,
    buttons: [`Get Pro for £${OFFER.firstMonthPrice}`, "Wait for Sunday"],
  },
  P5: {
    title: "Generated pictures come with Pro.",
    body: "This deck will use library photos for now.",
    buttons: ["Go Pro", "Use library photos"],
  },
  P6: {
    free: { text: "Exported. Pro exports don't have the Jooma mark.", button: "Go Pro" },
    trial: { text: "Exported. Once you choose Pro, exports don't have the Jooma mark.", button: "Keep Pro" },
  },
  P7: {
    title: "That's this week's 10 refines.",
    body: "They come back on Sunday. Pro refines as often as you like.",
    buttons: ["Go Pro", "OK"],
  },
  P8: {
    line: (v: { made: number; hours: number }) =>
      `This month: ${n(v.made)} ${v.made === 1 ? "resource" : "resources"}, about ${n(v.hours)} ${v.hours === 1 ? "hour" : "hours"} saved.`,
    none: "Nothing made yet this month.",
    link: "See what Pro adds",
  },
  P9: {
    text: (v: { used: number; allowance: number; refill: string }) =>
      `You've used ${n(v.used)} of your ${n(v.allowance)} resources, and they refill on ${v.refill}. ` +
      `Pro gives you double the resources and generated pictures for ${PRO_EXTRA} more a month.`,
    buttons: ["Switch to Pro", "Top up"],
  },
  P10: {
    text:
      `Pro gives you ${n(PRO.resources - PLAN_CONFIG.standard.resources)} more resources every month for ${PRO_EXTRA} more, ` +
      "plus generated pictures.",
    buttons: ["Switch to Pro instead", "Buy top-up"],
  },
  P12: {
    body: (v: { plan: string }) => `Your last payment didn't go through. Update your card to keep ${v.plan}.`,
    buttons: ["Update card"],
  },
} as const;
