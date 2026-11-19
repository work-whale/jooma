// How long a guest's free tries from /create are kept.
//
// One number for everything that depends on it: the "Your creations" list on
// /create, claiming the tries into a new account, the guest cookie's lifetime
// and the nightly cleanup that reclaims their pictures
// (app/api/cron/guest-cleanup). It was thirty days until Nov 2026, when
// unclaimed guest decks were holding 378 MB of a 1 GB storage quota.
//
// Pure, safe from either side.

export const TRIAL_RETENTION_DAYS = 14;

export const TRIAL_RETENTION_MS = TRIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Tries created at or before this moment are past keeping. */
export function trialRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - TRIAL_RETENTION_MS);
}

/** Whether a try created at `createdAt` is past keeping. An unreadable date is
 *  never expired: losing a guest's deck to a parse error is the worse mistake. */
export function isPastRetention(createdAt: string, now: Date = new Date()): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= trialRetentionCutoff(now).getTime();
}
