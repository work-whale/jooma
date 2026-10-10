// ── Who may start a free generation, and when ────────────────────────────────
//
// The rules for /create, kept pure so they can be tested without a database:
//
//   * an admin switch (app_settings.trial_enabled) turns the whole thing off
//   * a global cap per day (app_settings.trial_daily_cap) is the spend brake
//   * FREE_TRIES_PER_DAY generations per 24 hours, across both tools, counted
//     by guest cookie AND by IP, so clearing cookies does not reset it and
//     neither does a new network
//
// A failed run does not count. The visitor got nothing, and burning one of
// their tries on our error would be the worst first impression we could make.
import { createHash } from "node:crypto";

export type TrialTool = "slideshow" | "comprehension-generator";

export const TRIAL_TOOLS: readonly TrialTool[] = ["slideshow", "comprehension-generator"];
export const TRIAL_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Statuses that used up a try. `failed` deliberately absent. */
export const COUNTED_STATUSES = ["running", "done", "claimed"] as const;
export const DEFAULT_DAILY_CAP = 300;
/** Free generations per visitor per 24 hours, Slides and Comprehension together. */
export const FREE_TRIES_PER_DAY = 3;

/** Messages a visitor may send Jo about one free generation before signing up.
 *  Every message counts, typed or tapped. */
export const GUEST_JO_PROMPTS = 3;

/** How many of a free try's Jo prompts are left, from the number used. */
export function joPromptsLeft(used: number): number {
  const n = Number.isFinite(used) ? Math.floor(used) : GUEST_JO_PROMPTS;
  return Math.max(0, Math.min(GUEST_JO_PROMPTS, GUEST_JO_PROMPTS - n));
}

export type TrialDecision =
  | { ok: true }
  | { ok: false; reason: "disabled" | "daily_cap" | "used" };

export function decideTrial(input: {
  enabled: boolean;
  dailyCap: number;
  /** Counted runs started by anyone in the last 24 hours. */
  startedToday: number;
  /** Counted runs, of either tool, by this guest cookie in the window. */
  guestRuns: number;
  /** Counted runs, of either tool, from this IP in the window. */
  ipRuns: number;
}): TrialDecision {
  if (!input.enabled) return { ok: false, reason: "disabled" };
  if (input.startedToday >= Math.max(0, input.dailyCap)) return { ok: false, reason: "daily_cap" };
  if (input.guestRuns >= FREE_TRIES_PER_DAY || input.ipRuns >= FREE_TRIES_PER_DAY) {
    return { ok: false, reason: "used" };
  }
  return { ok: true };
}

/** The visitor facing line for each refusal. No dashes, no "AI". */
export function trialRefusalMessage(reason: "disabled" | "daily_cap" | "used"): string {
  switch (reason) {
    case "used":
      return "You have used today's three free tries. Sign up to keep going, it is free to start.";
    case "daily_cap":
      return "Free tries are busy right now. Sign up and you can make it straight away.";
    case "disabled":
    default:
      return "Free tries are paused for the moment. Sign up and you can make it straight away.";
  }
}

export function isTrialTool(value: unknown): value is TrialTool {
  return typeof value === "string" && (TRIAL_TOOLS as readonly string[]).includes(value);
}

/**
 * The IP as stored: a keyed hash, never the address itself. Keyed with the
 * trial secret so the column cannot be reversed with a rainbow table of the
 * IPv4 space, which is small enough to precompute.
 */
export function hashIp(ip: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${ip.trim().toLowerCase()}`).digest("hex");
}

/** Read an app_settings jsonb value as a boolean, falling back on anything odd. */
export function settingBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Read an app_settings jsonb value as a non negative integer. */
export function settingInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
