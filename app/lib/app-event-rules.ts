// The decisions behind three Step 7 events (Jooma 4.5 spec, Phase 1). Pure, so
// tests/unit/app-event-rules.spec.ts pins them; the routes only read and write.

const DAY_MS = 86_400_000;

/** How long after saving a run its resource_made may still be reported. */
export const FRESH_RUN_MS = 10 * 60_000;

/** Prompts that can lead to a checkout (spec Step 5). */
const PROMPT_IDS = new Set(["P1", "P2", "P3", "P3b", "P4", "P5", "P12"]);

/**
 * "activated": the second resource made within 7 days of signup, once ever.
 * `madeAt` is every resource_made so far, including the one just recorded.
 */
export function activation(input: {
  signupAt: Date | null;
  madeAt: Date[];
  alreadyActivated: boolean;
  now: Date;
}): { activate: boolean; daysSinceSignup: number } {
  const { signupAt, madeAt, alreadyActivated, now } = input;
  if (!signupAt) return { activate: false, daysSinceSignup: 0 };
  const daysSinceSignup = Math.floor((now.getTime() - signupAt.getTime()) / DAY_MS);
  if (alreadyActivated) return { activate: false, daysSinceSignup };
  const within = madeAt.filter((d) => {
    const gap = d.getTime() - signupAt.getTime();
    return gap >= 0 && gap <= 7 * DAY_MS;
  });
  return { activate: within.length >= 2, daysSinceSignup };
}

/** Only a run saved moments ago is reported, so an old id cannot be replayed. */
export function isFreshRun(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= -60_000 && age <= FRESH_RUN_MS;
}

/** with_pictures: the run asked for generated pictures, alone or mixed. */
export function runUsesPictures(input: Record<string, unknown> | null | undefined): boolean {
  const source = input?.imageSource;
  return source === "ai" || source === "auto";
}

/** checkout_started's source_prompt: a known prompt id, or nothing. */
export function sourcePrompt(value: unknown): string | null {
  return typeof value === "string" && PROMPT_IDS.has(value) ? value : null;
}

/** signup_completed: once, and only for an account made in the last day. An
 *  older account reaching the trial route (a launch-day trial starting at its
 *  next visit) did not just sign up. */
export function isNewSignup(createdAt: string | null | undefined, now: Date, alreadyRecorded: boolean): boolean {
  if (alreadyRecorded || !createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= DAY_MS;
}

/** The ?code= / ?ref= the browser kept, if it looks like one. */
export function cleanRefCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9-]{2,32}$/.test(code) ? code : null;
}
