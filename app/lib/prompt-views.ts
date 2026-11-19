/*
 * What the Phase 1 prompts put on screen (Jooma 4.5 spec Step 5, and Step 2
 * "Running out"). The rules for WHEN they show are in prompts.ts; this turns
 * the account and the server's 402 payload into words and buttons.
 *
 * Pure: shared by the sidebar, the tool chrome, UpgradeGate and the tests.
 */

import { minutesSavedFor, PLAN_CONFIG, type AccountPlan } from "@/app/lib/plan-config";
import { PROMPT_COPY, ukDateKey } from "@/app/lib/prompts";
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
export function costLine(slug: string, left: number, opts: { pictures?: number } = {}): CostLine {
  const estimate = estimateFor(slug, opts);
  const check = estimateCheck(estimate, left);
  if (!check.ok) return { enough: false, text: check.message };
  const need = roundEstimate(estimate);
  return {
    enough: true,
    text: `Usually about ${need} ${need === 1 ? "resource" : "resources"}. You have ${n(Math.max(0, Math.floor(left)))}.`,
  };
}

/* ── P4, low resources (Phase 2) ─────────────────────────────────────────── */

/** Free with under 20 left, while the tool is still affordable: one line in
 *  the form, every time. Null otherwise (P3 covers not enough). */
export function p4Line(plan: AccountPlan | string, left: number, affordable: boolean): string | null {
  if (plan !== "free" || !affordable || !(left < 20)) return null;
  const have = Math.max(0, Math.floor(left));
  return `${n(have)} ${have === 1 ? "resource" : "resources"} left this week. You'll be back to ${PLAN_CONFIG.free.resources} on Sunday.`;
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

/* ── Phase 2: P6 to P10 ─────────────────────────────────────────────────── */

/** P6, after an export finishes: Free and the trial (their exports carry the
 *  mark). Null for the clean plans. */
export function p6View(plan: AccountPlan | string): { text: string; button: string } | null {
  if (plan === "free") return { ...PROMPT_COPY.P6.free };
  if (plan === "pro_trial") return { ...PROMPT_COPY.P6.trial };
  return null;
}

/** P7's sheet, once all 10 of the week's refines are used. */
export function p7Sheet(): { title: string; body: string; buttons: string[] } {
  const c = PROMPT_COPY.P7;
  return { title: c.title, body: c.body, buttons: [...c.buttons] };
}

/** P8: resources made this UK calendar month, and the minutes they saved at
 *  the spec's band rates (the same rates P2 and the emails use). */
export function p8Totals(
  runs: ReadonlyArray<{ tool_slug: string | null; created_at: string }>,
  now: Date,
): { made: number; minutes: number } {
  const month = ukDateKey(now).slice(0, 7);
  let made = 0;
  let minutes = 0;
  for (const r of runs) {
    const t = new Date(r.created_at);
    if (Number.isNaN(t.getTime()) || t.getTime() > now.getTime()) continue;
    if (ukDateKey(t).slice(0, 7) !== month) continue;
    made += 1;
    minutes += minutesSavedFor(r.tool_slug ?? "");
  }
  return { made, minutes };
}

/** P8's line on Today, with "See what Pro adds" on Free and Standard. */
export function p8View(v: { plan: AccountPlan | string; made: number; minutes: number }): { text: string; link: string | null } {
  const c = PROMPT_COPY.P8;
  const link = v.plan === "free" || v.plan === "standard" ? c.link : null;
  if (v.made <= 0) return { text: c.none, link };
  return { text: c.line({ made: v.made, hours: hoursSaved(v.minutes) }), link };
}

const DAY_MS = 86_400_000;

/** P9 and E11: 80% or more of the allowance used, with more than 7 days to
 *  the refill. Top-ups are not part of the allowance. */
export function runningLow(v: { allowance: number; allowanceLeft: number; nextRefillAt: Date | null; now: Date }): boolean {
  if (!(v.allowance > 0) || !v.nextRefillAt) return false;
  const used = v.allowance - Math.max(0, Math.min(v.allowance, v.allowanceLeft));
  if (used * 5 < v.allowance * 4) return false;
  return v.nextRefillAt.getTime() - v.now.getTime() > 7 * DAY_MS;
}

const REFILL = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long" });

/** "3 December", in UK time. */
export function refillDate(d: Date): string {
  return REFILL.format(d);
}

/** P9, the banner on Today for Standard running low. */
export function p9View(v: {
  plan: AccountPlan | string;
  allowance: number;
  allowanceLeft: number;
  nextRefillAt: Date | null;
  now: Date;
}): { text: string; buttons: string[] } | null {
  if (v.plan !== "standard" || !runningLow(v) || !v.nextRefillAt) return null;
  const used = v.allowance - Math.max(0, Math.min(v.allowance, v.allowanceLeft));
  return {
    text: PROMPT_COPY.P9.text({ used, allowance: v.allowance, refill: refillDate(v.nextRefillAt) }),
    buttons: [...PROMPT_COPY.P9.buttons],
  };
}

/** P10, the line at the top of the top-up picker, Standard only. */
export function p10Line(plan: AccountPlan | string): string | null {
  return plan === "standard" ? PROMPT_COPY.P10.text : null;
}
