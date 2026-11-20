/*
 * The switch for the automatic teacher emails (Jooma 4.5 spec Step 6).
 *
 * Until 20 Nov this was the Vercel variable LIFECYCLE_EMAILS=on. The owner
 * asked for it in Admin, Emails & templates instead, so it now lives in
 * app_settings under LIFECYCLE_SETTING_KEY as { enabled, off: [ids] }: one
 * master switch, and any single email turned off on its own.
 *
 * Safe by default, the opposite of settings.ts: anything unreadable or
 * malformed is OFF, because a bug here must never start mailing real
 * teachers. LIFECYCLE_EMAILS in Vercel, set to anything but "on", stays as an
 * emergency stop that beats the admin switch. E16 (sent by hand from Admin, Plans) and the
 * Monday schools list are not lifecycle emails and ignore this.
 *
 * Pure.
 */

import type { EmailKind, LifecycleId } from "@/app/lib/lifecycle";
import { LIFECYCLE_IDS, type LifecycleVars } from "@/app/lib/lifecycle-emails";

export const LIFECYCLE_SETTING_KEY = "lifecycle_emails";

export interface LifecycleSwitch {
  enabled: boolean;
  off: LifecycleId[];
}

const OFF: LifecycleSwitch = { enabled: false, off: [] };
const KNOWN: ReadonlySet<string> = new Set(LIFECYCLE_IDS);

export function parseLifecycleSwitch(value: unknown): LifecycleSwitch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return OFF;
  const v = value as { enabled?: unknown; off?: unknown };
  if (typeof v.enabled !== "boolean") return OFF;
  const off = Array.isArray(v.off) ? v.off.filter((x): x is LifecycleId => typeof x === "string" && KNOWN.has(x)) : [];
  return { enabled: v.enabled, off };
}

/** May the cron send this email now? */
export function lifecycleMaySend(
  sw: LifecycleSwitch,
  id: LifecycleId,
  env: Record<string, string | undefined>,
): boolean {
  if (emergencyStop(env)) return false;
  return sw.enabled && !sw.off.includes(id);
}

/** LIFECYCLE_EMAILS set to anything but "on" (any spelling of off, a typo)
 *  stops every lifecycle email. Unset or "on" leaves it to the admin switch. */
export function emergencyStop(env: Record<string, string | undefined>): boolean {
  const v = (env.LIFECYCLE_EMAILS ?? "").trim().toLowerCase();
  return v !== "" && v !== "on";
}

/** The emails as the admin page lists them, in the order a teacher meets them. */
export const LIFECYCLE_CATALOGUE: readonly { id: LifecycleId; when: string; to: string; kind: EmailKind }[] = [
  { id: "E1", when: "Straight after signup", to: "Pro trial", kind: "account" },
  { id: "E2a", when: "Day 1, 16:30, nothing made yet", to: "Pro trial", kind: "account" },
  { id: "E2b", when: "Day 1, 16:30, something made", to: "Pro trial", kind: "account" },
  { id: "E3", when: "Day 3, 16:30", to: "Pro trial", kind: "account" },
  { id: "E4", when: "Day 5, 16:30", to: "Pro trial", kind: "account" },
  { id: "E5", when: "Day 8, 16:30", to: "Pro trial", kind: "account" },
  { id: "E6", when: "Day 10, 07:30 (the last day)", to: "Pro trial", kind: "account" },
  { id: "E7", when: "Day 11, 07:30", to: "Free, just out of the trial", kind: "account" },
  { id: "E8", when: "Every Sunday, 16:00", to: "Free", kind: "account" },
  { id: "E9a", when: "1 hour after running out, once a week at most", to: "Free, ticked the box", kind: "marketing" },
  { id: "E9b", when: "1 hour after running out a second time, once", to: "Free, ticked the box", kind: "marketing" },
  { id: "E10", when: "16:30 after 14 days with no visit", to: "Free, ticked the box", kind: "marketing" },
  { id: "E11", when: "80% used with more than 7 days to the refill", to: "Standard", kind: "account" },
  { id: "E12", when: "A new plan's first payment", to: "Standard, Pro, Max", kind: "account" },
  { id: "E13", when: "The teacher cancels", to: "Standard, Pro, Max", kind: "account" },
  { id: "E14", when: "A payment fails", to: "Standard, Pro, Max", kind: "account" },
];

/** Example values for the admin preview. Never sent. */
export function sampleLifecycleVars(): LifecycleVars {
  return {
    firstName: "Sam",
    trialEnds: "Wednesday 25 November",
    trialEndsDay: "Wednesday",
    made: 6,
    hours: 3,
    plan: "Pro",
    resources: 1000,
    refill: "12 December",
    planEnds: "3 December",
    firstTitle: "Year 4 states of matter",
    offerEnds: "Sunday 6 December",
    offerEndsDay: "Sunday",
    used: 400,
    idea: { text: "a 10 question retrieval quiz on last week's topic", href: "/tools/quiz-generator", cost: 1 },
  };
}
